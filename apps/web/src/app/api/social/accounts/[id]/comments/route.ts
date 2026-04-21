import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import { linkedInAuthorUrnForUgc, parseLinkedInRestPostElement } from '@/lib/linkedin/sync-ugc-posts';
import { buildLinkedInRestPostsByAuthorUrl, linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';
import { getCached, setCached } from '@/lib/server-memory-cache';
import { isMetaNonCriticalThrottled, noteMetaRateLimitError, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';

/**
 * Rate-limit guardrails (see Meta app dashboard spikes):
 *   - MAX_SOURCES: cap how many posts we enumerate per account. The legacy value of 500
 *     meant a single inbox load could fire 500+ `/comments` calls against Meta, and we
 *     re-ran it on every navigation. Users don't need to see comments on hundreds of
 *     old posts in the inbox – the most recent ones are what matters.
 *   - COMMENTS_CACHE_TTL_MS: reuse the response for this long so rapid page refreshes
 *     don't trigger fresh Graph API fan-outs. Comment sync still runs on the real
 *     cadence via the sync engine.
 *   - REPLY_FETCH_LIMIT: how many top-level comments we fan out replies for.
 */
const MAX_SOURCES = 40;
const COMMENTS_CACHE_TTL_MS = 3 * 60 * 1000; // 3 min
const REPLY_FETCH_LIMIT = 12;

async function fetchAllPages<T>(
  initialUrl: string,
  initialParams: Record<string, string | number>,
  pageLimit = 25
): Promise<T[]> {
  const out: T[] = [];
  let nextUrl: string | null = initialUrl;
  let nextParams: Record<string, string | number> | undefined = initialParams;
  let pages = 0;

  while (nextUrl && pages < pageLimit) {
    const response: { data?: { data?: T[]; paging?: { next?: string } }; headers?: Record<string, string | undefined> } = await axios.get(nextUrl, {
      ...(nextParams ? { params: nextParams } : {}),
      timeout: 15_000,
    });
    noteMetaUsageFromHeaders(response.headers);
    out.push(...(response.data?.data ?? []));
    nextUrl = response.data?.paging?.next ?? null;
    nextParams = undefined;
    pages += 1;
  }
  return out;
}

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

  // Short-lived response cache keyed by (user, account). Prevents the Phase 2 prefetch
  // in AppDataContext from firing the expensive Meta comments fan-out every time the
  // app mounts / the user reopens analytics.
  const cacheKey = `comments:${userId}:${id}`;
  const cached = getCached<unknown>(cacheKey);
  if (cached) {
    const res = NextResponse.json(cached);
    res.headers.set('Cache-Control', 'private, max-age=60');
    res.headers.set('X-Comments-Cache', 'HIT');
    return res;
  }

  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
      credentialsJson: true,
    },
  });
  if (!account) {
    return NextResponse.json({ comments: [], error: 'Account not found' }, { status: 404 });
  }

  const platform = account.platform;
  const metaThrottle = (platform === 'INSTAGRAM' || platform === 'FACEBOOK') && isMetaNonCriticalThrottled();
  if (
    platform !== 'INSTAGRAM' &&
    platform !== 'FACEBOOK' &&
    platform !== 'TWITTER' &&
    platform !== 'YOUTUBE' &&
    platform !== 'TIKTOK' &&
    platform !== 'LINKEDIN' &&
    platform !== 'PINTEREST'
  ) {
    return NextResponse.json({
      comments: [],
      error: 'Comments are only available for Instagram, Facebook, X, YouTube, TikTok, and LinkedIn.',
    });
  }

  // TikTok: Comment *reading* exists in TikTok's Research API, but that API is only for approved
  // researchers. The Display API (what we use: video.list, user.info, etc.) does not expose comment text.
  if (platform === 'TIKTOK') {
    return NextResponse.json({
      comments: [],
      error: "TikTok's Display API (used by this app) doesn't include comment text. Comment reading is available only in TikTok's Research API for approved researchers. You can see comment counts in Analytics.",
    });
  }

  if (platform === 'PINTEREST') {
    return NextResponse.json({
      comments: [],
      error: null,
      hint: 'Pin comments are not loaded in this inbox yet. Use Pinterest or analytics for pin activity.',
    });
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
    take: 150,
  });
  const targetPostIds = new Set(targets.map((t) => t.platformPostId!));

  // Synced (imported) posts from the platform so we can show comments on all posts, not only app-published
  const imported = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id },
    orderBy: { publishedAt: 'desc' },
    take: 400,
    // Avoid selecting columns that may not exist in production DB yet (e.g. platformMetaData).
    select: {
      id: true,
      platformPostId: true,
      content: true,
      publishedAt: true,
      thumbnailUrl: true,
      permalinkUrl: true,
    },
  });
  const importedPostsToFetch = imported.filter((p) => !targetPostIds.has(p.platformPostId));

  type PostSource = { platformPostId: string; postPreview: string; postTargetId: string; postPublishedAt?: string; postImageUrl?: string | null; postUrl?: string | null };
  const dbSources: PostSource[] = [
    ...targets.map((t) => ({
      platformPostId: t.platformPostId!,
      postPreview: (t.post?.content ?? '').trim() || 'Post',
      postTargetId: t.id,
    })),
    ...importedPostsToFetch.map((p) => ({
      platformPostId: p.platformPostId,
      postPreview: (p.content ?? '').trim() || 'Post',
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

  // For Instagram/Facebook: also fetch recent media from the platform API so we show comments on
  // posts that weren't published through the app or synced yet (e.g. old posts the user commented on).
  //
  // IMPORTANT: we used to run an Instagram /media paginated fetch here AND a second /media fetch
  // further down for the image/permalink map — two calls for the same data per request. We now
  // fetch once and reuse the result for both purposes.
  let liveSources: PostSource[] = [];
  type InstagramMediaItem = {
    id: string;
    caption?: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
  };
  const instagramMediaItems: InstagramMediaItem[] = [];
  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
    try {
      const liveToken = account.accessToken;
      if (platform === 'INSTAGRAM') {
        const mediaUrl = isInstagramBizEarly
          ? 'https://graph.instagram.com/v25.0/me/media'
          : `${facebookGraphBaseUrl}/${account.platformUserId}/media`;
        // One page of 50 is plenty for the inbox — we only show MAX_SOURCES posts anyway.
        const mediaRes = await axios.get<{ data?: InstagramMediaItem[] }>(mediaUrl, {
          params: { fields: 'id,caption,media_url,thumbnail_url,permalink', limit: 50, access_token: liveToken },
          timeout: 15_000,
        });
        noteMetaUsageFromHeaders(mediaRes.headers);
        instagramMediaItems.push(...(mediaRes.data?.data ?? []));
        liveSources = instagramMediaItems.map((m, i) => ({
          platformPostId: m.id,
          postPreview: (m.caption ?? '').trim() || `Post ${i + 1}`,
          postTargetId: `live-${m.id}`,
          postImageUrl: m.media_url ?? m.thumbnail_url ?? null,
          postUrl: m.permalink ?? null,
        }));
      } else if (platform === 'FACEBOOK') {
        const fbRes = await axios.get<{ data?: Array<{ id: string; message?: string; story?: string }> }>(
          `${facebookGraphBaseUrl}/${account.platformUserId}/posts`,
          { params: { fields: 'id,message,story', limit: 50, access_token: liveToken }, timeout: 15_000 }
        );
        liveSources = (fbRes.data?.data ?? []).map((m, i) => ({
          platformPostId: m.id,
          postPreview: (m.message ?? m.story ?? '').trim() || `Post ${i + 1}`,
          postTargetId: `live-${m.id}`,
        }));
      }
    } catch { /* if live fetch fails, proceed with dbSources only */ }
  }

  // For Twitter: fetch recent tweets from the API so we have post sources for reply search
  // (otherwise comments only show if user has synced posts from Dashboard or published via app).
  if (platform === 'TWITTER') {
    try {
      const tweetsRes = await axios.get<{
        data?: Array<{ id: string; text?: string; created_at?: string }>;
      }>(`https://api.twitter.com/2/users/${account.platformUserId}/tweets`, {
        params: {
          max_results: 50,
          'tweet.fields': 'text,created_at',
          exclude: 'retweets,replies',
        },
        headers: { Authorization: `Bearer ${account.accessToken}` },
        timeout: 15_000,
      });
      const tweets = tweetsRes.data?.data ?? [];
      liveSources = tweets.map((t, i) => ({
        platformPostId: t.id,
        postPreview: (t.text ?? '').trim() || `Tweet ${i + 1}`,
        postTargetId: `live-${t.id}`,
        postPublishedAt: t.created_at ?? undefined,
        postUrl: `https://twitter.com/i/web/status/${t.id}`,
      }));
    } catch { /* if live fetch fails, proceed with dbSources only */ }
  }

  // LinkedIn: fetch recent posts (REST Posts API) so we have post sources for comments
  if (platform === 'LINKEDIN') {
    try {
      const authorUrn = linkedInAuthorUrnForUgc(account.platformUserId, account.credentialsJson);
      const postsUrl = buildLinkedInRestPostsByAuthorUrl(authorUrn, 50);
      const postsRes = await axios.get<{ elements?: unknown[] }>(postsUrl, {
        headers: linkedInRestCommunityHeaders(account.accessToken),
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (postsRes.status >= 200 && postsRes.status < 300) {
        const items = postsRes.data?.elements ?? [];
        liveSources = items
          .map((raw, i) => {
            const p = parseLinkedInRestPostElement(raw);
            if (!p || p.lifecycleState === 'DELETED') return null;
            return {
              platformPostId: p.id,
              postPreview: (p.content ?? '').trim() || `Post ${i + 1}`,
              postTargetId: `live-${p.id}`,
              postPublishedAt: p.publishedAt.toISOString(),
              postUrl: `https://www.linkedin.com/feed/update/${encodeURIComponent(p.id)}`,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null);
      }
    } catch { /* if live fetch fails, proceed with dbSources only */ }
  }

  // Merge: use DB sources first, then add live media that aren't already in DB (so comments on
  // old/synced posts and on recent platform-only posts both show up). Cap total to keep the
  // Graph API fan-out bounded (see MAX_SOURCES comment at top of file).
  const existingPostIds = new Set(dbSources.map((s) => s.platformPostId));
  const extraLive = liveSources.filter((s) => !existingPostIds.has(s.platformPostId));
  const maxSources = metaThrottle && platform === 'INSTAGRAM' ? 16 : MAX_SOURCES;
  const sources: PostSource[] = [
    ...dbSources,
    ...extraLive.slice(0, Math.max(0, maxSources - dbSources.length)),
  ].slice(0, maxSources);
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
    parentCommentId?: string | null;
    /** LinkedIn thread root URN (activity/share/ugc) required when posting nested comment replies. */
    linkedInObjectUrn?: string | null;
  }> = [];
  let firstError: string | null = null;

  const accountId = account.id;

  // Build Instagram media image/permalink maps from the single media fetch we already did above.
  // We used to fetch /me/media a second time here — that's what was generating duplicate
  // ShadowIGMedia calls on every comments load.
  const igMediaImageMap = new Map<string, string>();
  const igMediaPermalinkMap = new Map<string, string>();
  if (platform === 'INSTAGRAM') {
    for (const m of instagramMediaItems) {
      const url = m.media_url ?? m.thumbnail_url;
      if (url) igMediaImageMap.set(m.id, url);
      if (m.permalink) igMediaPermalinkMap.set(m.id, m.permalink);
    }
    // Always override with fresh URLs (DB thumbnailUrls may be expired CDN links).
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
        // Prefer the DB thumbnail (populated by sync) to avoid a per-post Graph call for every
        // post every time the inbox is opened — that's what generated the ~100 `/Video` and
        // `/ShadowIGMedia` object calls per page load.
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        if (imp?.thumbnailUrl) return imp.thumbnailUrl;
        try {
          const r = await axios.get<{ full_picture?: string; picture?: string }>(
            `${facebookGraphBaseUrl}/${postId}`,
            { params: { fields: 'full_picture,picture', access_token: accessToken } }
          );
          return r.data?.full_picture ?? r.data?.picture ?? null;
        } catch {
          return null;
        }
      }
      if (plat === 'INSTAGRAM') {
        // 1) Pre-fetched map from the single /me/media call above.
        if (igMediaImageMap.has(postId)) return igMediaImageMap.get(postId)!;
        // 2) DB thumbnail – no API call.
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        if (imp?.thumbnailUrl) return imp.thumbnailUrl;
        // 3) Only as a last resort, one Graph call – not both endpoints anymore.
        try {
          const r = await axios.get<{ media_url?: string; thumbnail_url?: string }>(
            `${facebookGraphBaseUrl}/${postId}`,
            { params: { fields: 'media_url,thumbnail_url', access_token: accessToken } }
          );
          return r.data?.media_url ?? r.data?.thumbnail_url ?? null;
        } catch {
          return null;
        }
      }
      if (plat === 'YOUTUBE') {
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? `https://i.ytimg.com/vi/${postId}/mqdefault.jpg`;
      }
      if (plat === 'TWITTER') {
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        if (imp?.thumbnailUrl) return imp.thumbnailUrl;
        try {
          const tr = await axios.get<{
            data?: { attachments?: { media_keys?: string[] } };
            includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> };
          }>(`https://api.twitter.com/2/tweets/${postId}`, {
            params: { 'tweet.fields': 'attachments', expansions: 'attachments.media_keys', 'media.fields': 'url,preview_image_url' },
            headers: { Authorization: `Bearer ${accessToken}` },
            timeout: 8_000,
          });
          const firstKey = tr.data?.data?.attachments?.media_keys?.[0];
          const media = firstKey ? (tr.data?.includes?.media ?? []).find((m) => m.media_key === firstKey) : undefined;
          return media?.preview_image_url ?? media?.url ?? null;
        } catch (_) {
          return null;
        }
      }
      if (plat === 'LINKEDIN') {
        const imp = await prisma.importedPost.findFirst({
          where: { platformPostId: postId, socialAccountId: accountId },
          select: { thumbnailUrl: true },
        });
        return imp?.thumbnailUrl ?? null;
      }
    } catch (_) {}
    return null;
  }

  // Fetch comments for Instagram / Facebook in parallel (up to 6 at a time) for speed
  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
    const igFbSources = sources.filter(() => true); // all sources
    const CHUNK = metaThrottle && platform === 'INSTAGRAM' ? 2 : 6;
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
            const list = await fetchAllPages<{
              id: string;
              from?: { id?: string; username?: string };
              text?: string;
              timestamp?: string;
            }>(
              `https://graph.instagram.com/v25.0/${platformPostId}/comments`,
              { fields: 'id,from{id,username},text,timestamp', access_token: igUserToken, limit: 100 },
              5
            );
            for (const c of list) {
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
            // Fetch replies so user sees their own replies in the list. Cap how many top-level
            // comments we fan out for — a viral post with hundreds of comments otherwise means
            // hundreds of /replies calls per inbox load.
            const topLevelIds = (metaThrottle && platform === 'INSTAGRAM')
              ? []
              : list.slice(0, REPLY_FETCH_LIMIT).map((x) => x.id);
            const replyChunkSize = 8;
            for (let ri = 0; ri < topLevelIds.length; ri += replyChunkSize) {
              const chunkIds = topLevelIds.slice(ri, ri + replyChunkSize);
              await Promise.all(chunkIds.map(async (commentId) => {
                try {
                  const replies = await fetchAllPages<{ id: string; from?: { id?: string; username?: string }; text?: string; timestamp?: string }>(
                    `https://graph.instagram.com/v25.0/${commentId}/replies`,
                    { fields: 'id,from{id,username},text,timestamp', access_token: igUserToken, limit: 100 },
                    3
                  );
                  for (const r of replies) {
                    const rFromId = (r.from as { id?: string })?.id;
                    const rIsFromMe = rFromId === account.platformUserId;
                    comments.push({
                      commentId: r.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                      postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                      text: r.text ?? '', authorName: rIsFromMe ? 'You' : (r.from?.username ?? 'Unknown'),
                      authorPictureUrl: null, createdAt: r.timestamp ?? new Date().toISOString(), platform,
                      isFromMe: rIsFromMe, parentCommentId: commentId,
                    });
                  }
                } catch { /* ignore */ }
              }));
            }
          } else {
            const fields =
              platform === 'INSTAGRAM'
                ? 'id,from{id,username},text,created_time'
                : 'id,from{id,name,picture},message,created_time';
            const list = await fetchAllPages<{
              id: string;
              from?: { id?: string; username?: string; name?: string; picture?: { data?: { url?: string } } };
              text?: string;
              message?: string;
              created_time?: string;
            }>(
              `${facebookGraphBaseUrl}/${platformPostId}/comments`,
              { fields, access_token: token, limit: 100 },
              5
            );
            for (const c of list) {
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
            // Fetch replies so user sees their own replies in the list. Cap how many top-level
            // comments we fan out for — see same rationale in the IG-business branch above.
            const topLevelIds = (metaThrottle && platform === 'INSTAGRAM')
              ? []
              : list.slice(0, REPLY_FETCH_LIMIT).map((x) => x.id);
            const replyFields = platform === 'INSTAGRAM'
              ? 'id,from{id,username},text,timestamp'
              : 'id,from{id,name,picture},message,created_time';
            const replyEndpoint = platform === 'INSTAGRAM' ? 'replies' : 'comments';
            const replyChunkSize = 8;
            for (let ri = 0; ri < topLevelIds.length; ri += replyChunkSize) {
              const chunkIds = topLevelIds.slice(ri, ri + replyChunkSize);
              await Promise.all(chunkIds.map(async (commentId) => {
                try {
                  const replies = await fetchAllPages<{
                    id: string;
                    from?: { id?: string; username?: string; name?: string; picture?: { data?: { url?: string } } };
                    text?: string;
                    message?: string;
                    created_time?: string;
                    timestamp?: string;
                  }>(
                    `${facebookGraphBaseUrl}/${commentId}/${replyEndpoint}`,
                    { fields: replyFields, access_token: token, limit: 100 },
                    3
                  );
                  for (const r of replies) {
                    const rFrom = r.from;
                    const rAuthorName = (platform === 'INSTAGRAM' ? rFrom?.username : rFrom?.name) ?? 'Unknown';
                    const rAuthorPictureUrl = (rFrom as { picture?: { data?: { url?: string } } })?.picture?.data?.url ?? null;
                    const rText = (platform === 'INSTAGRAM' ? r.text : r.message) ?? '';
                    const rFromId = (rFrom as { id?: string })?.id;
                    const rIsFromMe = rFromId === account.platformUserId;
                    const rCreated = r.created_time ?? (r as { timestamp?: string }).timestamp ?? new Date().toISOString();
                    comments.push({
                      commentId: r.id, postTargetId, platformPostId, accountId, postPreview, postImageUrl,
                      postPublishedAt: postPublishedAtResolved ?? null, postUrl,
                      text: rText, authorName: rIsFromMe ? 'You' : rAuthorName, authorPictureUrl: rAuthorPictureUrl || null,
                      createdAt: rCreated, platform,
                      isFromMe: rIsFromMe, parentCommentId: commentId,
                    });
                  }
                } catch { /* ignore */ }
              }));
            }
          }
        } catch (err) {
          const axErr = err as { response?: { data?: { error?: { code?: number; message?: string } } } };
          const code = axErr?.response?.data?.error?.code;
          if (code === 4 || code === 32 || code === 613) noteMetaRateLimitError();
          if (!firstError) {
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
          includes?: { users?: Array<{ id: string; username?: string; name?: string; profile_image_url?: string }> };
          errors?: Array<{ message?: string }>;
        }>('https://api.twitter.com/2/tweets/search/recent', {
          params: {
            query: `conversation_id:${platformPostId} is:reply`,
            'tweet.fields': 'text,author_id,created_at',
            'user.fields': 'username,name,profile_image_url',
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
            postImageUrl: sourceImageUrl ?? (await getPostImageUrl(platformPostId, platform, token)),
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

    if (platform === 'LINKEDIN') {
      try {
        const postUrn = platformPostId.startsWith('urn:') ? platformPostId : `urn:li:ugcPost:${platformPostId}`;
        const commentsRes = await axios.get<{
          elements?: Array<{
            id?: string;
            commentUrn?: string;
            actor?: string;
            message?: { text?: string };
            created?: { time?: number };
            object?: string;
          }>;
        }>(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postUrn)}/comments`, {
          headers: linkedInRestCommunityHeaders(token),
          timeout: 15_000,
        });
        const elements = commentsRes.data?.elements ?? [];
        for (const c of elements) {
          const text = c.message?.text ?? '';
          const createdAt = c.created?.time != null ? new Date(c.created.time).toISOString() : new Date().toISOString();
          const objectUrn = typeof c.object === 'string' && c.object.trim() ? c.object.trim() : undefined;
          const commentUrn =
            typeof c.commentUrn === 'string' && c.commentUrn.trim()
              ? c.commentUrn.trim()
              : objectUrn && c.id
                ? `urn:li:comment:(${objectUrn},${c.id})`
                : (c.id ?? '');
          comments.push({
            commentId: commentUrn || (c.id ?? ''),
            postTargetId,
            platformPostId,
            accountId,
            postPreview,
            postImageUrl: sourceImageUrl ?? (await getPostImageUrl(platformPostId, platform, token)),
            postPublishedAt: postPublishedAt ?? null,
            postUrl: sourcePostUrl ?? `https://www.linkedin.com/feed/update/${encodeURIComponent(platformPostId)}`,
            text,
            authorName: 'LinkedIn member',
            authorPictureUrl: null,
            createdAt,
            platform: 'LINKEDIN',
            linkedInObjectUrn: objectUrn ?? null,
          });
        }
      } catch (_) {
        // skip on API error
      }
    }
  }

  comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let error: string | undefined;
  if (comments.length === 0 && firstError) {
    const msg = (firstError as string).toLowerCase();
    if (msg.includes('permission') || msg.includes('oauth') || msg.includes('scope') || msg.includes('capability') || msg.includes('code 10') || msg.includes('code 200') || msg.includes('#10') || msg.includes('#200')) {
      error = `${platform} comment permission required. Reconnect your ${platform} account from the sidebar and grant comment permissions.`;
    } else if (msg.includes('token') || msg.includes('expired') || msg.includes('session')) {
      error = 'Your Instagram session has expired. Reconnect from the sidebar.';
    } else {
      error = firstError;
    }
  }

  const payload = { comments, ...(error ? { error } : {}) };
  // Only cache successful responses (no upstream token/permission errors) — we never want to
  // lock in a "permission denied" blip into a 3-minute cache.
  if (!error) setCached(cacheKey, payload, COMMENTS_CACHE_TTL_MS);

  const res = NextResponse.json(payload);
  res.headers.set('Cache-Control', 'private, max-age=60');
  res.headers.set('X-Comments-Cache', 'MISS');
  return res;
}
