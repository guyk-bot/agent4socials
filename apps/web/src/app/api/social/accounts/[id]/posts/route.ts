import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform, PostStatus } from '@prisma/client';
import axios, { type AxiosResponse } from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';

/** GET: list imported posts for this account. ?sync=1 to sync from platform first then return. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  try {
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await params;
    const account = await prisma.socialAccount.findFirst({
      where: { id, userId },
      select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, expiresAt: true, username: true },
    });
    if (!account) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }
    if (!account.accessToken) {
      return NextResponse.json({ posts: [], syncError: 'Reconnect your account to sync posts.' }, { status: 200 });
    }
    // Auto-refresh YouTube tokens before sync
    if (account.platform === 'YOUTUBE') {
      account.accessToken = await getValidYoutubeToken(account);
    }
    const sync = request.nextUrl.searchParams.get('sync') === '1';
    let syncError: string | undefined;
    if (sync) {
      try {
        syncError = await syncImportedPosts(account.id, account.platform, account.platformUserId, account.accessToken);
      } catch (e) {
        console.error('[Imported posts] sync error:', e);
        const msg = (e as Error)?.message ?? '';
        const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
        syncError = metaMsg || msg || 'Sync failed. Try reconnecting your account.';
      }
    }

    // Get posts synced/imported from platform
    const importedRows = await prisma.importedPost.findMany({
      where: { socialAccountId: account.id },
      orderBy: { publishedAt: 'desc' },
      take: 500,
    });
    const importedPostIds = new Set(importedRows.map((p) => p.platformPostId));

    // Also include posts published via the app (postTargets) not already in importedPosts
    const appTargets = await prisma.postTarget.findMany({
      where: {
        socialAccountId: account.id,
        status: PostStatus.POSTED,
        platformPostId: { not: null },
      },
      include: { post: { select: { content: true, media: { select: { fileUrl: true, type: true }, take: 1 } } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    const serialized = importedRows.map((p) => ({
      id: p.id,
      content: p.content,
      thumbnailUrl: p.thumbnailUrl,
      permalinkUrl: p.permalinkUrl,
      impressions: p.impressions ?? 0,
      interactions: p.interactions ?? 0,
      publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : String(p.publishedAt),
      mediaType: p.mediaType,
      platform: p.platform,
    }));

    // App-published targets not yet in importedPosts
    const appExtra = appTargets
      .filter((t) => !importedPostIds.has(t.platformPostId!))
      .map((t) => ({
        id: `target-${t.id}`,
        content: t.post?.content ?? null,
        thumbnailUrl: t.post?.media[0]?.fileUrl ?? null,
        permalinkUrl: null,
        impressions: 0,
        interactions: 0,
        publishedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
        mediaType: t.post?.media[0]?.type ?? null,
        platform: account.platform,
      }));

    const posts = [...serialized, ...appExtra].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return NextResponse.json({ posts, syncError });
  } catch (e) {
    console.error('[Imported posts] GET error:', e);
    const msg = (e as Error)?.message ?? 'Server error while loading posts.';
    return NextResponse.json({ posts: [], syncError: msg }, { status: 200 });
  }
}

async function syncImportedPosts(
  socialAccountId: string,
  platform: Platform,
  platformUserId: string,
  accessToken: string
): Promise<string | undefined> {
  const baseUrl = 'https://graph.facebook.com/v18.0';
  if (platform === 'INSTAGRAM') {
    type MediaItem = {
      id: string;
      media_type?: string;
      media_url?: string;
      permalink?: string;
      caption?: string;
      timestamp?: string;
      thumbnail_url?: string;
      like_count?: number;
      comments_count?: number;
    };
    type MediaPage = {
      data?: Array<MediaItem>;
      paging?: { next?: string; cursors?: { before?: string; after?: string } };
    };
    const fields = 'id,media_type,media_url,permalink,caption,timestamp,thumbnail_url,like_count,comments_count';
    const allItems: Array<MediaItem> = [];
    const maxMedia = 500;
    const pageLimit = 50;
    // Do NOT use since/until timestamps — they can incorrectly restrict results when the Instagram
    // Media API interprets them as time-window filters. Use pure cursor-based pagination instead.
    const firstParams: Record<string, string | number> = {
      fields,
      access_token: accessToken,
      limit: pageLimit,
    };
    let nextUrl: string | null = `${baseUrl}/${platformUserId}/media`;
    try {
      while (nextUrl && allItems.length < maxMedia) {
        const isFirst = !nextUrl.includes('?');
        const res: AxiosResponse<MediaPage> = await axios.get<MediaPage>(
          nextUrl,
          isFirst ? { params: firstParams } : {}
        );
        const page = res.data?.data ?? [];
        allItems.push(...page);
        const paging = res.data?.paging;
        const nextFromMeta = paging?.next;
        const afterCursor = paging?.cursors?.after;
        const gotFullPage = page.length >= pageLimit;
        if (nextFromMeta && allItems.length < maxMedia) {
          nextUrl = nextFromMeta;
        } else if (!nextFromMeta && afterCursor && gotFullPage && allItems.length < maxMedia) {
          nextUrl = `${baseUrl}/${platformUserId}/media?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}&limit=${pageLimit}&after=${encodeURIComponent(afterCursor)}`;
        } else {
          nextUrl = null;
        }
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Instagram account to sync posts.';
      }
      if (metaMsg) return metaMsg;
      throw e;
    }
    const items = allItems;
    for (const m of items) {
      const publishedAt = m.timestamp ? new Date(m.timestamp) : new Date();
      // For VIDEO posts, thumbnail_url is the poster frame; media_url is the video file itself.
      // Always prefer thumbnail_url for videos so we get an image, not a playable file URL.
      let thumbnailUrl: string | null =
        m.media_type === 'VIDEO'
          ? (m.thumbnail_url ?? m.media_url ?? null)
          : (m.media_url ?? m.thumbnail_url ?? null);
      if (!thumbnailUrl && m.media_type === 'CAROUSEL_ALBUM') {
        try {
          const childRes = await axios.get<{ data?: Array<{ media_url?: string }> }>(
            `${baseUrl}/${m.id}/children`,
            { params: { fields: 'media_url', access_token: accessToken } }
          );
          const first = childRes.data?.data?.[0];
          if (first?.media_url) thumbnailUrl = first.media_url;
        } catch {
          // ignore
        }
      }
      const likeCount = m.like_count ?? 0;
      const commentsCount = m.comments_count ?? 0;
      const interactions = likeCount + commentsCount;
      // Note: likeCount and commentsCount are not stored separately in DB (schema only has interactions).
      // They are passed in the sync response for live display only.
      let impressions = 0;
      try {
        // Fetch both impressions (total views) and reach (unique viewers).
        // Prefer impressions for the "Views" column — it matches what Instagram shows in-app.
        // Fall back to reach if impressions is unavailable (older accounts, Reels, Stories).
        const insightsRes = await axios.get<{
          data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
        }>(
          `${baseUrl}/${m.id}/insights`,
          { params: { metric: 'impressions,reach', access_token: accessToken } }
        );
        const data = insightsRes.data?.data ?? [];
        let reachVal = 0;
        for (const d of data) {
          const val = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
          if (d.name === 'impressions') impressions = val;
          if (d.name === 'reach') reachVal = val;
        }
        // If impressions was not returned (e.g. Reels/Stories only return reach), use reach
        if (impressions === 0 && reachVal > 0) impressions = reachVal;
      } catch {
        // insights not available for all media types (e.g. stories)
      }
      await prisma.importedPost.upsert({
        where: {
          socialAccountId_platformPostId: { socialAccountId, platformPostId: m.id },
        },
        update: {
          content: m.caption ?? null,
          thumbnailUrl,
          permalinkUrl: m.permalink ?? null,
          publishedAt,
          mediaType: m.media_type ?? null,
          impressions,
          interactions,
          syncedAt: new Date(),
        },
        create: {
          socialAccountId,
          platformPostId: m.id,
          platform,
          content: m.caption ?? null,
          thumbnailUrl,
          permalinkUrl: m.permalink ?? null,
          publishedAt,
          mediaType: m.media_type ?? null,
          impressions,
          interactions,
        },
      });
    }
    return undefined;
  }

  if (platform === 'FACEBOOK') {
    type FbPost = {
      id: string;
      message?: string;
      created_time?: string;
      full_picture?: string;
      permalink_url?: string;
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    };
    let res: { data?: { data?: Array<FbPost> } };
    try {
      res = await axios.get(
        `${baseUrl}/${platformUserId}/published_posts`,
        {
          params: {
            fields: 'id,message,created_time,full_picture,permalink_url,reactions.summary(1),comments.summary(1)',
            access_token: accessToken,
          },
        }
      );
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Facebook Page to sync posts.';
      }
      if (metaMsg) return metaMsg;
      throw e;
    }
    const items = res.data?.data ?? [];
    for (const p of items) {
      const publishedAt = p.created_time ? new Date(p.created_time) : new Date();
      const likeCount = p.reactions?.summary?.total_count ?? 0;
      const commentsCount = p.comments?.summary?.total_count ?? 0;
      const interactions = likeCount + commentsCount;
      await prisma.importedPost.upsert({
        where: {
          socialAccountId_platformPostId: { socialAccountId, platformPostId: p.id },
        },
        update: {
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: null,
          impressions: 0,
          interactions,
          syncedAt: new Date(),
        },
        create: {
          socialAccountId,
          platformPostId: p.id,
          platform,
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: null,
          impressions: 0,
          interactions,
        },
      });
    }
    return;
  }

  if (platform === 'TWITTER') {
    try {
      const tweetsRes = await axios.get<{
        data?: Array<{
          id: string;
          text?: string;
          created_at?: string;
          public_metrics?: {
            like_count?: number;
            retweet_count?: number;
            reply_count?: number;
            impression_count?: number;
            quote_count?: number;
          };
        }>;
      }>(`https://api.twitter.com/2/users/${platformUserId}/tweets`, {
        params: {
          max_results: 50,
          'tweet.fields': 'created_at,public_metrics',
          exclude: 'retweets,replies',
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const items = tweetsRes.data?.data ?? [];
      for (const t of items) {
        const publishedAt = t.created_at ? new Date(t.created_at) : new Date();
        const permalinkUrl = `https://x.com/i/status/${t.id}`;
        const impressions = t.public_metrics?.impression_count ?? 0;
        const interactions =
          (t.public_metrics?.like_count ?? 0) +
          (t.public_metrics?.retweet_count ?? 0) +
          (t.public_metrics?.reply_count ?? 0) +
          (t.public_metrics?.quote_count ?? 0);
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: { socialAccountId, platformPostId: t.id },
          },
          update: {
            content: t.text ?? null,
            permalinkUrl,
            publishedAt,
            impressions,
            interactions,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: t.id,
            platform: 'TWITTER',
            content: t.text ?? null,
            permalinkUrl,
            publishedAt,
            impressions,
            interactions,
          },
        });
      }
      return undefined;
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('OAuth') || msg.includes('401') || msg.includes('403')) return 'Reconnect your X (Twitter) account to sync posts.';
      throw e;
    }
  }

  if (platform === 'LINKEDIN') {
    try {
      // Fetch personal LinkedIn posts using the UGC Posts API (requires w_member_social scope)
      const personUrn = `urn:li:person:${platformUserId}`;
      const postsRes = await axios.get<{
        elements?: Array<{
          id?: string;
          specificContent?: {
            'com.linkedin.ugc.ShareContent'?: {
              shareCommentary?: { text?: string };
              shareMediaCategory?: string;
              media?: Array<{ thumbnails?: Array<{ url?: string }> }>;
            };
          };
          firstPublishedAt?: number;
          lifecycleState?: string;
        }>;
      }>('https://api.linkedin.com/v2/ugcPosts', {
        params: {
          q: 'authors',
          authors: `List(${encodeURIComponent(personUrn)})`,
          count: 50,
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });
      const items = postsRes.data?.elements ?? [];
      for (const p of items) {
        if (p.lifecycleState === 'DELETED') continue;
        const postId = p.id;
        if (!postId) continue;
        const publishedAt = p.firstPublishedAt ? new Date(p.firstPublishedAt) : new Date();
        const shareContent = p.specificContent?.['com.linkedin.ugc.ShareContent'];
        const content = shareContent?.shareCommentary?.text ?? null;
        const thumbnailUrl = shareContent?.media?.[0]?.thumbnails?.[0]?.url ?? null;
        const permalinkUrl = `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}`;
        await prisma.importedPost.upsert({
          where: {
            socialAccountId_platformPostId: { socialAccountId, platformPostId: postId },
          },
          update: {
            content,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: shareContent?.shareMediaCategory ?? null,
            impressions: 0,
            interactions: 0,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: postId,
            platform: 'LINKEDIN',
            content,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: shareContent?.shareMediaCategory ?? null,
            impressions: 0,
            interactions: 0,
          },
        });
      }
      return undefined;
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('401') || msg.includes('403') || msg.includes('permission')) {
        return 'Reconnect your LinkedIn account to sync posts.';
      }
      // LinkedIn sync failure is non-fatal
      return undefined;
    }
  }

  if (platform === 'TIKTOK') {
    try {
      type TikTokVideo = {
        id?: string;
        title?: string;
        cover_image_url?: string;
        create_time?: number;
        share_url?: string;
        like_count?: number;
        comment_count?: number;
        view_count?: number;
      };
      const fields = 'cover_image_url,id,title,create_time,share_url,like_count,comment_count,view_count';
      const allVideos: TikTokVideo[] = [];
      let cursor: number | string | undefined;
      let hasMore = true;
      let pages = 0;
      while (hasMore && pages < 10) {
        const body: { max_count: number; cursor?: number | string } = { max_count: 20 };
        if (cursor != null) body.cursor = cursor;
        const res = await axios.post<{
          data?: { videos?: TikTokVideo[]; cursor?: number | string; has_more?: boolean };
          error?: { code?: string; message?: string };
        }>(
          `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`,
          body,
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          }
        );
        const list = res.data?.data?.videos ?? [];
        allVideos.push(...list);
        if (res.data?.error?.code && res.data.error.code !== 'ok') {
          const msg = res.data.error.message || res.data.error.code;
          if (msg.includes('scope') || msg.includes('video.list')) return 'Add video.list scope in TikTok Developer Portal and reconnect to sync videos.';
          return msg;
        }
        cursor = res.data?.data?.cursor;
        // Rely on has_more only: TikTok can return fewer than 20 per page (e.g. 1 or 10), so don't require list.length >= 20
        hasMore = res.data?.data?.has_more === true;
        pages++;
      }

      for (const v of allVideos) {
        const videoId = v.id;
        if (!videoId) continue;
        const publishedAt = v.create_time ? new Date(v.create_time * 1000) : new Date();
        const title = v.title ?? null;
        const thumbnailUrl = v.cover_image_url ?? null;
        const permalinkUrl = v.share_url ?? `https://www.tiktok.com/@user/video/${videoId}`;
        const impressions = v.view_count ?? 0;
        const interactions = (v.like_count ?? 0) + (v.comment_count ?? 0);
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } },
          update: { content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, syncedAt: new Date() },
          create: { socialAccountId, platformPostId: videoId, platform: 'TIKTOK', content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions },
        });
      }
      return undefined;
    } catch (e) {
      const ax = e as { response?: { data?: { error?: { message?: string; code?: string } } } };
      const msg = (e as Error)?.message ?? '';
      const apiMsg = ax?.response?.data?.error?.message;
      if (msg.includes('403') || apiMsg?.toLowerCase().includes('scope')) return 'Add video.list scope and reconnect to sync TikTok videos.';
      if (msg.includes('401')) return 'Reconnect your TikTok account to sync videos.';
      return undefined;
    }
  }

  if (platform === 'YOUTUBE') {
    try {
      type YtPlaylistItem = {
        snippet?: {
          publishedAt?: string;
          title?: string;
          thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
          resourceId?: { videoId?: string };
        };
      };

      // Derive the uploads playlist ID directly from the channel ID.
      // YouTube channel IDs start with "UC"; their uploads playlist starts with "UU".
      // This avoids an extra API call and works even when contentDetails is unavailable.
      let uploadsPlaylistId: string | null = null;
      if (platformUserId.startsWith('UC')) {
        uploadsPlaylistId = 'UU' + platformUserId.slice(2);
      } else {
        // Fallback: fetch via contentDetails if channel ID is in unexpected format
        try {
          const chRes = await axios.get<{ items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> }>(
            'https://www.googleapis.com/youtube/v3/channels',
            { params: { part: 'contentDetails', mine: 'true' }, headers: { Authorization: `Bearer ${accessToken}` } }
          );
          uploadsPlaylistId = chRes.data?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads ?? null;
        } catch (e) {
          console.warn('[YouTube sync] channels.contentDetails fallback failed:', (e as Error)?.message ?? e);
        }
      }

      if (!uploadsPlaylistId) {
        return 'Could not determine YouTube uploads playlist. Try reconnecting your account.';
      }

      const allItems: YtPlaylistItem[] = [];
      let nextPageToken: string | null = null;
      let pages = 0;
      do {
        const params: Record<string, string | number | boolean> = {
          part: 'snippet',
          playlistId: uploadsPlaylistId,
          maxResults: 50,
        };
        if (nextPageToken) params.pageToken = nextPageToken;
        const res = await axios.get<{ items?: YtPlaylistItem[]; nextPageToken?: string }>(
          'https://www.googleapis.com/youtube/v3/playlistItems',
          { params, headers: { Authorization: `Bearer ${accessToken}` } }
        );
        allItems.push(...(res.data?.items ?? []));
        nextPageToken = res.data?.nextPageToken ?? null;
        pages++;
      } while (nextPageToken && allItems.length < 500 && pages < 10);

      // Fetch video statistics in batches of 50
      const videoIds = allItems
        .map((v) => v.snippet?.resourceId?.videoId)
        .filter((id): id is string => Boolean(id));

      const statsMap: Record<string, { viewCount: number; likeCount: number; commentCount: number }> = {};
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        try {
          const statsRes = await axios.get<{
            items?: Array<{ id: string; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }>;
          }>('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'statistics', id: batch.join(',') },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          for (const v of statsRes.data?.items ?? []) {
            statsMap[v.id] = {
              viewCount: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0,
              likeCount: v.statistics?.likeCount ? parseInt(v.statistics.likeCount, 10) : 0,
              commentCount: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : 0,
            };
          }
        } catch (e) {
          console.warn('[YouTube sync] videos.statistics batch failed:', (e as Error)?.message ?? e);
        }
      }

      for (const v of allItems) {
        const videoId = v.snippet?.resourceId?.videoId;
        if (!videoId) continue;
        const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : new Date();
        const title = v.snippet?.title ?? null;
        // Skip YouTube's placeholder titles for deleted/private videos
        if (title === 'Deleted video' || title === 'Private video') continue;
        const thumbnailUrl = v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url
          ?? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
        const permalinkUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const stats = statsMap[videoId] ?? { viewCount: 0, likeCount: 0, commentCount: 0 };
        const impressions = stats.viewCount;
        const interactions = stats.likeCount + stats.commentCount;
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } },
          update: { content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, syncedAt: new Date() },
          create: { socialAccountId, platformPostId: videoId, platform: 'YOUTUBE', content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions },
        });
      }

      return undefined;
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      const apiErr = (e as { response?: { data?: { error?: { message?: string; status?: string } } } })?.response?.data?.error;
      if (apiErr?.message) {
        console.error('[YouTube sync] API error:', apiErr);
        return `YouTube sync error: ${apiErr.message}`;
      }
      if (msg.includes('401') || msg.includes('403') || msg.includes('invalid_grant')) {
        return 'Reconnect your YouTube account to sync videos.';
      }
      console.error('[YouTube sync] unexpected error:', msg);
      return `YouTube sync failed: ${msg.slice(0, 200)}`;
    }
  }

  // Other platforms: no sync for now
  return undefined;
}
