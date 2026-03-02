import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform, PostStatus } from '@prisma/client';
import axios, { type AxiosResponse } from 'axios';

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
      select: { id: true, platform: true, platformUserId: true, accessToken: true, username: true },
    });
    if (!account) {
      return NextResponse.json({ message: 'Account not found' }, { status: 404 });
    }
    if (!account.accessToken) {
      return NextResponse.json({ posts: [], syncError: 'Reconnect your account to sync posts.' }, { status: 200 });
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
    const until = Math.floor(Date.now() / 1000);
    const since = until - 2 * 365 * 24 * 60 * 60;
    const firstParams: Record<string, string | number> = {
      fields,
      access_token: accessToken,
      limit: pageLimit,
      since,
      until,
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
          nextUrl = `${baseUrl}/${platformUserId}/media?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}&limit=${pageLimit}&after=${encodeURIComponent(afterCursor)}&since=${since}&until=${until}`;
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
      let thumbnailUrl: string | null = m.media_url ?? m.thumbnail_url ?? null;
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
      // Use like_count/comments_count from media fields (replaces deprecated impressions insights)
      const interactions = (m.like_count ?? 0) + (m.comments_count ?? 0);
      let impressions = 0;
      try {
        // Fetch views metric (replaces deprecated impressions for v22+)
        const insightsRes = await axios.get<{
          data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
        }>(
          `${baseUrl}/${m.id}/insights`,
          { params: { metric: 'views,reach', access_token: accessToken } }
        );
        const data = insightsRes.data?.data ?? [];
        for (const d of data) {
          const val = d.total_value?.value ?? d.values?.[0]?.value ?? 0;
          if (d.name === 'views' || d.name === 'reach') impressions = Math.max(impressions, val);
        }
      } catch {
        // insights may not be available for all media types
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
      const likes = p.reactions?.summary?.total_count ?? 0;
      const comments = p.comments?.summary?.total_count ?? 0;
      const interactions = likes + comments;
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

  // Other platforms: no sync for now
  return undefined;
}
