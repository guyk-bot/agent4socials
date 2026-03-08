import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';

/**
 * GET /api/social/accounts/[id]/comments
 * Returns recent comments on this account's posts (Instagram, Facebook, or X).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, refreshToken: true, expiresAt: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ comments: [], error: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK' && platform !== 'TWITTER' && platform !== 'YOUTUBE') {
    return NextResponse.json({ comments: [], error: 'Comments are only available for Instagram, Facebook, X, and YouTube.' });
  }

  // Auto-refresh YouTube tokens
  if (platform === 'YOUTUBE') {
    account.accessToken = await getValidYoutubeToken(account);
  }

  // Posts we published through the app
  const targets = await prisma.postTarget.findMany({
    where: {
      socialAccountId: account.id,
      platformPostId: { not: null },
      status: PostStatus.POSTED,
    },
    include: { post: { select: { id: true, content: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  });
  const targetPostIds = new Set(targets.map((t) => t.platformPostId!));

  // Synced (imported) posts from the platform so we can show comments on all posts, not only app-published
  const imported = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 30,
  });
  const importedPostsToFetch = imported.filter((p) => !targetPostIds.has(p.platformPostId));

  type PostSource = { platformPostId: string; postPreview: string; postTargetId: string; postPublishedAt?: string; postImageUrl?: string | null; postUrl?: string | null };
  const dbSources: PostSource[] = [
    ...targets.map((t) => ({
      platformPostId: t.platformPostId!,
      postPreview: (t.post?.content ?? '').slice(0, 80) || 'Post',
      postTargetId: t.id,
    })),
    ...importedPostsToFetch.map((p) => ({
      platformPostId: p.platformPostId,
      postPreview: (p.content ?? '').slice(0, 80) || 'Post',
      postTargetId: `imported-${p.id}`,
      postPublishedAt: p.publishedAt?.toISOString(),
      postImageUrl: p.thumbnailUrl ?? null,
      postUrl: p.permalinkUrl ?? null,
    })),
  ];

  const credJsonEarly = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { loginMethod?: string };
  const isInstagramBizEarly = platform === 'INSTAGRAM' && credJsonEarly.loginMethod === 'instagram_business';

  // If we have no DB posts to check, try fetching recent posts directly from the platform API
  // so the user sees comments even before they manually sync.
  let liveSources: PostSource[] = [];
  if (dbSources.length === 0 && (platform === 'INSTAGRAM' || platform === 'FACEBOOK')) {
    try {
      const liveToken = account.accessToken;
      if (platform === 'INSTAGRAM') {
        const mediaUrl = isInstagramBizEarly
          ? 'https://graph.instagram.com/v25.0/me/media'
          : `https://graph.facebook.com/v18.0/${account.platformUserId}/media`;
        const mediaRes = await axios.get<{ data?: Array<{ id: string; caption?: string; media_url?: string; thumbnail_url?: string }> }>(mediaUrl, {
          params: { fields: 'id,caption,media_url,thumbnail_url', limit: 20, access_token: liveToken },
          timeout: 15_000,
        });
        liveSources = (mediaRes.data?.data ?? []).map((m, i) => ({
          platformPostId: m.id,
          postPreview: (m.caption ?? '').slice(0, 80) || `Post ${i + 1}`,
          postTargetId: `live-${m.id}`,
          postImageUrl: m.media_url ?? m.thumbnail_url ?? null,
        }));
      } else if (platform === 'FACEBOOK') {
        const fbRes = await axios.get<{ data?: Array<{ id: string; message?: string; story?: string }> }>(
          `https://graph.facebook.com/v18.0/${account.platformUserId}/posts`,
          { params: { fields: 'id,message,story', limit: 20, access_token: liveToken }, timeout: 15_000 }
        );
        liveSources = (fbRes.data?.data ?? []).map((m, i) => ({
          platformPostId: m.id,
          postPreview: (m.message ?? m.story ?? '').slice(0, 80) || `Post ${i + 1}`,
          postTargetId: `live-${m.id}`,
        }));
      }
    } catch { /* if live fetch fails, proceed with empty sources */ }
  }

  const sources: PostSource[] = dbSources.length > 0 ? dbSources : liveSources;
  const credJson = credJsonEarly as { loginMethod?: string; igUserToken?: string };

  // Instagram Business Login: account.accessToken IS the long-lived Instagram User token.
  const isInstagramBusinessLogin = isInstagramBizEarly;
  const igUserToken = isInstagramBusinessLogin ? account.accessToken : null;

  const token = account.accessToken;
  const comments: Array<{
    commentId: string;
    postTargetId: string;
    platformPostId: string;
    accountId: string;
    postPreview: string;
    postImageUrl?: string | null;
    postPublishedAt?: string | null;
    postUrl?: string | null;
    text: string;
    authorName: string;
    authorPictureUrl?: string | null;
    createdAt: string;
    platform: string;
    isFromMe?: boolean;
  }> = [];
  let firstError: string | null = null;

  const accountId = account.id;

  // Pre-fetch Instagram media images and permalinks in bulk
  const igMediaImageMap = new Map<string, string>();
  const igMediaPermalinkMap = new Map<string, string>();
  if (platform === 'INSTAGRAM') {
    try {
      const mediaUrl = isInstagramBusinessLogin
        ? 'https://graph.instagram.com/v25.0/me/media'
        : `https://graph.facebook.com/v18.0/${account.platformUserId}/media`;
      const mediaRes = await axios.get<{ data?: Array<{ id: string; media_url?: string; thumbnail_url?: string; permalink?: string }> }>(mediaUrl, {
        params: { fields: 'id,media_url,thumbnail_url,permalink', limit: 50, access_token: token },
        timeout: 15_000,
      });
      for (const m of mediaRes.data?.data ?? []) {
        const url = m.media_url ?? m.thumbnail_url;
        if (url) igMediaImageMap.set(m.id, url);
        if (m.permalink) igMediaPermalinkMap.set(m.id, m.permalink);
      }
    } catch { /* ignore, fallback to other methods */ }
    // Always override with fresh URLs (DB thumbnailUrls may be expired CDN links)
    for (const src of sources) {
      if (igMediaImageMap.has(src.platformPostId)) {
        src.postImageUrl = igMediaImageMap.get(src.platformPostId)!;
      }
      if (!src.postUrl && igMediaPermalinkMap.has(src.platformPostId)) {
        src.postUrl = igMediaPermalinkMap.get(src.platformPostId)!;
      }
    }
  }

  async function getPostImageUrl(postId: string, plat: string, accessToken: string): Promise<string | null> {
    try {
      if (plat === 'FACEBOOK') {
        const r = await axios.get<{ full_picture?: string; picture?: string }>(
          `https://graph.facebook.com/v18.0/${postId}`,
          { params: { fields: 'full_picture,picture', access_token: accessToken } }
        );
        const url = r.data?.full_picture ?? r.data?.picture ?? null;
        if (url) return url;
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? null;
      }
      if (plat === 'INSTAGRAM') {
        // First check pre-fetched media map (most reliable)
        if (igMediaImageMap.has(postId)) return igMediaImageMap.get(postId)!;
        // Fallback to individual API calls
        try {
          const r = await axios.get<{ media_url?: string; thumbnail_url?: string }>(
            `https://graph.facebook.com/v18.0/${postId}`,
            { params: { fields: 'media_url,thumbnail_url', access_token: accessToken } }
          );
          const url = r.data?.media_url ?? r.data?.thumbnail_url ?? null;
          if (url) return url;
        } catch (_) {}
        try {
          const r = await axios.get<{ media_url?: string; thumbnail_url?: string }>(
            `https://graph.instagram.com/v25.0/${postId}`,
            { params: { fields: 'media_url,thumbnail_url', access_token: accessToken } }
          );
          const url = r.data?.media_url ?? r.data?.thumbnail_url ?? null;
          if (url) return url;
        } catch (_) {}
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? null;
      }
      if (plat === 'YOUTUBE') {
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? `https://i.ytimg.com/vi/${postId}/mqdefault.jpg`;
      }
    } catch (_) {}
    return null;
  }

  // Fetch comments for Instagram / Facebook in parallel (up to 6 at a time) for speed
  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
    const igFbSources = sources.filter(() => true); // all sources
    const CHUNK = 6;
    for (let i = 0; i < igFbSources.length; i += CHUNK) {
      const chunk = igFbSources.slice(i, i + CHUNK);
      await Promise.all(chunk.map(async ({ platformPostId, postPreview, postTargetId, postPublishedAt, postImageUrl: sourceImageUrl, postUrl: sourcePostUrl }) => {
        let postImageUrl = sourceImageUrl ?? (await getPostImageUrl(platformPostId, platform, token));
        let postPublishedAtResolved = postPublishedAt;
        const postUrl = sourcePostUrl ?? (platform === 'FACEBOOK' ? `https://www.facebook.com/${platformPostId}` : null);
        // Instagram: fallback to ImportedPost by caption match when ID lookup fails (e.g. different ID format)
        if (platform === 'INSTAGRAM' && !postImageUrl && postPreview) {
          const snippet = postPreview.slice(0, 50).trim();
          if (snippet.length > 0) {
            const byCaption = await prisma.importedPost.findFirst({
              where: { socialAccountId: accountId, platform: 'INSTAGRAM', content: { not: null, contains: snippet } },
              select: { thumbnailUrl: true, publishedAt: true },
            });
            if (byCaption?.thumbnailUrl) {
              postImageUrl = byCaption.thumbnailUrl;
              if (byCaption.publishedAt) postPublishedAtResolved = byCaption.publishedAt.toISOString();
            }
          }
        }
        try {
          if (isInstagramBusinessLogin && igUserToken) {
            const res = await axios.get<{
              data?: Array<{
                id: string;
                from?: { id?: string; username?: string };
                text?: string;
                timestamp?: string;
              }>;
            }>(`https://graph.instagram.com/v25.0/${platformPostId}/comments`, {
              params: { fields: 'id,from{id,username},text,timestamp', access_token: igUserToken, limit: 50 },
              timeout: 15_000,
            });
            for (const c of res.data?.data ?? []) {
              const fromId = c.from?.id;
              const isFromMe = fromId === account.platformUserId;
              comments.push({
                commentId: c.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                text: c.text ?? '', authorName: isFromMe ? 'You' : (c.from?.username ?? 'Unknown'),
                authorPictureUrl: null, createdAt: c.timestamp ?? new Date().toISOString(), platform,
                isFromMe,
              });
            }
            // Fetch replies so user sees their own replies in the list
            const topLevelIds = (res.data?.data ?? []).map((x) => x.id).slice(0, 8);
            await Promise.all(topLevelIds.map(async (commentId) => {
              try {
                const replyRes = await axios.get<{ data?: Array<{ id: string; from?: { id?: string; username?: string }; text?: string; timestamp?: string }> }>(
                  `https://graph.instagram.com/v25.0/${commentId}/replies`,
                  { params: { fields: 'id,from{id,username},text,timestamp', access_token: igUserToken, limit: 25 }, timeout: 8_000 }
                );
                for (const r of replyRes.data?.data ?? []) {
                  const rFromId = (r.from as { id?: string })?.id;
                  const rIsFromMe = rFromId === account.platformUserId;
                  comments.push({
                    commentId: r.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                    postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                    text: r.text ?? '', authorName: rIsFromMe ? 'You' : (r.from?.username ?? 'Unknown'),
                    authorPictureUrl: null, createdAt: r.timestamp ?? new Date().toISOString(), platform,
                    isFromMe: rIsFromMe,
                  });
                }
              } catch { /* ignore */ }
            }));
          } else {
            const fields =
              platform === 'INSTAGRAM'
                ? 'id,from{id,username},text,created_time'
                : 'id,from{id,name,picture},message,created_time';
            const res = await axios.get<{
              data?: Array<{
                id: string;
                from?: { id?: string; username?: string; name?: string; picture?: { data?: { url?: string } } };
                text?: string;
                message?: string;
                created_time?: string;
              }>;
            }>(`https://graph.facebook.com/v18.0/${platformPostId}/comments`, {
              params: { fields, access_token: token, limit: 50 },
              timeout: 15_000,
            });
            for (const c of res.data?.data ?? []) {
              const from = c.from;
              const authorName = (platform === 'INSTAGRAM' ? from?.username : from?.name) ?? 'Unknown';
              const authorPictureUrl = (from as { picture?: { data?: { url?: string } } })?.picture?.data?.url ?? null;
              const text = (platform === 'INSTAGRAM' ? c.text : c.message) ?? '';
              const fromId = (from as { id?: string })?.id;
              const isFromMe = fromId === account.platformUserId;
              comments.push({
                commentId: c.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                text, authorName: isFromMe ? 'You' : authorName, authorPictureUrl: authorPictureUrl || null,
                createdAt: c.created_time ?? new Date().toISOString(), platform,
                isFromMe,
              });
            }
            // Fetch replies so user sees their own replies in the list
            const topLevelIds = (res.data?.data ?? []).map((x) => x.id).slice(0, 8);
            const replyFields = platform === 'INSTAGRAM'
              ? 'id,from{id,username},text,created_time'
              : 'id,from{id,name,picture},message,created_time';
            await Promise.all(topLevelIds.map(async (commentId) => {
              try {
                const replyRes = await axios.get<{
                  data?: Array<{
                    id: string;
                    from?: { id?: string; username?: string; name?: string; picture?: { data?: { url?: string } } };
                    text?: string;
                    message?: string;
                    created_time?: string;
                  }>;
                }>(`https://graph.facebook.com/v18.0/${commentId}/comments`, {
                  params: { fields: replyFields, access_token: token, limit: 25 },
                  timeout: 8_000,
                });
                for (const r of replyRes.data?.data ?? []) {
                  const rFrom = r.from;
                  const rAuthorName = (platform === 'INSTAGRAM' ? rFrom?.username : rFrom?.name) ?? 'Unknown';
                  const rAuthorPictureUrl = (rFrom as { picture?: { data?: { url?: string } } })?.picture?.data?.url ?? null;
                  const rText = (platform === 'INSTAGRAM' ? r.text : r.message) ?? '';
                  const rFromId = (rFrom as { id?: string })?.id;
                  const rIsFromMe = rFromId === account.platformUserId;
                  comments.push({
                    commentId: r.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                    postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                    text: rText, authorName: rIsFromMe ? 'You' : rAuthorName, authorPictureUrl: rAuthorPictureUrl || null,
                    createdAt: r.created_time ?? new Date().toISOString(), platform,
                    isFromMe: rIsFromMe,
                  });
                }
              } catch { /* ignore */ }
            }));
          }
        } catch (err) {
          if (!firstError) {
            const axErr = err as { response?: { data?: { error?: { message?: string; code?: number } } } };
            const msg = axErr?.response?.data?.error?.message ?? String(err);
            firstError = msg;
          }
        }
      }));
    }
  }

  for (const source of sources) {
    const { platformPostId, postPreview, postTargetId, postPublishedAt, postImageUrl: sourceImageUrl, postUrl: sourcePostUrl } = source as PostSource;
    if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') continue; // handled above in parallel block
    const postImageUrl = sourceImageUrl ?? (await getPostImageUrl(platformPostId, platform, token));

    if (platform === 'YOUTUBE') {
      try {
        const ytRes = await axios.get<{
          items?: Array<{
            id?: string;
            snippet?: {
              topLevelComment?: {
                id?: string;
                snippet?: {
                  authorDisplayName?: string;
                  authorProfileImageUrl?: string;
                  textOriginal?: string;
                  publishedAt?: string;
                };
              };
            };
          }>;
        }>('https://www.googleapis.com/youtube/v3/commentThreads', {
          params: { part: 'snippet', videoId: platformPostId, maxResults: 20 },
          headers: { Authorization: `Bearer ${token}` },
        });
        const items = ytRes.data?.items ?? [];
        for (const item of items) {
          const top = item.snippet?.topLevelComment?.snippet;
          if (!top) continue;
          comments.push({
            commentId: item.snippet?.topLevelComment?.id ?? item.id ?? String(Math.random()),
            postTargetId,
            platformPostId,
            accountId,
            postPreview,
            postImageUrl,
            postPublishedAt: postPublishedAt ?? null,
            postUrl: sourcePostUrl ?? `https://www.youtube.com/watch?v=${platformPostId}`,
            text: top.textOriginal ?? '',
            authorName: top.authorDisplayName ?? 'Unknown',
            authorPictureUrl: top.authorProfileImageUrl ?? null,
            createdAt: top.publishedAt ?? new Date().toISOString(),
            platform: 'YOUTUBE',
          });
        }
      } catch (_) {
        // skip on API error
      }
      continue;
    }

    if (platform === 'TWITTER') {
      try {
        const searchRes = await axios.get<{
          data?: Array<{ id: string; text?: string; author_id?: string; created_at?: string }>;
          includes?: { users?: Array<{ id: string; username?: string; name?: string }> };
          errors?: Array<{ message?: string }>;
        }>('https://api.twitter.com/2/tweets/search/recent', {
          params: {
            query: `conversation_id:${platformPostId} is:reply`,
            'tweet.fields': 'text,author_id,created_at',
            'user.fields': 'username,name',
            expansions: 'author_id',
            max_results: 25,
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        const errs = searchRes.data?.errors;
        if (errs?.length) continue;
        const tweets = searchRes.data?.data ?? [];
        const users = (searchRes.data?.includes?.users ?? []) as Array<{ id: string; username?: string; name?: string; profile_image_url?: string }>;
        const userMap = new Map(users.map((u) => [u.id, u]));
        for (const t of tweets) {
          const u = userMap.get(t.author_id ?? '');
          const authorName = u?.username ?? u?.name ?? 'Unknown';
          const authorPictureUrl = u?.profile_image_url?.replace(/_normal\./, '_400x400.') ?? null;
          comments.push({
            commentId: t.id,
            postTargetId,
            platformPostId,
            accountId,
            postPreview,
            postImageUrl: null,
            postPublishedAt: postPublishedAt ?? null,
            postUrl: sourcePostUrl ?? `https://twitter.com/i/web/status/${platformPostId}`,
            text: t.text ?? '',
            authorName,
            authorPictureUrl,
            createdAt: t.created_at ?? new Date().toISOString(),
            platform: 'TWITTER',
          });
        }
      } catch (_) {
        // skip
      }
    }
  }

  comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let error: string | undefined;
  if (comments.length === 0 && firstError) {
    const msg = (firstError as string).toLowerCase();
    if (msg.includes('permission') || msg.includes('oauth') || msg.includes('scope') || msg.includes('capability') || msg.includes('code 10') || msg.includes('code 200') || msg.includes('#10') || msg.includes('#200')) {
      error = 'Instagram comment permission required. Reconnect your Instagram account from the sidebar to grant the comments permission.';
    } else if (msg.includes('token') || msg.includes('expired') || msg.includes('session')) {
      error = 'Your Instagram session has expired. Reconnect from the sidebar.';
    } else {
      error = firstError;
    }
  }

  return NextResponse.json({ comments: comments.slice(0, 50), ...(error ? { error } : {}) });
}
