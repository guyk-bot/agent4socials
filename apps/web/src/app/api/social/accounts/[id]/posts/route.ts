import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform, PostStatus } from '@prisma/client';
import axios, { type AxiosResponse } from 'axios';
import { getValidYoutubeToken } from '@/lib/youtube-token';
import {
  fetchAllPublishedPostsForPage,
  fetchAllPostsFeedForPage,
  fetchPostLifetimeInsightMap,
  pickFacebookPostImpressionsFromInsightMap,
  sortFbPublishedPostsNewestFirst,
} from '@/lib/facebook/fetchers';
import { syncFacebookAuxiliaryIngest } from '@/lib/facebook/sync-extras';
import { fbRestBaseUrl } from '@/lib/facebook/constants';
import { getValidPinterestToken } from '@/lib/pinterest-token';

/** Fallback host for IG user/media when graph.facebook.com omits items (matches insights route). */
const igGraphRestBaseUrl = 'https://graph.instagram.com/v18.0';


const FB_CORE_POST_LIFETIME_METRICS = [
  'post_reactions_like_total',
  'post_comments',
  'post_shares',
  'post_impressions',
  'post_media_view',
  'post_video_views',
] as const;

function mergeFacebookInsightMaps(
  db?: Record<string, number>,
  live?: Record<string, number>
): Record<string, number> | undefined {
  if (!db && !live) return undefined;
  const out: Record<string, number> = { ...(db ?? {}) };
  for (const [k, v] of Object.entries(live ?? {})) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    const prev = out[k];
    out[k] = typeof prev === 'number' && Number.isFinite(prev) ? Math.max(prev, v) : v;
  }
  return Object.keys(out).length ? out : undefined;
}

function isFacebookVideoLikeImportedRow(p: { permalinkUrl?: string | null; mediaType?: string | null }): boolean {
  const url = (p.permalinkUrl ?? '').toLowerCase();
  if ((p.mediaType ?? '').toUpperCase() === 'VIDEO') return true;
  if (url.includes('/reel/') || url.includes('/reels/')) return true;
  if (url.includes('/videos/')) return true;
  return false;
}

/** True when stored Graph lifetime map has no usable view signal (common when sync hit the insight cap on older ordering). */
function facebookStoredInsightsLackViewSignal(meta: Record<string, unknown>): boolean {
  const fi = meta.facebookInsights;
  if (!fi || typeof fi !== 'object' || Array.isArray(fi)) return true;
  const m = fi as Record<string, number>;
  const signal = Math.max(
    m.post_media_view ?? 0,
    m.post_video_views ?? 0,
    m.post_impressions ?? 0,
    m.post_impressions_unique ?? 0
  );
  return signal === 0;
}

async function resolveFacebookPageAccessToken(pageId: string, token: string): Promise<string> {
  try {
    const res = await axios.get<{ data?: Array<{ id?: string; access_token?: string }>; error?: { message?: string } }>(
      `${fbRestBaseUrl}/me/accounts`,
      {
        params: { fields: 'id,access_token', limit: 200, access_token: token },
        timeout: 10_000,
        validateStatus: () => true,
      }
    );
    if (res.status !== 200 || res.data?.error) return token;
    const rows = res.data?.data ?? [];
    const match = rows.find((r) => r?.id === pageId && typeof r?.access_token === 'string' && r.access_token.trim() !== '');
    return match?.access_token?.trim() || token;
  } catch {
    return token;
  }
}

type ImportedPostListRow = {
  id: string;
  platformPostId: string;
  platform: Platform;
  content: string | null;
  thumbnailUrl: string | null;
  permalinkUrl: string | null;
  impressions: number;
  interactions: number;
  likeCount: number | null;
  commentsCount: number | null;
  repostsCount: number | null;
  sharesCount: number | null;
  publishedAt: Date;
  mediaType: string | null;
  platformMetadata: unknown;
};

function isMissingImportedPostPlatformMetadataColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { column?: string } };
  const msg = (e?.message ?? '').toLowerCase();
  const col = (e?.meta?.column ?? '').toLowerCase();
  return e?.code === 'P2022' && (msg.includes('importedpost.platformmetadata') || msg.includes('platformmetadata') || col.includes('platformmetadata'));
}

async function listImportedPostsSafe(socialAccountId: string): Promise<ImportedPostListRow[]> {
  try {
    return await prisma.importedPost.findMany({
      where: { socialAccountId },
      orderBy: { publishedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        platformPostId: true,
        platform: true,
        content: true,
        thumbnailUrl: true,
        permalinkUrl: true,
        impressions: true,
        interactions: true,
        likeCount: true,
        commentsCount: true,
        repostsCount: true,
        sharesCount: true,
        publishedAt: true,
        mediaType: true,
        platformMetadata: true,
      },
    });
  } catch (e) {
    if (!isMissingImportedPostPlatformMetadataColumn(e)) throw e;
    const rows = await prisma.importedPost.findMany({
      where: { socialAccountId },
      orderBy: { publishedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        platformPostId: true,
        platform: true,
        content: true,
        thumbnailUrl: true,
        permalinkUrl: true,
        impressions: true,
        interactions: true,
        likeCount: true,
        commentsCount: true,
        repostsCount: true,
        sharesCount: true,
        publishedAt: true,
        mediaType: true,
      },
    });
    return rows.map((r) => ({ ...r, platformMetadata: null }));
  }
}

/** Pinterest list pins often omit image URLs; GET /v5/pins/{id} returns full PinMedia. */
function pickPinThumbnailFromMedia(media: unknown): string | null {
  if (!media || typeof media !== 'object') return null;
  const m = media as Record<string, unknown>;
  if (typeof m.cover_image_url === 'string' && m.cover_image_url.trim()) {
    return m.cover_image_url.trim();
  }
  const images = m.images;
  if (images && typeof images === 'object' && !Array.isArray(images)) {
    let bestUrl: string | null = null;
    let bestArea = 0;
    for (const img of Object.values(images as Record<string, { url?: unknown; width?: unknown; height?: unknown }>)) {
      if (!img || typeof img !== 'object') continue;
      const rec = img as { url?: unknown; width?: unknown; height?: unknown };
      if (typeof rec.url !== 'string' || !rec.url) continue;
      const w = typeof rec.width === 'number' ? rec.width : 0;
      const h = typeof rec.height === 'number' ? rec.height : 0;
      const area = w * h || 1;
      if (area >= bestArea) {
        bestArea = area;
        bestUrl = rec.url;
      }
    }
    if (bestUrl) return bestUrl;
  }
  return null;
}

async function fetchPinterestPinMedia(
  pinId: string,
  headers: Record<string, string>,
): Promise<unknown | null> {
  try {
    const res = await axios.get<{ media?: unknown }>(`https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}`, {
      headers,
      validateStatus: () => true,
      timeout: 12_000,
    });
    if (res.status !== 200) return null;
    return res.data?.media ?? null;
  } catch {
    return null;
  }
}

function thumbnailUrlFromFirstPostMedia(m: {
  fileUrl: string;
  type: string;
  metadata: unknown;
} | undefined): string | null {
  if (!m) return null;
  if (m.type === 'IMAGE') return m.fileUrl;
  if (m.type === 'VIDEO') {
    const meta =
      m.metadata && typeof m.metadata === 'object' && !Array.isArray(m.metadata)
        ? (m.metadata as Record<string, unknown>)
        : {};
    const t = meta.thumbnailUrl;
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  }
  return null;
}

async function findImportedPostPrevSafe(socialAccountId: string, platformPostId: string): Promise<{ impressions: number; platformMetadata: unknown } | null> {
  try {
    const prev = await prisma.importedPost.findUnique({
      where: { socialAccountId_platformPostId: { socialAccountId, platformPostId } },
      select: { impressions: true, platformMetadata: true },
    });
    if (!prev) return null;
    return { impressions: prev.impressions ?? 0, platformMetadata: prev.platformMetadata ?? null };
  } catch (e) {
    if (!isMissingImportedPostPlatformMetadataColumn(e)) throw e;
    const prev = await prisma.importedPost.findUnique({
      where: { socialAccountId_platformPostId: { socialAccountId, platformPostId } },
      select: { impressions: true },
    });
    if (!prev) return null;
    return { impressions: prev.impressions ?? 0, platformMetadata: null };
  }
}

async function upsertImportedPostWithFallback(args: {
  socialAccountId: string;
  platformPostId: string;
  createData: any;
  updateData: any;
}) {
  const { socialAccountId, platformPostId, createData, updateData } = args;
  try {
    await prisma.importedPost.upsert({
      where: { socialAccountId_platformPostId: { socialAccountId, platformPostId } },
      update: updateData,
      create: createData,
    });
  } catch (e) {
    if (!isMissingImportedPostPlatformMetadataColumn(e)) throw e;
    const { platformMetadata: _pmCreate, ...createWithoutMeta } = createData;
    const { platformMetadata: _pmUpdate, ...updateWithoutMeta } = updateData;
    await prisma.importedPost.upsert({
      where: { socialAccountId_platformPostId: { socialAccountId, platformPostId } },
      update: updateWithoutMeta,
      create: createWithoutMeta,
    });
  }
}

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
    if (account.platform === 'PINTEREST') {
      account.accessToken = await getValidPinterestToken({
        id: account.id,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        expiresAt: account.expiresAt,
      });
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
    const importedRows = await listImportedPostsSafe(account.id);
    const importedPostIds = new Set(importedRows.map((p) => p.platformPostId));

    // Also include posts published via the app (postTargets) not already in importedPosts
    const appTargets = await prisma.postTarget.findMany({
      where: {
        socialAccountId: account.id,
        status: PostStatus.POSTED,
        platformPostId: { not: null },
      },
      include: { post: { select: { content: true, media: { select: { fileUrl: true, type: true, metadata: true }, take: 1 } } } },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });

    // For Twitter: live-enrich from API so we show likes/comments/reposts/images even if sync failed or is stale
    let twitterEnrich: Record<string, { likeCount: number; commentsCount: number; repostsCount: number; thumbnailUrl: string | null }> = {};
    if (account.platform === 'TWITTER' && importedRows.length > 0) {
      try {
        const tweetsRes = await axios.get<{
          data?: Array<{
            id: string;
            attachments?: { media_keys?: string[] };
            public_metrics?: { like_count?: number; reply_count?: number; retweet_count?: number };
          }>;
          includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> };
        }>(`https://api.twitter.com/2/users/${account.platformUserId}/tweets`, {
          params: {
            max_results: 50,
            'tweet.fields': 'public_metrics,attachments',
            expansions: 'attachments.media_keys',
            'media.fields': 'url,preview_image_url',
            exclude: 'retweets,replies',
          },
          headers: { Authorization: `Bearer ${account.accessToken}` },
          timeout: 12_000,
        });
        const items = tweetsRes.data?.data ?? [];
        const mediaList = tweetsRes.data?.includes?.media ?? [];
        const mediaByKey = new Map(mediaList.map((m) => [m.media_key, m]));
        for (const t of items) {
          const firstMediaKey = t.attachments?.media_keys?.[0];
          const firstMedia = firstMediaKey ? mediaByKey.get(firstMediaKey) : undefined;
          const thumbnailUrl = firstMedia?.preview_image_url ?? firstMedia?.url ?? null;
          twitterEnrich[t.id] = {
            likeCount: t.public_metrics?.like_count ?? 0,
            commentsCount: t.public_metrics?.reply_count ?? 0,
            repostsCount: t.public_metrics?.retweet_count ?? 0,
            thumbnailUrl,
          };
        }
      } catch (_) {
        // ignore; use DB values
      }
    }

    /** Pinterest: list endpoint often omits thumbnails; fill gaps via GET /v5/pins/{id} and persist. */
    const pinterestThumbByPinId: Record<string, string> = {};
    if (account.platform === 'PINTEREST' && importedRows.length > 0 && account.accessToken) {
      try {
        const headers = { Authorization: `Bearer ${account.accessToken}` };
        const missing = importedRows.filter((r) => !r.thumbnailUrl?.trim()).slice(0, 40);
        const batchSize = 8;
        for (let i = 0; i < missing.length; i += batchSize) {
          const slice = missing.slice(i, i + batchSize);
          await Promise.all(
            slice.map(async (r) => {
              const media = await fetchPinterestPinMedia(r.platformPostId, headers);
              const url = pickPinThumbnailFromMedia(media);
              if (!url) return;
              pinterestThumbByPinId[r.platformPostId] = url;
              try {
                await prisma.importedPost.update({
                  where: {
                    socialAccountId_platformPostId: {
                      socialAccountId: account.id,
                      platformPostId: r.platformPostId,
                    },
                  },
                  data: { thumbnailUrl: url, syncedAt: new Date() },
                });
              } catch {
                /* row missing or race */
              }
            }),
          );
        }
      } catch (e) {
        console.warn('[Imported posts] Pinterest thumb enrich on read:', (e as Error)?.message ?? e);
      }
    }

    // Facebook: fill missing video/reel view metrics on read. Sync only attaches lifetime insights to the newest N posts;
    // older Graph ordering used to starve recent reels. Also merge live results with DB so partial maps still upgrade.
    let liveFacebookInsightsByPostId: Record<string, Record<string, number>> = {};
    if (account.platform === 'FACEBOOK' && importedRows.length > 0) {
      try {
        const fbPageToken = await resolveFacebookPageAccessToken(account.platformUserId, account.accessToken);
        const candidates = importedRows
          .filter((p) => {
            if (!isFacebookVideoLikeImportedRow(p)) return false;
            const meta =
              p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
                ? (p.platformMetadata as Record<string, unknown>)
                : {};
            return facebookStoredInsightsLackViewSignal(meta);
          })
          .slice(0, 45);

        if (candidates.length > 0) {
          const metrics = [...FB_CORE_POST_LIFETIME_METRICS];
          await runWithConcurrency(candidates, 5, async (row) => {
            try {
              const map = await fetchPostLifetimeInsightMap(row.platformPostId, fbPageToken, [...metrics]);
              if (Object.keys(map).length > 0) {
                liveFacebookInsightsByPostId[row.platformPostId] = map;
              }
            } catch {
              /* per-post best effort */
            }
          });
        }
      } catch {
        /* best effort */
      }
    }

    /** Instagram: refresh media insights + thumbnails on read when DB/sync returned zeros (mirrors Facebook live path). */
    const liveInstagramInsightBundles: Record<string, IgMediaInsightBundle> = {};
    const liveInstagramThumbnails: Record<string, string | null> = {};
    if (account.platform === 'INSTAGRAM' && account.accessToken && importedRows.length > 0) {
      const bundleFromRow = (row: ImportedPostListRow): IgMediaInsightBundle => {
        const meta =
          row.platformMetadata && typeof row.platformMetadata === 'object' && !Array.isArray(row.platformMetadata)
            ? (row.platformMetadata as Record<string, unknown>).instagram
            : null;
        const ig = meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
        return {
          views: typeof ig.views === 'number' ? ig.views : row.impressions ?? 0,
          impressionsLegacy: typeof ig.impressionsLegacy === 'number' ? ig.impressionsLegacy : 0,
          reach: typeof ig.reach === 'number' ? ig.reach : 0,
          totalInteractions: typeof ig.totalInteractions === 'number' ? ig.totalInteractions : 0,
          avgWatchSeconds: typeof ig.avgWatchSeconds === 'number' ? ig.avgWatchSeconds : 0,
          totalWatchSeconds: typeof ig.totalWatchSeconds === 'number' ? ig.totalWatchSeconds : 0,
        };
      };
      const insightCandidates = importedRows
        .filter((row) => !igInsightBundleHasMetrics(bundleFromRow(row)))
        .slice(0, 30);
      await runWithConcurrency(insightCandidates, 6, async (row) => {
        try {
          const reelish = isInstagramLikelyReel({
            media_type: row.mediaType ?? undefined,
            permalink: row.permalinkUrl ?? undefined,
          });
          const bundle = await fetchInstagramMediaInsightsBestEffort(row.platformPostId, account.accessToken, {
            isReel: reelish,
          });
          if (igInsightBundleHasMetrics(bundle)) {
            liveInstagramInsightBundles[row.platformPostId] = bundle;
          }
        } catch {
          // per-post best effort
        }
      });
      const thumbCandidates = importedRows
        .filter((row) => {
          if (row.thumbnailUrl) return false;
          const mt = (row.mediaType ?? '').toUpperCase();
          const url = (row.permalinkUrl ?? '').toLowerCase();
          return mt === 'VIDEO' || url.includes('/reel/');
        })
        .slice(0, 20);
      await runWithConcurrency(thumbCandidates, 8, async (row) => {
        try {
          const u = await refetchIgMediaThumbnail(row.platformPostId, account.accessToken);
          if (u) liveInstagramThumbnails[row.platformPostId] = u;
        } catch {
          // ignore
        }
      });
    }

    const serialized = importedRows.map((p) => {
      const enrich = account.platform === 'TWITTER' ? twitterEnrich[p.platformPostId] : undefined;
      const meta =
        p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
          ? (p.platformMetadata as Record<string, unknown>)
          : {};
      const dbFacebookInsights =
        p.platform === 'FACEBOOK' && meta.facebookInsights && typeof meta.facebookInsights === 'object' && !Array.isArray(meta.facebookInsights)
          ? (meta.facebookInsights as Record<string, number>)
          : undefined;
      const igMetaDb =
        p.platform === 'INSTAGRAM' && meta.instagram && typeof meta.instagram === 'object' && !Array.isArray(meta.instagram)
          ? (meta.instagram as {
              views?: number;
              reach?: number;
              impressionsLegacy?: number;
              totalInteractions?: number;
              avgWatchSeconds?: number;
              totalWatchSeconds?: number;
            })
          : null;
      const liveIgBundle = liveInstagramInsightBundles[p.platformPostId];
      const mergedIgInsight: IgMediaInsightBundle | null =
        p.platform === 'INSTAGRAM'
          ? {
              views: Math.max(liveIgBundle?.views ?? 0, typeof igMetaDb?.views === 'number' ? igMetaDb.views : 0),
              impressionsLegacy: Math.max(
                liveIgBundle?.impressionsLegacy ?? 0,
                typeof igMetaDb?.impressionsLegacy === 'number' ? igMetaDb.impressionsLegacy : 0
              ),
              reach: Math.max(liveIgBundle?.reach ?? 0, typeof igMetaDb?.reach === 'number' ? igMetaDb.reach : 0),
              totalInteractions: Math.max(
                liveIgBundle?.totalInteractions ?? 0,
                typeof igMetaDb?.totalInteractions === 'number' ? igMetaDb.totalInteractions : 0
              ),
              avgWatchSeconds: Math.max(
                liveIgBundle?.avgWatchSeconds ?? 0,
                typeof igMetaDb?.avgWatchSeconds === 'number' ? igMetaDb.avgWatchSeconds : 0
              ),
              totalWatchSeconds: Math.max(
                liveIgBundle?.totalWatchSeconds ?? 0,
                typeof igMetaDb?.totalWatchSeconds === 'number' ? igMetaDb.totalWatchSeconds : 0
              ),
            }
          : null;
      const igImpressionsSerialized =
        mergedIgInsight && p.platform === 'INSTAGRAM'
          ? mergedIgInsight.views > 0
            ? mergedIgInsight.views
            : mergedIgInsight.impressionsLegacy > 0
              ? mergedIgInsight.impressionsLegacy
              : mergedIgInsight.reach > 0
                ? mergedIgInsight.reach
                : p.impressions ?? 0
          : p.impressions ?? 0;
      const igCompatInsights =
        p.platform === 'INSTAGRAM' && mergedIgInsight
          ? (() => {
              const views = igImpressionsSerialized;
              const reach = mergedIgInsight.reach;
              const avgSec = mergedIgInsight.avgWatchSeconds;
              const totSec = mergedIgInsight.totalWatchSeconds;
              return {
                post_video_views: views,
                post_media_view: views,
                post_impressions_unique: reach,
                /** Reels `total_interactions` — not Facebook Page link clicks. */
                instagram_total_interactions: mergedIgInsight.totalInteractions,
                post_video_avg_time_watched: Math.round(avgSec * 1000),
                post_video_view_time: Math.round(totSec * 1000),
                post_reactions_like_total: p.likeCount ?? 0,
                post_comments: p.commentsCount ?? 0,
              };
            })()
          : undefined;
      const mergedFacebookInsights =
        p.platform === 'FACEBOOK'
          ? mergeFacebookInsightMaps(dbFacebookInsights, liveFacebookInsightsByPostId[p.platformPostId])
          : undefined;
      const facebookInsights =
        p.platform === 'FACEBOOK'
          ? mergedFacebookInsights
          : p.platform === 'INSTAGRAM'
            ? igCompatInsights
            : undefined;
      const fbImpressionsFromInsights =
        p.platform === 'FACEBOOK' && mergedFacebookInsights
          ? pickFacebookPostImpressionsFromInsightMap(mergedFacebookInsights).impressions
          : 0;
      const impressionsSerialized =
        p.platform === 'INSTAGRAM'
          ? igImpressionsSerialized
          : p.platform === 'FACEBOOK'
            ? Math.max(p.impressions ?? 0, fbImpressionsFromInsights)
            : p.impressions ?? 0;
      return {
        id: p.id,
        platformPostId: p.platformPostId,
        content: p.content,
        thumbnailUrl:
          enrich?.thumbnailUrl ??
          liveInstagramThumbnails[p.platformPostId] ??
          (account.platform === 'PINTEREST' ? pinterestThumbByPinId[p.platformPostId] : undefined) ??
          p.thumbnailUrl ??
          null,
        permalinkUrl: p.permalinkUrl,
        impressions: impressionsSerialized,
        interactions: p.interactions ?? 0,
        likeCount: enrich?.likeCount ?? p.likeCount ?? 0,
        commentsCount: enrich?.commentsCount ?? p.commentsCount ?? 0,
        repostsCount: enrich?.repostsCount ?? p.repostsCount ?? 0,
        sharesCount: p.sharesCount ?? 0,
        publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : String(p.publishedAt),
        mediaType: p.mediaType,
        platform: p.platform,
        ...(facebookInsights && Object.keys(facebookInsights).length > 0 ? { facebookInsights } : {}),
        ...(p.platform === 'FACEBOOK' || p.platform === 'PINTEREST' || p.platform === 'INSTAGRAM'
          ? {
              engagementBreakdown: {
                reactions: p.likeCount ?? 0,
                comments: p.commentsCount ?? 0,
                shares: p.sharesCount ?? 0,
                totalEngagement: (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0),
              },
            }
          : {}),
      };
    });

    // App-published targets not yet in importedPosts
    const appExtra = appTargets
      .filter((t) => !importedPostIds.has(t.platformPostId!))
      .map((t) => ({
        id: `target-${t.id}`,
        platformPostId: t.platformPostId ?? null,
        content: t.post?.content ?? null,
        thumbnailUrl: thumbnailUrlFromFirstPostMedia(t.post?.media[0]),
        permalinkUrl: null,
        impressions: 0,
        interactions: 0,
        likeCount: 0,
        commentsCount: 0,
        repostsCount: 0,
        sharesCount: 0,
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

type IgMediaInsightBundle = {
  views: number;
  impressionsLegacy: number;
  reach: number;
  /** Reels: Meta `total_interactions` (not the same as Facebook Page link clicks). */
  totalInteractions: number;
  /** Seconds (IG API) */
  avgWatchSeconds: number;
  /** Seconds (IG API) */
  totalWatchSeconds: number;
};

function igInsightMetricValue(row: { name?: string; values?: Array<{ value?: number }>; total_value?: { value?: number } }): number {
  if (typeof row.total_value?.value === 'number' && Number.isFinite(row.total_value.value)) {
    return row.total_value.value;
  }
  let sum = 0;
  for (const v of row.values ?? []) {
    if (typeof v.value === 'number' && Number.isFinite(v.value)) sum += v.value;
  }
  return sum;
}

function mergeIgInsightBundles(a: IgMediaInsightBundle, b: IgMediaInsightBundle): IgMediaInsightBundle {
  return {
    views: Math.max(a.views, b.views),
    impressionsLegacy: Math.max(a.impressionsLegacy, b.impressionsLegacy),
    reach: Math.max(a.reach, b.reach),
    totalInteractions: Math.max(a.totalInteractions, b.totalInteractions),
    avgWatchSeconds: Math.max(a.avgWatchSeconds, b.avgWatchSeconds),
    totalWatchSeconds: Math.max(a.totalWatchSeconds, b.totalWatchSeconds),
  };
}

function igInsightBundleHasMetrics(b: IgMediaInsightBundle): boolean {
  return (
    b.views > 0 ||
    b.reach > 0 ||
    b.impressionsLegacy > 0 ||
    b.totalInteractions > 0 ||
    b.avgWatchSeconds > 0 ||
    b.totalWatchSeconds > 0
  );
}

async function fetchInstagramMediaInsightsBestEffort(
  mediaId: string,
  accessToken: string,
  opts: { isReel: boolean }
): Promise<IgMediaInsightBundle> {
  const primary = await fetchInstagramMediaInsights(fbRestBaseUrl, mediaId, accessToken, opts);
  if (igInsightBundleHasMetrics(primary)) return primary;
  const secondary = await fetchInstagramMediaInsights(igGraphRestBaseUrl, mediaId, accessToken, opts);
  return mergeIgInsightBundles(primary, secondary);
}

/** Reels created after ~July 2024 need `views` (not deprecated `impressions`) per Meta IG Media Insights. */
async function fetchInstagramMediaInsights(
  baseUrl: string,
  mediaId: string,
  accessToken: string,
  opts: { isReel: boolean }
): Promise<IgMediaInsightBundle> {
  const out: IgMediaInsightBundle = {
    views: 0,
    impressionsLegacy: 0,
    reach: 0,
    totalInteractions: 0,
    avgWatchSeconds: 0,
    totalWatchSeconds: 0,
  };
  const metricSets = opts.isReel
    ? [
        'views,reach,ig_reels_avg_watch_time,ig_reels_video_view_total_time',
        'views,reach,total_interactions',
        'views,reach',
        'reach',
      ]
    : [
        'views,reach,impressions',
        'views,reach,total_interactions',
        'views,reach',
        'impressions,reach',
        'reach',
      ];
  for (const metric of metricSets) {
    try {
      const insightsRes = await axios.get<{
        data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
        error?: { message?: string };
      }>(`${baseUrl}/${mediaId}/insights`, {
        params: { metric, access_token: accessToken },
        timeout: 12_000,
        validateStatus: () => true,
      });
      if (insightsRes.status >= 400 || insightsRes.data?.error) continue;
      const data = insightsRes.data?.data ?? [];
      if (data.length === 0) continue;
      for (const d of data) {
        const val = igInsightMetricValue(d);
        if (d.name === 'views') out.views = val;
        if (d.name === 'impressions') out.impressionsLegacy = val;
        if (d.name === 'reach') out.reach = val;
        if (d.name === 'total_interactions') out.totalInteractions = val;
        if (d.name === 'ig_reels_avg_watch_time') out.avgWatchSeconds = val;
        if (d.name === 'ig_reels_video_view_total_time') out.totalWatchSeconds = val;
      }
      break;
    } catch {
      // try next metric set
    }
  }
  return out;
}

function isInstagramLikelyReel(m: {
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
}): boolean {
  const p = (m.permalink ?? '').toLowerCase();
  if (p.includes('/reel/')) return true;
  if ((m.media_product_type ?? '').toUpperCase() === 'REELS') return true;
  return (m.media_type ?? '').toUpperCase() === 'VIDEO';
}

type IgSyncMediaItem = {
  id: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  thumbnail_url?: string;
  like_count?: number;
  comments_count?: number;
};

type IgSyncMediaPage = {
  data?: Array<IgSyncMediaItem>;
  paging?: { next?: string; cursors?: { before?: string; after?: string } };
};

function mergeIgSyncMediaItem(a: IgSyncMediaItem, b: IgSyncMediaItem): IgSyncMediaItem {
  return {
    id: a.id,
    thumbnail_url: a.thumbnail_url || b.thumbnail_url,
    media_url: a.media_url || b.media_url,
    like_count: Math.max(a.like_count ?? 0, b.like_count ?? 0),
    comments_count: Math.max(a.comments_count ?? 0, b.comments_count ?? 0),
    caption: (a.caption?.length ?? 0) >= (b.caption?.length ?? 0) ? a.caption : b.caption,
    timestamp: a.timestamp || b.timestamp,
    media_type: a.media_type || b.media_type,
    media_product_type: a.media_product_type || b.media_product_type,
    permalink: a.permalink || b.permalink,
  };
}

async function collectInstagramMediaEdgeItems(
  apiBase: string,
  platformUserId: string,
  accessToken: string,
  edge: 'media' | 'tags',
  maxItems: number
): Promise<IgSyncMediaItem[]> {
  const fields =
    'id,media_type,media_product_type,media_url,permalink,caption,timestamp,thumbnail_url,like_count,comments_count';
  const pageLimit = 50;
  const out: IgSyncMediaItem[] = [];
  let nextUrl: string | null = `${apiBase}/${platformUserId}/${edge}`;
  const firstParams: Record<string, string | number> = {
    fields,
    access_token: accessToken,
    limit: pageLimit,
  };
  while (nextUrl && out.length < maxItems) {
    const isFirst = !nextUrl.includes('?');
    const res: AxiosResponse<IgSyncMediaPage> = await axios.get<IgSyncMediaPage>(
      nextUrl,
      isFirst ? { params: firstParams } : {}
    );
    const page = res.data?.data ?? [];
    for (const row of page) {
      if (out.length >= maxItems) break;
      out.push(row);
    }
    const paging = res.data?.paging;
    const nextFromMeta = paging?.next;
    const afterCursor = paging?.cursors?.after;
    const gotFullPage = page.length >= pageLimit;
    if (nextFromMeta && out.length < maxItems) {
      nextUrl = nextFromMeta;
    } else if (!nextFromMeta && afterCursor && gotFullPage && out.length < maxItems) {
      nextUrl = `${apiBase}/${platformUserId}/${edge}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(accessToken)}&limit=${pageLimit}&after=${encodeURIComponent(afterCursor)}`;
    } else {
      nextUrl = null;
    }
  }
  return out;
}

async function refetchIgMediaThumbnail(mediaId: string, accessToken: string): Promise<string | null> {
  for (const apiBase of [fbRestBaseUrl, igGraphRestBaseUrl]) {
    try {
      const refetch = await axios.get<{ thumbnail_url?: string; media_url?: string }>(
        `${apiBase}/${mediaId}`,
        { params: { fields: 'thumbnail_url,media_url', access_token: accessToken }, timeout: 8000 }
      );
      const u = refetch.data?.thumbnail_url ?? refetch.data?.media_url;
      if (u) return u;
    } catch {
      // try next host
    }
  }
  return null;
}

async function runWithConcurrency<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map((item) => fn(item)));
  }
}

async function syncImportedPosts(
  socialAccountId: string,
  platform: Platform,
  platformUserId: string,
  accessToken: string
): Promise<string | undefined> {
  if (platform === 'INSTAGRAM') {
    const maxMedia = 500;
    const merged = new Map<string, IgSyncMediaItem>();
    const igBases = [fbRestBaseUrl, igGraphRestBaseUrl];
    let primaryError: Error | null = null;

    for (const apiBase of igBases) {
      if (merged.size >= maxMedia) break;
      for (const edge of ['media', 'tags'] as const) {
        if (merged.size >= maxMedia) break;
        try {
          const chunk = await collectInstagramMediaEdgeItems(
            apiBase,
            platformUserId,
            accessToken,
            edge,
            maxMedia - merged.size
          );
          for (const m of chunk) {
            if (!m?.id) continue;
            const prev = merged.get(m.id);
            merged.set(m.id, prev ? mergeIgSyncMediaItem(prev, m) : m);
          }
        } catch (e) {
          if (apiBase === fbRestBaseUrl && edge === 'media') {
            primaryError = e instanceof Error ? e : new Error(String(e));
          }
        }
      }
    }

    if (merged.size === 0 && primaryError) {
      const msg = primaryError.message ?? '';
      const metaMsg = (primaryError as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
        ?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Instagram account to sync posts.';
      }
      if (metaMsg) return metaMsg;
      throw primaryError;
    }

    const items = Array.from(merged.values());

    for (const m of items) {
      const publishedAt = m.timestamp ? new Date(m.timestamp) : new Date();
      let thumbnailUrl: string | null =
        m.media_type === 'VIDEO'
          ? (m.thumbnail_url ?? m.media_url ?? null)
          : (m.media_url ?? m.thumbnail_url ?? null);
      if (!thumbnailUrl && m.media_type === 'CAROUSEL_ALBUM') {
        for (const apiBase of igBases) {
          try {
            const childRes = await axios.get<{ data?: Array<{ media_url?: string }> }>(
              `${apiBase}/${m.id}/children`,
              { params: { fields: 'media_url', access_token: accessToken } }
            );
            const first = childRes.data?.data?.[0];
            if (first?.media_url) {
              thumbnailUrl = first.media_url;
              break;
            }
          } catch {
            // try next host
          }
        }
      }
      if (!thumbnailUrl && (m.media_type === 'VIDEO' || isInstagramLikelyReel(m))) {
        const refetched = await refetchIgMediaThumbnail(m.id, accessToken);
        if (refetched) thumbnailUrl = refetched;
      }
      const likeCount = m.like_count ?? 0;
      const commentsCount = m.comments_count ?? 0;
      const interactions = likeCount + commentsCount;
      const reelish = isInstagramLikelyReel(m);
      const insightBundle = await fetchInstagramMediaInsightsBestEffort(m.id, accessToken, { isReel: reelish });
      const views = insightBundle.views;
      const impressions =
        views > 0
          ? views
          : insightBundle.impressionsLegacy > 0
            ? insightBundle.impressionsLegacy
            : insightBundle.reach > 0
              ? insightBundle.reach
              : 0;
      const instagramMeta = {
        views,
        reach: insightBundle.reach,
        impressionsLegacy: insightBundle.impressionsLegacy,
        avgWatchSeconds: insightBundle.avgWatchSeconds,
        totalWatchSeconds: insightBundle.totalWatchSeconds,
        mediaProductType: m.media_product_type ?? null,
      };
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
          likeCount,
          commentsCount,
          platformMetadata: { instagram: instagramMeta },
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
          likeCount,
          commentsCount,
          platformMetadata: { instagram: instagramMeta },
        },
      });
    }
    return undefined;
  }

  if (platform === 'FACEBOOK') {
    const maxPosts = 500;
    const fbPageToken = await resolveFacebookPageAccessToken(platformUserId, accessToken);
    let items: Awaited<ReturnType<typeof fetchAllPublishedPostsForPage>>['items'] = [];
    try {
      const fetched = await fetchAllPublishedPostsForPage(platformUserId, fbPageToken, maxPosts);
      items = fetched.items;
      const publishedIds = new Set(items.map((i) => i.id));
      try {
        const feed = await fetchAllPostsFeedForPage(platformUserId, fbPageToken, maxPosts);
        for (const f of feed.items) {
          if (publishedIds.has(f.id)) continue;
          publishedIds.add(f.id);
          items.push({
            id: f.id,
            message: f.message,
            created_time: f.created_time,
            permalink_url: f.permalink_url,
          });
        }
      } catch {
        // feed backfill is best-effort
      }

      items = sortFbPublishedPostsNewestFirst(items);

      try {
        const aux = await syncFacebookAuxiliaryIngest({
          socialAccountId,
          pageId: platformUserId,
          accessToken: fbPageToken,
        });
        if (aux.errors.length > 0) {
          console.warn('[FB sync] auxiliary ingest:', aux.errors.join('; '));
        }
      } catch (e) {
        console.warn('[FB sync] auxiliary ingest failed:', (e as Error)?.message ?? e);
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      if (msg.includes('OAuth') || msg.includes('permission') || msg.includes('access') || metaMsg?.toLowerCase().includes('token') || metaMsg?.toLowerCase().includes('permission')) {
        return 'Reconnect your Facebook Page to sync posts.';
      }
      if (metaMsg) return metaMsg;
      throw e;
    }

    /** Skip discovery for the dashboard sync path: use a hardcoded core list to avoid Vercel 30s timeout. */
    const POST_INSIGHT_FETCH_CAP = 72;
    // Newest posts first (see sortFbPublishedPostsNewestFirst) so recent reels always receive lifetime insights.
    const postMetricsSlice = [...FB_CORE_POST_LIFETIME_METRICS];
    const slice = items.slice(0, maxPosts);

    // Parallel post sync: fetch all posts concurrently (up to CONCURRENCY at a time) with a hard
    // wall-clock budget so we always return within the Vercel function timeout.
    const CONCURRENCY = 5;
    const BUDGET_MS = 20_000;
    const budgetDeadline = Date.now() + BUDGET_MS;

    async function processOnePost(p: (typeof slice)[number], idx: number) {
      const publishedAt = p.created_time ? new Date(p.created_time) : new Date();
      const likeCountFinal = p.reactions?.summary?.total_count ?? 0;
      const commentsCountFinal = p.comments?.summary?.total_count ?? 0;

      let impressions = 0;
      let insightMap: Record<string, number> = {};
      if (idx < POST_INSIGHT_FETCH_CAP && postMetricsSlice.length > 0 && Date.now() < budgetDeadline) {
        try {
          insightMap = await fetchPostLifetimeInsightMap(p.id, fbPageToken, postMetricsSlice);
        } catch { /* best-effort */ }
        impressions = pickFacebookPostImpressionsFromInsightMap(insightMap).impressions;
      } else if (idx >= POST_INSIGHT_FETCH_CAP) {
        const prev = await findImportedPostPrevSafe(socialAccountId, p.id);
        impressions = prev?.impressions ?? 0;
        const prevMeta = prev?.platformMetadata && typeof prev.platformMetadata === 'object' ? prev.platformMetadata as Record<string, unknown> : {};
        if (prevMeta.facebookInsights && typeof prevMeta.facebookInsights === 'object') {
          insightMap = prevMeta.facebookInsights as Record<string, number>;
        }
      }

      const sharesFromPayload = p.shares?.count ?? 0;
      const sharesCountFinal = typeof insightMap.post_shares === 'number' ? insightMap.post_shares : sharesFromPayload;
      const interactionsFinal = likeCountFinal + commentsCountFinal + sharesCountFinal;

      const mediaTypeGuess =
        p.status_type?.includes('VIDEO') || p.status_type?.includes('REEL')
          ? 'VIDEO'
          : p.attachments?.data?.[0]?.media_type === 'photo'
            ? 'IMAGE'
            : p.attachments?.data?.[0]?.media_type === 'video'
              ? 'VIDEO'
              : null;

      const platformMetadata = {
        status_type: p.status_type ?? null,
        attachmentTypes: (p.attachments?.data ?? []).map((a) => a.media_type ?? a.type).filter(Boolean),
        ...(Object.keys(insightMap).length > 0
          ? {
              facebookInsights: insightMap,
              impressionsMetricKey: pickFacebookPostImpressionsFromInsightMap(insightMap).metricUsed,
            }
          : {}),
      };

      await upsertImportedPostWithFallback({
        socialAccountId,
        platformPostId: p.id,
        updateData: {
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: mediaTypeGuess,
          platformMetadata: platformMetadata as object,
          impressions,
          interactions: interactionsFinal,
          likeCount: likeCountFinal,
          commentsCount: commentsCountFinal,
          sharesCount: sharesCountFinal,
          syncedAt: new Date(),
        },
        createData: {
          socialAccountId,
          platformPostId: p.id,
          platform,
          content: p.message ?? null,
          thumbnailUrl: p.full_picture ?? null,
          permalinkUrl: p.permalink_url ?? null,
          publishedAt,
          mediaType: mediaTypeGuess,
          platformMetadata: platformMetadata as object,
          impressions,
          interactions: interactionsFinal,
          likeCount: likeCountFinal,
          commentsCount: commentsCountFinal,
          sharesCount: sharesCountFinal,
        },
      });
    }

    // Process in parallel batches; stop if budget expires.
    for (let i = 0; i < slice.length && Date.now() < budgetDeadline; i += CONCURRENCY) {
      const batch = slice.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map((p, j) => processOnePost(p, i + j)));
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
          attachments?: { media_keys?: string[] };
          public_metrics?: {
            like_count?: number;
            retweet_count?: number;
            reply_count?: number;
            impression_count?: number;
            quote_count?: number;
          };
        }>;
        includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string }> };
      }>(`https://api.twitter.com/2/users/${platformUserId}/tweets`, {
        params: {
          max_results: 50,
          'tweet.fields': 'created_at,public_metrics,attachments',
          expansions: 'attachments.media_keys',
          'media.fields': 'url,preview_image_url',
          exclude: 'retweets,replies',
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const items = tweetsRes.data?.data ?? [];
      const mediaList = tweetsRes.data?.includes?.media ?? [];
      const mediaByKey = new Map(mediaList.map((m) => [m.media_key, m]));
      for (const t of items) {
        const publishedAt = t.created_at ? new Date(t.created_at) : new Date();
        const permalinkUrl = `https://x.com/i/status/${t.id}`;
        const impressions = t.public_metrics?.impression_count ?? 0;
        const likeCount = t.public_metrics?.like_count ?? 0;
        const replyCount = t.public_metrics?.reply_count ?? 0;
        const retweetCount = t.public_metrics?.retweet_count ?? 0;
        const quoteCount = t.public_metrics?.quote_count ?? 0;
        const interactions = likeCount + replyCount + retweetCount + quoteCount;
        const firstMediaKey = t.attachments?.media_keys?.[0];
        const firstMedia = firstMediaKey ? mediaByKey.get(firstMediaKey) : undefined;
        const thumbnailUrl = firstMedia?.preview_image_url ?? firstMedia?.url ?? null;
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
            likeCount,
            commentsCount: replyCount,
            repostsCount: retweetCount,
            sharesCount: 0,
            thumbnailUrl,
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
            likeCount,
            commentsCount: replyCount,
            repostsCount: retweetCount,
            sharesCount: 0,
            thumbnailUrl,
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
        const likeCount = v.like_count ?? 0;
        const commentsCount = v.comment_count ?? 0;
        const interactions = likeCount + commentsCount;
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } },
          update: { content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, likeCount, commentsCount, syncedAt: new Date() },
          create: { socialAccountId, platformPostId: videoId, platform: 'TIKTOK', content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, likeCount, commentsCount },
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
        const likeCount = stats.likeCount;
        const commentsCount = stats.commentCount;
        const interactions = likeCount + commentsCount;
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } },
          update: { content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, likeCount, commentsCount, syncedAt: new Date() },
          create: { socialAccountId, platformPostId: videoId, platform: 'YOUTUBE', content: title, thumbnailUrl, permalinkUrl, publishedAt, mediaType: 'VIDEO', impressions, interactions, likeCount, commentsCount },
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

  if (platform === 'PINTEREST') {
    type PinItem = {
      id?: string;
      title?: string;
      description?: string;
      created_at?: string;
      link?: string;
      media?: unknown;
    };
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const collected: PinItem[] = [];
      let bookmark: string | undefined;
      let pages = 0;
      while (pages < 15) {
        const res = await axios.get<{ items?: PinItem[]; bookmark?: string }>('https://api.pinterest.com/v5/pins', {
          headers,
          params: { page_size: 25, ...(bookmark ? { bookmark } : {}) },
          validateStatus: () => true,
          timeout: 25_000,
        });
        if (res.status !== 200) {
          const err = res.data as { message?: string; code?: number };
          const msg = typeof err === 'object' && err && 'message' in err ? String(err.message) : JSON.stringify(res.data).slice(0, 200);
          if (res.status === 401 || res.status === 403) {
            return 'Reconnect your Pinterest account to sync pins (pins:read scope).';
          }
          return `Pinterest pins sync failed (${res.status}): ${msg}`;
        }
        const items = res.data?.items ?? [];
        collected.push(...items);
        bookmark = res.data?.bookmark;
        if (!bookmark || items.length === 0) break;
        pages++;
      }

      for (const pin of collected) {
        const pinId = pin.id;
        if (!pinId) continue;
        const publishedAt = pin.created_at ? new Date(pin.created_at) : new Date();
        const content = (pin.title ?? pin.description ?? '').trim() || null;
        let thumbnailUrl = pickPinThumbnailFromMedia(pin.media);
        if (!thumbnailUrl) {
          const detailMedia = await fetchPinterestPinMedia(pinId, headers);
          thumbnailUrl = pickPinThumbnailFromMedia(detailMedia);
        }
        const permalinkUrl = `https://www.pinterest.com/pin/${pinId}/`;
        const listMt =
          pin.media && typeof pin.media === 'object' && 'media_type' in pin.media
            ? String((pin.media as { media_type?: string }).media_type ?? '').toLowerCase()
            : '';
        const mediaType = listMt === 'video' ? 'VIDEO' : 'IMAGE';
        const impressions = 0;
        const interactions = 0;
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: pinId } },
          update: {
            content,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType,
            impressions,
            interactions,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: pinId,
            platform: 'PINTEREST',
            content,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType,
            impressions,
            interactions,
          },
        });
      }
      return undefined;
    } catch (e) {
      const msg = (e as Error)?.message ?? '';
      if (msg.includes('401') || msg.includes('403')) return 'Reconnect your Pinterest account to sync pins.';
      console.error('[Pinterest sync]', msg);
      return `Pinterest sync failed: ${msg.slice(0, 200)}`;
    }
  }

  // Other platforms: no sync for now
  return undefined;
}
