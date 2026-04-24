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
import { META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';
import { getValidPinterestToken } from '@/lib/pinterest-token';
import { parseTikTokVideoEngagement, parseTikTokVideoDurationSec } from '@/lib/tiktok/video-engagement';
import { syncLinkedInUgcPosts } from '@/lib/linkedin/sync-ugc-posts';
import {
  buildYoutubePrimaryPermalink,
  classifyYoutubeVideoFormat,
  parseYoutubeIso8601DurationSeconds,
} from '@/lib/youtube-video-format';
import { fetchYoutubeVideoStatsByIdMap, type YtVideoStatsRow } from '@/lib/youtube/fetch-video-stats-batch';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';
import { fetchTweetsByIdsBatched, metricsFromTweetPayload } from '@/lib/x/twitter-tweets-batch';
import { refreshTwitterToken } from '@/lib/twitter-refresh';
import { isMetaNonCriticalThrottled, noteMetaRateLimitError, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';

export const maxDuration = 60;

/** Fallback host for IG user/media when graph.facebook.com omits items (matches insights route). */
const igGraphRestBaseUrl = 'https://graph.instagram.com/v18.0';


const FB_CORE_POST_LIFETIME_METRICS = [
  'post_reactions_like_total',
  'post_comments',
  'post_shares',
  'post_impressions',
  'post_impressions_unique',
  'post_media_view',
  'post_total_media_view_unique',
  'post_video_views',
  'post_video_avg_time_watched',
  'post_video_view_time',
] as const;

type YtPlaylistItem = {
  snippet?: {
    publishedAt?: string;
    title?: string;
    thumbnails?: { medium?: { url?: string }; default?: { url?: string } };
    resourceId?: { videoId?: string };
  };
};

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

function isFacebookVideoLikeImportedRow(p: ImportedPostListRow): boolean {
  const url = (p.permalinkUrl ?? '').toLowerCase();
  if ((p.mediaType ?? '').toUpperCase() === 'VIDEO') return true;
  if (url.includes('/reel/') || url.includes('/reels/')) return true;
  if (url.includes('/videos/')) return true;
  if (url.includes('fb.watch')) return true;
  const meta =
    p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
      ? (p.platformMetadata as Record<string, unknown>)
      : {};
  const st = String(meta.status_type ?? '').toUpperCase();
  if (st.includes('REEL') || st.includes('VIDEO') || st.includes('LIVE') || st.includes('ADDED_VIDEO')) return true;
  const rawAtt = meta.attachmentTypes;
  if (Array.isArray(rawAtt)) {
    for (const t of rawAtt) {
      if (String(t).toLowerCase() === 'video') return true;
    }
  }
  return false;
}

/** True when stored Graph lifetime map has no usable view signal (common when sync hit the insight cap on older ordering). */
function facebookStoredInsightsLackViewSignal(meta: Record<string, unknown>): boolean {
  const fi = meta.facebookInsights;
  if (!fi || typeof fi !== 'object' || Array.isArray(fi)) return true;
  const m = fi as Record<string, number>;
  const signal = Math.max(
    m.post_media_view ?? 0,
    m.post_total_media_view_unique ?? 0,
    m.post_video_views ?? 0,
    m.post_impressions ?? 0,
    m.post_impressions_unique ?? 0
  );
  return signal === 0;
}

function parseGraphInsightRowsToMap(
  rows: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }> | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows ?? []) {
    const key = String(row?.name ?? '').trim();
    if (!key) continue;
    const totalRaw = row?.total_value?.value;
    if (typeof totalRaw === 'number' && Number.isFinite(totalRaw)) {
      out[key] = totalRaw;
      continue;
    }
    if (typeof totalRaw === 'string' && totalRaw.trim() !== '' && !Number.isNaN(Number(totalRaw))) {
      out[key] = Number(totalRaw);
      continue;
    }
    let sum = 0;
    let any = false;
    for (const point of row?.values ?? []) {
      const v = point?.value;
      if (typeof v === 'number' && Number.isFinite(v)) {
        sum += v;
        any = true;
      } else if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) {
        sum += Number(v);
        any = true;
      }
    }
    if (any) out[key] = sum;
  }
  return out;
}

async function fetchFacebookPostSnapshotMap(postId: string, pageAccessToken: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    const res = await axios.get<{
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
      shares?: { count?: number };
      insights?: {
        data?: Array<{ name?: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
      };
    }>(`${fbRestBaseUrl}/${postId}`, {
      params: {
        fields:
          'reactions.summary(1),comments.summary(1),shares,insights.metric(post_media_view,post_total_media_view_unique,post_video_views,post_impressions,post_impressions_unique,post_reactions_like_total,post_comments,post_shares)',
        access_token: pageAccessToken,
      },
      timeout: 12_000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || !res.data) return out;
    const likes = res.data.reactions?.summary?.total_count;
    const comments = res.data.comments?.summary?.total_count;
    const shares = res.data.shares?.count;
    if (typeof likes === 'number' && likes >= 0) out.post_reactions_like_total = likes;
    if (typeof comments === 'number' && comments >= 0) out.post_comments = comments;
    const sharesFromObject = typeof shares === 'number' && shares >= 0 ? shares : 0;
    Object.assign(out, parseGraphInsightRowsToMap(res.data.insights?.data));
    const sharesFromInsights = typeof out.post_shares === 'number' && out.post_shares >= 0 ? out.post_shares : 0;
    /** Reels often omit or zero `post_shares` in insights while `shares.count` on the node is correct. */
    out.post_shares = Math.max(sharesFromObject, sharesFromInsights);
  } catch {
    // best effort
  }
  return out;
}

type FacebookThumbAttachmentNode = {
  media?: { image?: { src?: string } };
  subattachments?: { data?: FacebookThumbAttachmentNode[] };
};

type FacebookThumbPostNode = {
  full_picture?: string;
  attachments?: { data?: FacebookThumbAttachmentNode[] };
};

function pickFacebookThumbnailFromPublishedPost(p: FacebookThumbPostNode): string | null {
  const full = typeof p.full_picture === 'string' ? p.full_picture.trim() : '';
  if (full) return full;
  const first = p.attachments?.data?.[0];
  const top = first?.media?.image?.src?.trim();
  if (top) return top;
  for (const sub of first?.subattachments?.data ?? []) {
    const u = sub.media?.image?.src?.trim();
    if (u) return u;
  }
  return null;
}

async function fetchFacebookPostThumbnail(postId: string, pageAccessToken: string): Promise<string | null> {
  try {
    const res = await axios.get<FacebookThumbPostNode>(`${fbRestBaseUrl}/${postId}`, {
      params: {
        fields: 'full_picture,attachments{media{image{src}},subattachments{media{image{src}}}}',
        access_token: pageAccessToken,
      },
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || !res.data) return null;
    return pickFacebookThumbnailFromPublishedPost(res.data);
  } catch {
    return null;
  }
}

function extractOgImageFromHtml(html: string): string | null {
  if (!html) return null;
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    const url = m?.[1]?.trim();
    if (url && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

async function fetchOpenGraphThumbnail(permalinkUrl: string): Promise<string | null> {
  try {
    const res = await fetch(permalinkUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Agent4SocialsBot/1.0; +https://agent4socials.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const ctype = (res.headers.get('content-type') ?? '').toLowerCase();
    if (ctype && !ctype.includes('text/html')) return null;
    const html = await res.text();
    return extractOgImageFromHtml(html);
  } catch {
    return null;
  }
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
  savesCount: number | null;
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

/** Deploys before migration `20260408153000_imported_post_saves_count` have no column; Prisma P2022 would 500 the whole posts list. */
function isMissingImportedPostSavesCountColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string; meta?: { column?: string } };
  const msg = (e?.message ?? '').toLowerCase();
  const col = (e?.meta?.column ?? '').toLowerCase();
  return e?.code === 'P2022' && (msg.includes('savescount') || col.includes('savescount'));
}

const IMPORTED_POST_LIST_SELECT_CORE = {
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
} as const;

async function listImportedPostsSafe(socialAccountId: string): Promise<ImportedPostListRow[]> {
  const base = { where: { socialAccountId }, orderBy: { publishedAt: 'desc' as const }, take: 500 };

  try {
    return await prisma.importedPost.findMany({
      ...base,
      select: { ...IMPORTED_POST_LIST_SELECT_CORE, savesCount: true, platformMetadata: true },
    });
  } catch (e) {
    if (isMissingImportedPostSavesCountColumn(e)) {
      try {
        const rows = await prisma.importedPost.findMany({
          ...base,
          select: { ...IMPORTED_POST_LIST_SELECT_CORE, platformMetadata: true },
        });
        return rows.map((r) => ({ ...r, savesCount: null }));
      } catch (e2) {
        if (isMissingImportedPostPlatformMetadataColumn(e2)) {
          const rows = await prisma.importedPost.findMany({
            ...base,
            select: { ...IMPORTED_POST_LIST_SELECT_CORE },
          });
          return rows.map((r) => ({ ...r, savesCount: null, platformMetadata: null }));
        }
        throw e2;
      }
    }
    if (isMissingImportedPostPlatformMetadataColumn(e)) {
      try {
        const rows = await prisma.importedPost.findMany({
          ...base,
          select: { ...IMPORTED_POST_LIST_SELECT_CORE, savesCount: true },
        });
        return rows.map((r) => ({ ...r, platformMetadata: null }));
      } catch (e2) {
        if (isMissingImportedPostSavesCountColumn(e2)) {
          const rows = await prisma.importedPost.findMany({
            ...base,
            select: { ...IMPORTED_POST_LIST_SELECT_CORE },
          });
          return rows.map((r) => ({ ...r, platformMetadata: null, savesCount: null }));
        }
        throw e2;
      }
    }
    throw e;
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

/** Pinterest media payload can vary between list/detail endpoints; infer canonical post format. */
function inferPinterestMediaType(media: unknown): 'VIDEO' | 'IMAGE' | null {
  if (!media || typeof media !== 'object' || Array.isArray(media)) return null;
  const m = media as Record<string, unknown>;
  const mt = String(m.media_type ?? '').toLowerCase();
  if (mt === 'video' || mt === 'animated_gif') return 'VIDEO';
  if (mt === 'image') return 'IMAGE';

  // Detail payloads often expose video payloads under one of these keys.
  const hasVideoPayload = ['video', 'videos', 'video_list', 'story_pin_data'].some((k) => {
    const v = m[k];
    return typeof v === 'object' && v !== null;
  });
  if (hasVideoPayload) return 'VIDEO';

  // Image-like payloads still indicate a static Pin.
  const hasImagePayload =
    typeof m.cover_image_url === 'string' ||
    (typeof m.images === 'object' && m.images !== null);
  if (hasImagePayload) return 'IMAGE';
  return null;
}

type PinterestPinMetricsBucket = Record<string, number>;

function toFiniteInt(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

function pinterestMetricFromBucket(bucket: PinterestPinMetricsBucket | null | undefined, keys: string[]): number {
  if (!bucket) return 0;
  for (const k of keys) {
    const v = bucket[k];
    const n = toFiniteInt(v);
    if (n > 0) return n;
  }
  // Pinterest sometimes returns lowercase snake keys in examples; tolerate case drift.
  const lowerMap = new Map<string, number>();
  for (const [k, v] of Object.entries(bucket)) {
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    lowerMap.set(k.toLowerCase(), Math.max(0, Math.round(v)));
  }
  for (const k of keys) {
    const n = lowerMap.get(k.toLowerCase());
    if (typeof n === 'number' && n > 0) return n;
  }
  return 0;
}

function pickPinterestPinMetricsLifetimeBucket(pinMetrics: unknown): PinterestPinMetricsBucket | null {
  if (!pinMetrics || typeof pinMetrics !== 'object' || Array.isArray(pinMetrics)) return null;
  const pm = pinMetrics as Record<string, unknown>;
  const lm = pm.lifetime_metrics;
  if (lm && typeof lm === 'object' && !Array.isArray(lm)) return lm as PinterestPinMetricsBucket;
  const nested = pm.lifetime;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) return nested as PinterestPinMetricsBucket;
  return null;
}

function pickPinterestPinMetrics90dBucket(pinMetrics: unknown): PinterestPinMetricsBucket | null {
  if (!pinMetrics || typeof pinMetrics !== 'object' || Array.isArray(pinMetrics)) return null;
  const pm = pinMetrics as Record<string, unknown>;
  const b90 = pm['90d'];
  if (b90 && typeof b90 === 'object' && !Array.isArray(b90)) return b90 as PinterestPinMetricsBucket;
  return null;
}

/** Pinterest `VIDEO_AVG_WATCH_TIME` is typically in ms (see API examples); keep a small guard for seconds-like values. */
function pinterestVideoAvgWatchMs(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // If it looks like seconds for a short clip, promote to ms.
  if (raw > 0 && raw < 250) return raw * 1000;
  return raw;
}

function extractPinterestImportedPostMetrics(args: {
  mediaType: 'VIDEO' | 'IMAGE' | string | null | undefined;
  pinMetrics: unknown;
}): {
  impressions: number;
  interactions: number;
  likeCount: number;
  commentsCount: number;
  sharesCount: number;
  savesCount: number;
  /** Best-effort Meta-shaped fields for shared dashboard helpers (watch times are ms). */
  facebookInsightsCompat: Record<string, number>;
} {
  const mt = String(args.mediaType ?? '').toUpperCase();
  const isVideo = mt === 'VIDEO';
  const lifetime = pickPinterestPinMetricsLifetimeBucket(args.pinMetrics);
  const d90 = pickPinterestPinMetrics90dBucket(args.pinMetrics);

  const reactions = pinterestMetricFromBucket(lifetime, ['TOTAL_REACTIONS', 'REACTION', 'reaction']) ||
    pinterestMetricFromBucket(d90, ['reaction']);
  const comments = pinterestMetricFromBucket(lifetime, ['TOTAL_COMMENTS', 'COMMENT', 'comment']) ||
    pinterestMetricFromBucket(d90, ['comment']);
  const saves = pinterestMetricFromBucket(lifetime, ['SAVE', 'save']) || pinterestMetricFromBucket(d90, ['save']);
  const pinClicks = pinterestMetricFromBucket(lifetime, ['PIN_CLICK', 'pin_click']) || pinterestMetricFromBucket(d90, ['pin_click']);
  const outboundClicks =
    pinterestMetricFromBucket(lifetime, ['OUTBOUND_CLICK', 'OUTBOUND_CLICKS', 'outbound_click']) ||
    pinterestMetricFromBucket(d90, ['clickthrough', 'OUTBOUND_CLICK']);

  const impressionImage =
    pinterestMetricFromBucket(lifetime, ['IMPRESSION', 'impression']) || pinterestMetricFromBucket(d90, ['impression']);

  const videoMrc =
    pinterestMetricFromBucket(lifetime, ['VIDEO_MRC_VIEW', 'VIDEO_MRC_VIEWS']) || pinterestMetricFromBucket(d90, ['VIDEO_MRC_VIEW']);
  const videoStarts =
    pinterestMetricFromBucket(lifetime, ['VIDEO_START', 'VIDEO_STARTS']) || pinterestMetricFromBucket(d90, ['VIDEO_START']);
  const videoAvgWatchRaw =
    pinterestMetricFromBucket(lifetime, ['VIDEO_AVG_WATCH_TIME']) || pinterestMetricFromBucket(d90, ['VIDEO_AVG_WATCH_TIME']);
  const videoV50WatchRaw =
    pinterestMetricFromBucket(lifetime, ['VIDEO_V50_WATCH_TIME']) || pinterestMetricFromBucket(d90, ['VIDEO_V50_WATCH_TIME']);

  const plays = isVideo ? Math.max(videoMrc, videoStarts, impressionImage) : impressionImage;

  // `interactions` is our product-level rollup for dashboards: reactions + comments + saves + clicks.
  const interactions = reactions + comments + saves + pinClicks + outboundClicks;

  const avgWatchMsFromApi = videoAvgWatchRaw > 0 ? pinterestVideoAvgWatchMs(videoAvgWatchRaw) : 0;
  const totalWatchMs =
    videoV50WatchRaw > 0
      ? Math.max(0, videoV50WatchRaw)
      : avgWatchMsFromApi > 0 && plays > 0
        ? avgWatchMsFromApi * plays
        : 0;

  const facebookInsightsCompat: Record<string, number> = {};
  if (plays > 0) {
    facebookInsightsCompat.post_video_views = plays;
    facebookInsightsCompat.post_media_view = plays;
  }
  if (impressionImage > 0) {
    facebookInsightsCompat.post_impressions = impressionImage;
  }
  if (avgWatchMsFromApi > 0) {
    // Keep consistent with Meta fields used by `getWatchTimes` (avg is ms).
    facebookInsightsCompat.post_video_avg_time_watched = Math.round(avgWatchMsFromApi);
  }
  if (totalWatchMs > 0) {
    facebookInsightsCompat.post_video_view_time = Math.round(totalWatchMs);
  }

  return {
    impressions: Math.max(0, plays),
    interactions: Math.max(0, interactions),
    likeCount: Math.max(0, reactions),
    commentsCount: Math.max(0, comments),
    // Product mapping: treat Pinterest Saves as "shares" in our generic post model.
    sharesCount: Math.max(0, saves),
    savesCount: Math.max(0, saves),
    facebookInsightsCompat,
  };
}

async function fetchPinterestPinDetail(
  pinId: string,
  headers: Record<string, string>,
): Promise<{ media: unknown | null; pin_metrics: unknown | null } | null> {
  try {
    const res = await axios.get<{
      media?: unknown;
      pin_metrics?: unknown;
    }>(`https://api.pinterest.com/v5/pins/${encodeURIComponent(pinId)}`, {
      headers,
      params: { pin_metrics: true },
      validateStatus: () => true,
      timeout: 12_000,
    });
    if (res.status !== 200) return null;
    return { media: res.data?.media ?? null, pin_metrics: res.data?.pin_metrics ?? null };
  } catch {
    return null;
  }
}

async function fetchPinterestPinMedia(
  pinId: string,
  headers: Record<string, string>,
): Promise<unknown | null> {
  const detail = await fetchPinterestPinDetail(pinId, headers);
  return detail?.media ?? null;
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

/** Permalink for Composer-published IG media before it appears in media list sync. */
async function fetchInstagramMediaPermalink(mediaId: string, accessToken: string): Promise<string | null> {
  const igHost = `https://graph.instagram.com/${META_GRAPH_FACEBOOK_API_VERSION}`;
  for (const base of [fbRestBaseUrl, igHost]) {
    try {
      const res = await axios.get(`${base}/${encodeURIComponent(mediaId)}`, {
        params: { fields: 'permalink', access_token: accessToken },
        timeout: 8000,
        validateStatus: () => true,
      });
      noteMetaUsageFromHeaders(res.headers);
      if (res.status !== 200) continue;
      const perm = (res.data as { permalink?: string })?.permalink;
      if (typeof perm === 'string' && perm.trim()) return perm.trim();
    } catch {
      /* try next host */
    }
  }
  return null;
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

/**
 * GET: list imported posts for this account.
 * - `sync=1`: sync from platform first then return.
 * - `force=1`: with `sync=1`, bypass the 10-minute per-account cooldown (manual refresh).
 * - `liveEnrich=1`: opt-in live Facebook/Instagram Graph calls to fill missing post metrics on read
 *   (otherwise we only use DB + sync; avoids ShadowIGMedia/insights bursts on dashboard prefetch).
 *   Instagram media insights on read require `liveEnrich=1` (never implied by missing fields alone).
 */
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
      select: {
        id: true,
        userId: true,
        platform: true,
        platformUserId: true,
        accessToken: true,
        refreshToken: true,
        expiresAt: true,
        username: true,
        credentialsJson: true,
        lastSyncAttemptAt: true,
      },
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
    const force = request.nextUrl.searchParams.get('force') === '1';
    const liveEnrich = request.nextUrl.searchParams.get('liveEnrich') === '1';
    const metaThrottle = account.platform === 'INSTAGRAM' && isMetaNonCriticalThrottled();
    let syncError: string | undefined;
    let syncSkippedDueToCooldown = false;
    if (sync) {
      // Skip the expensive platform sync if it ran within the last 10 minutes, unless force=1.
      const SYNC_COOLDOWN_MS = 10 * 60 * 1000;
      const lastSync = account.lastSyncAttemptAt?.getTime() ?? 0;
      const recentEnough = !force && Date.now() - lastSync < SYNC_COOLDOWN_MS;
      if (recentEnough) {
        syncSkippedDueToCooldown = true;
        console.log('[posts] skipping sync — ran', Math.round((Date.now() - lastSync) / 1000), 's ago');
      } else {
        // Stamp attempt time before calling out so re-entrant requests skip it too.
        await prisma.socialAccount.update({
          where: { id: account.id },
          data: { lastSyncAttemptAt: new Date() },
        }).catch(() => { /* non-fatal */ });
        try {
          syncError = await syncImportedPosts(
            account.id,
            account.platform,
            account.platformUserId,
            account.accessToken,
            account.credentialsJson
          );
        } catch (e) {
          console.error('[Imported posts] sync error:', e);
            const msg = (e as Error)?.message ?? '';
            const metaMsg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
            syncError = metaMsg || msg || 'Sync failed. Try reconnecting your account.';
        }
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

    // For Twitter: batched `GET /2/tweets?ids=` (up to 100 per call) so imported rows AND composer-published
    // targets get public_metrics / impressions. Previously we only enriched when importedRows was non-empty,
    // so app-published tweets appeared in Content History with all zeros.
    type TwitterEnrichRow = {
      likeCount: number;
      commentsCount: number;
      repostsCount: number;
      quoteCount: number;
      impressions: number;
      thumbnailUrl: string | null;
    };
    let twitterEnrich: Record<string, TwitterEnrichRow> = {};
    let xApiBudgetError: string | undefined;
    if (account.platform === 'TWITTER') {
      const ids = [
        ...new Set(
          [
            ...importedRows.map((r) => r.platformPostId),
            ...appTargets.map((t) => t.platformPostId).filter(Boolean),
          ].filter(Boolean) as string[]
        ),
      ];
      const bearerOk = account.accessToken && account.accessToken !== 'oauth1';
      if (ids.length > 0 && bearerOk) {
        let bearer = account.accessToken;
        if (account.refreshToken) {
          const expiresAtMs = account.expiresAt ? new Date(account.expiresAt).getTime() : 0;
          const fiveMinMs = 5 * 60 * 1000;
          if (!expiresAtMs || Date.now() + fiveMinMs >= expiresAtMs) {
            try {
              const refreshed = await refreshTwitterToken(account.refreshToken);
              bearer = refreshed.accessToken;
              await prisma.socialAccount
                .update({
                  where: { id: account.id },
                  data: {
                    accessToken: refreshed.accessToken,
                    ...(refreshed.refreshToken ? { refreshToken: refreshed.refreshToken } : {}),
                    expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
                  },
                })
                .catch(() => {
                  /* non-fatal */
                });
            } catch {
              /* use existing bearer */
            }
          }
        }
        try {
          const { byId, mediaByKey } = await fetchTweetsByIdsBatched(account.id, bearer, ids);
        for (const [tid, t] of byId) {
          const m = metricsFromTweetPayload(t);
          const firstMediaKey = t.attachments?.media_keys?.[0];
          const firstMedia = firstMediaKey ? mediaByKey.get(firstMediaKey) : undefined;
          const thumbnailUrl = firstMedia?.preview_image_url ?? firstMedia?.url ?? null;
          twitterEnrich[tid] = {
            likeCount: m.like_count,
            commentsCount: m.reply_count,
            repostsCount: m.retweet_count,
            quoteCount: m.quote_count,
            impressions: m.impression_count,
            thumbnailUrl,
          };
          try {
            await prisma.postPerformance.upsert({
              where: {
                socialAccountId_platformPostId: { socialAccountId: account.id, platformPostId: tid },
              },
              create: {
                userId: account.userId,
                socialAccountId: account.id,
                platform: 'TWITTER',
                platformPostId: tid,
                impressions: m.impression_count,
                clicks: 0,
                comments: m.reply_count,
                shares: m.retweet_count + m.quote_count,
                metricsRaw: {
                  likes: m.like_count,
                  quotes: m.quote_count,
                  public_metrics: t.public_metrics ?? null,
                  organic_metrics: t.organic_metrics ?? null,
                } as object,
              },
              update: {
                impressions: m.impression_count,
                comments: m.reply_count,
                shares: m.retweet_count + m.quote_count,
                metricsRaw: {
                  likes: m.like_count,
                  quotes: m.quote_count,
                  public_metrics: t.public_metrics ?? null,
                  organic_metrics: t.organic_metrics ?? null,
                } as object,
              },
            });
          } catch {
            /* non-fatal */
          }
        }
      } catch {
        // non-fatal; use DB values
      }
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

    /** Facebook: backfill missing thumbnails from attachment image sources. */
    const facebookThumbByPostId: Record<string, string> = {};
    if (account.platform === 'FACEBOOK' && importedRows.length > 0) {
      try {
        const fbPageToken = await resolveFacebookPageAccessToken(account.platformUserId, account.accessToken);
        const missing = importedRows.filter((r) => !r.thumbnailUrl?.trim()).slice(0, 40);
        await runWithConcurrency(missing, 6, async (r) => {
          const url = await fetchFacebookPostThumbnail(r.platformPostId, fbPageToken);
          if (!url) return;
          facebookThumbByPostId[r.platformPostId] = url;
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
        });
      } catch (e) {
        console.warn('[Imported posts] Facebook thumb enrich on read:', (e as Error)?.message ?? e);
      }
    }

    /** Generic: when no stored thumbnail exists, try scraping `og:image` from permalink pages. */
    const ogThumbByPostId: Record<string, string> = {};
    {
      const missing = importedRows
        .filter((r) => !r.thumbnailUrl?.trim())
        .filter((r) => {
          const u = (r.permalinkUrl ?? '').trim();
          return /^https?:\/\//i.test(u);
        })
        .slice(0, 30);
      await runWithConcurrency(missing, 4, async (r) => {
        const url = await fetchOpenGraphThumbnail(String(r.permalinkUrl));
        if (!url) return;
        ogThumbByPostId[r.platformPostId] = url;
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
      });
    }

    /** Pinterest: older rows synced before `pin_metrics` support are all-zero in DB; refresh a small slice on read. */
    if (account.platform === 'PINTEREST' && importedRows.length > 0 && account.accessToken) {
      try {
        const headers = { Authorization: `Bearer ${account.accessToken}` };
        const candidates = importedRows
          .filter((r) => {
            if (r.platform !== 'PINTEREST') return false;
            const eng =
              (r.likeCount ?? 0) +
              (r.commentsCount ?? 0) +
              (r.sharesCount ?? 0) +
              (r.savesCount ?? 0) +
              (r.interactions ?? 0);
            const meta =
              r.platformMetadata && typeof r.platformMetadata === 'object' && !Array.isArray(r.platformMetadata)
                ? (r.platformMetadata as Record<string, unknown>)
                : {};
            const pm = meta.pinterest && typeof meta.pinterest === 'object' && !Array.isArray(meta.pinterest) ? (meta.pinterest as Record<string, unknown>) : {};
            const hasMetrics = Boolean(pm.pin_metrics);
            return eng <= 0 || !hasMetrics;
          })
          .slice(0, 40);

        await runWithConcurrency(candidates, 5, async (row) => {
          const detail = await fetchPinterestPinDetail(row.platformPostId, headers);
          if (!detail?.pin_metrics) return;
          const extracted = extractPinterestImportedPostMetrics({ mediaType: row.mediaType, pinMetrics: detail.pin_metrics });
          const prev = await findImportedPostPrevSafe(account.id, row.platformPostId);
          const prevMeta =
            prev?.platformMetadata && typeof prev.platformMetadata === 'object' && !Array.isArray(prev.platformMetadata)
              ? (prev.platformMetadata as Record<string, unknown>)
              : {};
          const platformMetadata = {
            ...prevMeta,
            pinterest: {
              ...(typeof prevMeta.pinterest === 'object' && prevMeta.pinterest && !Array.isArray(prevMeta.pinterest)
                ? (prevMeta.pinterest as Record<string, unknown>)
                : {}),
              pin_metrics: detail.pin_metrics,
              compatInsights: extracted.facebookInsightsCompat,
              metricsRefreshedAt: new Date().toISOString(),
            },
          };
          try {
            await prisma.importedPost.update({
              where: { socialAccountId_platformPostId: { socialAccountId: account.id, platformPostId: row.platformPostId } },
              data: {
                impressions: extracted.impressions,
                interactions: extracted.interactions,
                likeCount: extracted.likeCount,
                commentsCount: extracted.commentsCount,
                sharesCount: extracted.sharesCount,
                savesCount: extracted.savesCount,
                platformMetadata: platformMetadata as object,
                syncedAt: new Date(),
              },
            });
          } catch {
            /* non-fatal */
          }
        });
      } catch (e) {
        console.warn('[Imported posts] Pinterest metrics refresh on read:', (e as Error)?.message ?? e);
      }
    }

    // Facebook: fill missing video/reel view metrics on read. Sync only attaches lifetime insights to the newest N posts;
    // older Graph ordering used to starve recent reels. Also merge live results with DB so partial maps still upgrade.
    let liveFacebookInsightsByPostId: Record<string, Record<string, number>> = {};
    if (liveEnrich && account.platform === 'FACEBOOK' && importedRows.length > 0) {
      try {
        const fbPageToken = await resolveFacebookPageAccessToken(account.platformUserId, account.accessToken);
        const candidates = importedRows
          .filter((p, idx) => {
            if (p.platform !== 'FACEBOOK') return false;
            const meta =
              p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
                ? (p.platformMetadata as Record<string, unknown>)
                : {};
            if (!facebookStoredInsightsLackViewSignal(meta)) return false;
            const videoLike = isFacebookVideoLikeImportedRow(p);
            const zeroImp = (p.impressions ?? 0) === 0;
            const dbEng = (p.likeCount ?? 0) + (p.commentsCount ?? 0) + (p.sharesCount ?? 0);
            const newestFew = idx < 12;
            return videoLike || (zeroImp && dbEng > 0) || (newestFew && zeroImp);
          })
          .slice(0, 40);

        if (candidates.length > 0) {
          const metrics = [...FB_CORE_POST_LIFETIME_METRICS];
          await runWithConcurrency(candidates, 5, async (row) => {
            try {
              const map = await fetchPostLifetimeInsightMap(row.platformPostId, fbPageToken, [...metrics]);
              const fallbackMap =
                Object.keys(map).length > 0
                  ? {}
                  : await fetchFacebookPostSnapshotMap(row.platformPostId, fbPageToken);
              const merged = mergeFacebookInsightMaps(map, fallbackMap);
              if (merged && Object.keys(merged).length > 0) {
                liveFacebookInsightsByPostId[row.platformPostId] = merged;
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

    /** Instagram: optional live media insights (`liveEnrich=1`); thumbnails still fill gaps without insights calls. */
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
          shares: typeof ig.shares === 'number' ? ig.shares : (row.sharesCount ?? 0),
          reposts: typeof ig.reposts === 'number' ? ig.reposts : (row.repostsCount ?? 0),
        };
      };
      if (!metaThrottle) {
        const insightCandidates = importedRows
          .filter((row) => {
            if (!liveEnrich) return false;
            const b = bundleFromRow(row);
            const missingCore = !igInsightBundleHasMetrics(b);
            const missingSocial = !igInsightBundleHasSocialMetrics(b);
            return missingCore || missingSocial;
          })
          .slice(0, 8);
        for (let i = 0; i < insightCandidates.length; i++) {
          const row = insightCandidates[i];
          try {
            const reelish = isInstagramLikelyReel({
              media_type: row.mediaType ?? undefined,
              permalink: row.permalinkUrl ?? undefined,
            });
            const bundle = await fetchInstagramMediaInsightsBestEffort(row.platformPostId, account.accessToken, {
              isReel: reelish,
            });
            if (igInsightBundleHasMetrics(bundle) || igInsightBundleHasSocialMetrics(bundle)) {
              liveInstagramInsightBundles[row.platformPostId] = bundle;
            }
          } catch {
            // per-post best effort
          }
          if (i < insightCandidates.length - 1) await new Promise((r) => setTimeout(r, 420));
        }
      }
      /** Best-effort missing reel/video thumbnails only; sequential + capped to limit ShadowIGMedia GETs. */
      const thumbCandidates = importedRows
        .filter((row) => {
          if (row.thumbnailUrl) return false;
          const mt = (row.mediaType ?? '').toUpperCase();
          const url = (row.permalinkUrl ?? '').toLowerCase();
          return mt === 'VIDEO' || url.includes('/reel/');
        })
        .slice(0, metaThrottle ? 2 : liveEnrich ? 6 : 4);
      for (let ti = 0; ti < thumbCandidates.length; ti++) {
        const row = thumbCandidates[ti];
        try {
          const u = await refetchIgMediaThumbnail(row.platformPostId, account.accessToken, { tryIgFallback: false });
          if (u) liveInstagramThumbnails[row.platformPostId] = u;
        } catch {
          // ignore
        }
        if (ti < thumbCandidates.length - 1) await new Promise((r) => setTimeout(r, metaThrottle ? 550 : 380));
      }
    }

    // YouTube: inline Shorts-playlist backfill for posts missing `youtubeInShortsPlaylist`.
    // Runs transparently on any GET so the labels self-heal without a manual full sync.
    const youtubeShortsBackfill: Record<string, { youtubeInShortsPlaylist: boolean; youtubeVideoFormat: string }> = {};
    if (account.platform === 'YOUTUBE' && importedRows.length > 0 && account.accessToken) {
      try {
        const missingPlaylistRows = importedRows.filter((p) => {
          const m =
            p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
              ? (p.platformMetadata as Record<string, unknown>)
              : {};
          return m.youtubeInShortsPlaylist === undefined;
        });
        if (missingPlaylistRows.length > 0) {
          const shortsPlaylistId =
            account.platformUserId?.startsWith('UC') ? `UUSH${account.platformUserId.slice(2)}` : null;
          if (shortsPlaylistId) {
            const shortsVideoIds = new Set<string>();
            let shortsPlaylistIndexOk = false;
            try {
              let shortsPageToken: string | null = null;
              let shortsPages = 0;
              do {
                const sp: Record<string, string | number | boolean> = {
                  part: 'snippet',
                  playlistId: shortsPlaylistId,
                  maxResults: 50,
                };
                if (shortsPageToken) sp.pageToken = shortsPageToken;
                const sres = await axios.get<{
                  items?: YtPlaylistItem[];
                  nextPageToken?: string;
                  error?: { message?: string };
                }>('https://www.googleapis.com/youtube/v3/playlistItems', {
                  params: sp,
                  headers: { Authorization: `Bearer ${account.accessToken}` },
                  validateStatus: () => true,
                });
                if (sres.status !== 200 || sres.data?.error) {
                  throw new Error(sres.data?.error?.message ?? `Shorts playlist HTTP ${sres.status}`);
                }
                shortsPlaylistIndexOk = true;
                for (const it of sres.data?.items ?? []) {
                  const vid = it.snippet?.resourceId?.videoId;
                  if (vid) {
                    shortsVideoIds.add(vid);
                    shortsVideoIds.add(vid.toLowerCase());
                  }
                }
                shortsPageToken = sres.data?.nextPageToken ?? null;
                shortsPages++;
              } while (shortsPageToken && shortsVideoIds.size < 500 && shortsPages < 10);
            } catch (e) {
              console.warn('[YouTube backfill] Shorts playlist fetch failed:', (e as Error)?.message ?? e);
            }

            if (shortsPlaylistIndexOk) {
              await runWithConcurrency(missingPlaylistRows, 10, async (row) => {
                const inShortsPlaylist = shortsVideoIds.has(row.platformPostId);
                const existingMeta =
                  row.platformMetadata && typeof row.platformMetadata === 'object' && !Array.isArray(row.platformMetadata)
                    ? (row.platformMetadata as Record<string, unknown>)
                    : {};
                const durationSec = typeof existingMeta.youtubeDurationSec === 'number' ? existingMeta.youtubeDurationSec : 0;
                const youtubeVideoFormat = classifyYoutubeVideoFormat({
                  durationSec,
                  title: row.content ?? '',
                  description: typeof existingMeta.youtubeDescriptionPreview === 'string' ? existingMeta.youtubeDescriptionPreview : '',
                  inChannelShortsPlaylist: inShortsPlaylist,
                });
                youtubeShortsBackfill[row.platformPostId] = { youtubeInShortsPlaylist: inShortsPlaylist, youtubeVideoFormat };
                try {
                  await prisma.importedPost.update({
                    where: { socialAccountId_platformPostId: { socialAccountId: account.id, platformPostId: row.platformPostId } },
                    data: {
                      platformMetadata: {
                        ...existingMeta,
                        youtubeInShortsPlaylist: inShortsPlaylist,
                        youtubeVideoFormat,
                        youtubeShortsIndexUnavailable: false,
                      } as object,
                    },
                  });
                } catch {
                  // non-fatal: response still reflects updated classification
                }
              });
            }
          }
        }
      } catch (e) {
        console.warn('[YouTube backfill] inline Shorts classify error:', (e as Error)?.message ?? e);
      }
    }

    /** Live `videos.list` so view counts and permalinks stay current (cron adapter rows may omit statistics). */
    let youtubeLiveStatsMap = new Map<string, YtVideoStatsRow>();
    if (account.platform === 'YOUTUBE' && account.accessToken) {
      try {
        const token = await getValidYoutubeToken(account);
        const ytRows = importedRows.filter((r) => r.platform === 'YOUTUBE');
        // Also include app-published (Composer) targets not yet in ImportedPost so their view counts show immediately.
        const appYtIds = appTargets
          .filter((t) => t.platformPostId && !importedPostIds.has(t.platformPostId))
          .map((t) => t.platformPostId!)
          .filter(Boolean);
        const ids = [...new Set([...ytRows.map((r) => r.platformPostId).filter(Boolean), ...appYtIds])].slice(0, 200);
        youtubeLiveStatsMap = await fetchYoutubeVideoStatsByIdMap(token, ids);

        await runWithConcurrency(ytRows, 10, async (row) => {
          const st = youtubeLiveStatsMap.get(row.platformPostId.toLowerCase());
          if (!st) return;
          const existingMeta =
            row.platformMetadata && typeof row.platformMetadata === 'object' && !Array.isArray(row.platformMetadata)
              ? { ...(row.platformMetadata as Record<string, unknown>) }
              : {};
          const nextMeta: Record<string, unknown> = {
            ...existingMeta,
            youtubeStandardWatchUrl: `https://www.youtube.com/watch?v=${st.canonicalId}`,
            youtubeShortsPageUrl: `https://www.youtube.com/shorts/${st.canonicalId}`,
            youtubeLiveStatsRefreshedAt: new Date().toISOString(),
          };
          if (st.durationSec > 0) nextMeta.youtubeDurationSec = st.durationSec;
          if (st.description) nextMeta.youtubeDescriptionPreview = st.description.slice(0, 4000);

          const inPl =
            existingMeta.youtubeInShortsPlaylist === true
              ? true
              : existingMeta.youtubeInShortsPlaylist === false
                ? false
                : undefined;
          const durationForClass =
            st.durationSec > 0
              ? st.durationSec
              : typeof existingMeta.youtubeDurationSec === 'number'
                ? existingMeta.youtubeDurationSec
                : 0;
          const youtubeVideoFormat = classifyYoutubeVideoFormat({
            durationSec: durationForClass,
            title: st.title || row.content || '',
            description:
              st.description ||
              (typeof existingMeta.youtubeDescriptionPreview === 'string'
                ? existingMeta.youtubeDescriptionPreview
                : ''),
            inChannelShortsPlaylist: inPl,
          });
          nextMeta.youtubeVideoFormat = youtubeVideoFormat;

          const nextImp = st.hasViewCount ? st.viewCount : undefined;
          const nextLike = st.hasLikeCount ? st.likeCount : undefined;
          const nextComm = st.hasCommentCount ? st.commentCount : undefined;
          const perm =
            !row.permalinkUrl || !String(row.permalinkUrl).trim()
              ? buildYoutubePrimaryPermalink(st.canonicalId, youtubeVideoFormat)
              : undefined;
          const metaNeedsUrls = !existingMeta.youtubeStandardWatchUrl || !existingMeta.youtubeShortsPageUrl;
          const formatChanged = existingMeta.youtubeVideoFormat !== youtubeVideoFormat;
          const shouldPersist =
            (nextImp !== undefined && nextImp !== (row.impressions ?? 0)) ||
            (nextLike !== undefined && nextLike !== (row.likeCount ?? 0)) ||
            (nextComm !== undefined && nextComm !== (row.commentsCount ?? 0)) ||
            Boolean(perm) ||
            metaNeedsUrls ||
            formatChanged;

          if (!shouldPersist) return;

          const likeFinal = nextLike ?? row.likeCount ?? 0;
          const commFinal = nextComm ?? row.commentsCount ?? 0;

          try {
            await prisma.importedPost.update({
              where: {
                socialAccountId_platformPostId: { socialAccountId: account.id, platformPostId: row.platformPostId },
              },
              data: {
                ...(nextImp !== undefined ? { impressions: nextImp } : {}),
                ...(nextLike !== undefined ? { likeCount: likeFinal } : {}),
                ...(nextComm !== undefined ? { commentsCount: commFinal } : {}),
                ...(perm ? { permalinkUrl: perm } : {}),
                interactions: likeFinal + commFinal,
                platformMetadata: nextMeta as object,
                syncedAt: new Date(),
              },
            });
          } catch {
            /* non-fatal */
          }
        });
      } catch (e) {
        console.warn('[posts] YouTube live video stats refresh:', (e as Error)?.message ?? e);
      }
    }

    const serialized = importedRows.map((p) => {
      const ytSt = account.platform === 'YOUTUBE' ? youtubeLiveStatsMap.get(p.platformPostId.toLowerCase()) : undefined;
      const enrich = account.platform === 'TWITTER' ? twitterEnrich[p.platformPostId] : undefined;
      const backfill = youtubeShortsBackfill[p.platformPostId];
      const meta =
        p.platformMetadata && typeof p.platformMetadata === 'object' && !Array.isArray(p.platformMetadata)
          ? (backfill ? { ...(p.platformMetadata as Record<string, unknown>), ...backfill } : (p.platformMetadata as Record<string, unknown>))
          : {};
      const ytPublicMeta =
        p.platform === 'YOUTUBE' && ytSt
          ? {
              youtubeStandardWatchUrl: `https://www.youtube.com/watch?v=${ytSt.canonicalId}`,
              youtubeShortsPageUrl: `https://www.youtube.com/shorts/${ytSt.canonicalId}`,
              ...(ytSt.durationSec > 0 ? { youtubeDurationSec: ytSt.durationSec } : {}),
              ...(ytSt.description ? { youtubeDescriptionPreview: ytSt.description.slice(0, 4000) } : {}),
            }
          : {};
      const youtubeMetaOut = p.platform === 'YOUTUBE' ? { ...meta, ...ytPublicMeta } : meta;
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
              shares?: number;
              reposts?: number;
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
              shares: Math.max(
                liveIgBundle?.shares ?? 0,
                typeof igMetaDb?.shares === 'number' ? igMetaDb.shares : 0,
                typeof p.sharesCount === 'number' ? p.sharesCount : 0
              ),
              reposts: Math.max(
                liveIgBundle?.reposts ?? 0,
                typeof igMetaDb?.reposts === 'number' ? igMetaDb.reposts : 0,
                typeof p.repostsCount === 'number' ? p.repostsCount : 0
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
                post_shares: mergedIgInsight.shares > 0 ? mergedIgInsight.shares : undefined,
                instagram_reposts: mergedIgInsight.reposts > 0 ? mergedIgInsight.reposts : undefined,
                post_video_avg_time_watched: Math.round(avgSec * 1000),
                post_video_view_time: Math.round(totSec * 1000),
                post_reactions_like_total: p.likeCount ?? 0,
                post_comments: p.commentsCount ?? 0,
              };
            })()
          : undefined;
      const pinterestCompatInsights: Record<string, number> | undefined =
        p.platform === 'PINTEREST' &&
        meta.pinterest &&
        typeof meta.pinterest === 'object' &&
        !Array.isArray(meta.pinterest) &&
        (meta.pinterest as Record<string, unknown>).compatInsights &&
        typeof (meta.pinterest as Record<string, unknown>).compatInsights === 'object' &&
        !Array.isArray((meta.pinterest as Record<string, unknown>).compatInsights)
          ? ((meta.pinterest as Record<string, unknown>).compatInsights as Record<string, number>)
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
            : p.platform === 'PINTEREST' && pinterestCompatInsights && Object.keys(pinterestCompatInsights).length > 0
              ? pinterestCompatInsights
              : undefined;
      const fbImpressionsFromInsights =
        p.platform === 'FACEBOOK' && mergedFacebookInsights
          ? pickFacebookPostImpressionsFromInsightMap(mergedFacebookInsights).impressions
          : 0;
      const pinterestPlaysFromInsights =
        p.platform === 'PINTEREST' && pinterestCompatInsights
          ? Math.max(
              typeof pinterestCompatInsights.post_video_views === 'number' ? pinterestCompatInsights.post_video_views : 0,
              typeof pinterestCompatInsights.post_media_view === 'number' ? pinterestCompatInsights.post_media_view : 0
            )
          : 0;
      const pinterestImpressionsFromInsights =
        p.platform === 'PINTEREST' && pinterestCompatInsights
          ? Math.max(
              typeof pinterestCompatInsights.post_impressions === 'number' ? pinterestCompatInsights.post_impressions : 0,
              pinterestPlaysFromInsights
            )
          : 0;
      const impressionsSerialized =
        p.platform === 'INSTAGRAM'
          ? igImpressionsSerialized
          : p.platform === 'FACEBOOK'
            ? Math.max(p.impressions ?? 0, fbImpressionsFromInsights)
            : p.platform === 'YOUTUBE'
              ? ytSt?.hasViewCount
                ? ytSt.viewCount
                : p.impressions ?? 0
              : p.platform === 'PINTEREST'
                ? Math.max(p.impressions ?? 0, pinterestImpressionsFromInsights)
                : p.platform === 'TWITTER'
                  ? Math.max(p.impressions ?? 0, enrich?.impressions ?? 0)
                  : p.impressions ?? 0;
      const likeCountOut =
        p.platform === 'FACEBOOK'
          ? Math.max(p.likeCount ?? 0, mergedFacebookInsights?.post_reactions_like_total ?? 0)
          : p.platform === 'YOUTUBE' && ytSt?.hasLikeCount
            ? ytSt.likeCount
            : enrich?.likeCount ?? p.likeCount ?? 0;
      const commentsCountOut =
        p.platform === 'FACEBOOK'
          ? Math.max(p.commentsCount ?? 0, mergedFacebookInsights?.post_comments ?? 0)
          : p.platform === 'YOUTUBE' && ytSt?.hasCommentCount
            ? ytSt.commentCount
            : enrich?.commentsCount ?? p.commentsCount ?? 0;
      const sharesCountOut =
        p.platform === 'FACEBOOK'
          ? Math.max(p.sharesCount ?? 0, mergedFacebookInsights?.post_shares ?? 0)
          : p.platform === 'TWITTER'
            ? Math.max(p.sharesCount ?? 0, enrich?.quoteCount ?? 0)
            : p.sharesCount ?? 0;
      const savesCountOut = p.savesCount ?? 0;
      const interactionsOut =
        p.platform === 'FACEBOOK'
          ? likeCountOut + commentsCountOut + sharesCountOut
          : p.platform === 'YOUTUBE'
            ? likeCountOut + commentsCountOut
            : p.platform === 'TWITTER'
              ? Math.max(
                  typeof p.interactions === 'number' && Number.isFinite(p.interactions) ? p.interactions : 0,
                  likeCountOut + commentsCountOut + (enrich?.repostsCount ?? p.repostsCount ?? 0) + sharesCountOut
                )
            : p.platform === 'PINTEREST'
              ? (() => {
                  const stored = typeof p.interactions === 'number' && Number.isFinite(p.interactions) ? p.interactions : 0;
                  if (stored > 0) return stored;
                  return likeCountOut + commentsCountOut + sharesCountOut + savesCountOut;
                })()
              : p.interactions ?? 0;
      return {
        id: p.id,
        platformPostId: p.platformPostId,
        content: p.content,
        thumbnailUrl:
          enrich?.thumbnailUrl ??
          liveInstagramThumbnails[p.platformPostId] ??
          (account.platform === 'FACEBOOK' ? facebookThumbByPostId[p.platformPostId] : undefined) ??
          (account.platform === 'PINTEREST' ? pinterestThumbByPinId[p.platformPostId] : undefined) ??
          ogThumbByPostId[p.platformPostId] ??
          p.thumbnailUrl ??
          null,
        permalinkUrl: (() => {
          if (p.platform !== 'YOUTUBE' || !ytSt) return p.permalinkUrl;
          if (p.permalinkUrl && String(p.permalinkUrl).trim()) return p.permalinkUrl;
          const inPl =
            meta.youtubeInShortsPlaylist === true
              ? true
              : meta.youtubeInShortsPlaylist === false
                ? false
                : undefined;
          const durationForClass =
            ytSt.durationSec > 0
              ? ytSt.durationSec
              : typeof meta.youtubeDurationSec === 'number'
                ? meta.youtubeDurationSec
                : 0;
          return buildYoutubePrimaryPermalink(
            ytSt.canonicalId,
            classifyYoutubeVideoFormat({
              durationSec: durationForClass,
              title: ytSt.title || p.content || '',
              description:
                ytSt.description ||
                (typeof meta.youtubeDescriptionPreview === 'string' ? meta.youtubeDescriptionPreview : ''),
              inChannelShortsPlaylist: inPl,
            })
          );
        })(),
        impressions: impressionsSerialized,
        interactions: interactionsOut,
        likeCount: likeCountOut,
        commentsCount: commentsCountOut,
        repostsCount:
          p.platform === 'INSTAGRAM' && mergedIgInsight
            ? Math.max(mergedIgInsight.reposts, p.repostsCount ?? 0)
            : enrich?.repostsCount ?? p.repostsCount ?? 0,
        sharesCount:
          p.platform === 'INSTAGRAM' && mergedIgInsight
            ? Math.max(mergedIgInsight.shares, sharesCountOut)
            : sharesCountOut,
        savesCount: savesCountOut,
        publishedAt: p.publishedAt instanceof Date ? p.publishedAt.toISOString() : String(p.publishedAt),
        mediaType: p.mediaType,
        platform: p.platform,
        ...(p.platform === 'YOUTUBE' && Object.keys(youtubeMetaOut).length > 0
          ? { platformMetadata: youtubeMetaOut }
          : p.platformMetadata != null
            ? { platformMetadata: backfill ? { ...(p.platformMetadata as Record<string, unknown>), ...backfill } : p.platformMetadata }
            : {}),
        ...(facebookInsights && Object.keys(facebookInsights).length > 0 ? { facebookInsights } : {}),
        ...(p.platform === 'FACEBOOK' || p.platform === 'PINTEREST' || p.platform === 'INSTAGRAM'
          ? {
              engagementBreakdown: {
                reactions: likeCountOut,
                comments: commentsCountOut,
                shares: sharesCountOut,
                totalEngagement:
                  p.platform === 'PINTEREST'
                    ? likeCountOut + commentsCountOut + sharesCountOut + savesCountOut
                    : likeCountOut + commentsCountOut + sharesCountOut,
              },
            }
          : {}),
      };
    });

    // App-published targets not yet in importedPosts.
    // For Facebook, live-enrich these rows so newest reels do not appear as all zeros while
    // Graph edges lag behind imported post persistence.
    const appExtraFacebookInsightsByPostId: Record<string, Record<string, number>> = {};
    if (account.platform === 'FACEBOOK' && appTargets.length > 0) {
      try {
        const fbPageToken = await resolveFacebookPageAccessToken(account.platformUserId, account.accessToken);
        const missingImportedTargets = appTargets
          .filter((t) => t.platformPostId && !importedPostIds.has(t.platformPostId))
          .slice(0, 20);
        await runWithConcurrency(missingImportedTargets, 5, async (t) => {
          const pid = t.platformPostId;
          if (!pid) return;
          try {
            const map = await fetchFacebookPostSnapshotMap(pid, fbPageToken);
            if (Object.keys(map).length > 0) appExtraFacebookInsightsByPostId[pid] = map;
          } catch {
            // best effort
          }
        });
      } catch {
        // best effort
      }
    }

    /** Composer IG rows use media id only; Content History needs permalink before media-list sync. */
    const igComposerPermalinkByMediaId: Record<string, string> = {};
    if (account.platform === 'INSTAGRAM' && account.accessToken && appTargets.length > 0) {
      const needPermalink = appTargets
        .filter((t) => t.platformPostId && !importedPostIds.has(t.platformPostId!))
        .slice(0, metaThrottle ? 8 : 25);
      await runWithConcurrency(needPermalink, 5, async (t) => {
        const mid = t.platformPostId!;
        const perm = await fetchInstagramMediaPermalink(mid, account.accessToken);
        if (perm) igComposerPermalinkByMediaId[mid] = perm;
      });
    }

    // App-published targets not yet in importedPosts
    const appExtra = appTargets
      .filter((t) => !importedPostIds.has(t.platformPostId!))
      .map((t) => {
        const pid = t.platformPostId ?? null;
        const twE = account.platform === 'TWITTER' && pid ? twitterEnrich[pid] : undefined;
        const live = pid ? appExtraFacebookInsightsByPostId[pid] : undefined;
        const fbPick = live ? pickFacebookPostImpressionsFromInsightMap(live) : { impressions: 0, metricUsed: null };
        const likeCount = live?.post_reactions_like_total ?? 0;
        const commentsCount = live?.post_comments ?? 0;
        const sharesCount = live?.post_shares ?? 0;
        const interactions = likeCount + commentsCount + sharesCount;

        // YouTube Composer-published targets: enrich with live video.list stats.
        const ytSt = account.platform === 'YOUTUBE' && pid ? youtubeLiveStatsMap.get(pid.toLowerCase()) : undefined;
        const ytImpressions = ytSt?.hasViewCount ? ytSt.viewCount : 0;
        const ytLikes = ytSt?.hasLikeCount ? ytSt.likeCount : 0;
        const ytComments = ytSt?.hasCommentCount ? ytSt.commentCount : 0;
        const ytPermalink = ytSt
          ? buildYoutubePrimaryPermalink(ytSt.canonicalId, classifyYoutubeVideoFormat({
              durationSec: ytSt.durationSec,
              title: ytSt.title || t.post?.content || '',
              description: ytSt.description || '',
            }))
          : null;
        const ytMeta: Record<string, unknown> = ytSt
          ? {
              youtubeStandardWatchUrl: `https://www.youtube.com/watch?v=${ytSt.canonicalId}`,
              youtubeShortsPageUrl: `https://www.youtube.com/shorts/${ytSt.canonicalId}`,
              ...(ytSt.durationSec > 0 ? { youtubeDurationSec: ytSt.durationSec } : {}),
            }
          : {};

        return {
          id: `target-${t.id}`,
          platformPostId: pid,
          content: account.platform === 'YOUTUBE' && ytSt?.title ? ytSt.title : (t.post?.content ?? null),
          thumbnailUrl: twE?.thumbnailUrl ?? thumbnailUrlFromFirstPostMedia(t.post?.media[0]),
          permalinkUrl:
            account.platform === 'YOUTUBE'
              ? ytPermalink ?? null
              : account.platform === 'TWITTER' && pid
                ? `https://x.com/i/web/status/${pid}`
                : account.platform === 'INSTAGRAM' && pid
                  ? igComposerPermalinkByMediaId[pid] ?? null
                  : null,
          impressions:
            account.platform === 'YOUTUBE'
              ? ytImpressions
              : account.platform === 'TWITTER' && twE
                ? twE.impressions
                : fbPick.impressions,
          interactions:
            account.platform === 'YOUTUBE'
              ? ytLikes + ytComments
              : account.platform === 'TWITTER' && twE
                ? twE.likeCount + twE.commentsCount + twE.repostsCount + twE.quoteCount
                : interactions,
          likeCount: account.platform === 'YOUTUBE' ? ytLikes : account.platform === 'TWITTER' && twE ? twE.likeCount : likeCount,
          commentsCount: account.platform === 'YOUTUBE' ? ytComments : account.platform === 'TWITTER' && twE ? twE.commentsCount : commentsCount,
          repostsCount: account.platform === 'TWITTER' && twE ? twE.repostsCount : 0,
          sharesCount: account.platform === 'TWITTER' && twE ? twE.quoteCount : sharesCount,
          savesCount: 0,
          publishedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
          mediaType: t.post?.media[0]?.type ?? null,
          platform: account.platform,
          ...(live && Object.keys(live).length > 0 ? { facebookInsights: live } : {}),
          ...(account.platform === 'YOUTUBE' && Object.keys(ytMeta).length > 0 ? { platformMetadata: ytMeta } : {}),
        };
      });

    const posts = [...serialized, ...appExtra].sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return NextResponse.json({
      posts,
      syncError,
      ...(syncSkippedDueToCooldown ? { syncSkippedDueToCooldown: true as const } : {}),
      ...(xApiBudgetError ? { xApiBudgetError } : {}),
    });
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
  /** Number of times the post was shared (DMs + Story shares). Requires instagram_manage_insights. */
  shares: number;
  /** Number of times the post was publicly reposted to someone else's feed. Requires instagram_manage_insights. */
  reposts: number;
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
    shares: Math.max(a.shares, b.shares),
    reposts: Math.max(a.reposts, b.reposts),
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

function igInsightBundleHasSocialMetrics(b: IgMediaInsightBundle): boolean {
  return b.shares > 0 || b.reposts > 0;
}

function igInsightBundleHasBothSocialMetrics(b: IgMediaInsightBundle): boolean {
  return b.shares > 0 && b.reposts > 0;
}

async function fetchInstagramMediaInsightsBestEffort(
  mediaId: string,
  accessToken: string,
  opts: { isReel: boolean }
): Promise<IgMediaInsightBundle> {
  const primary = await fetchInstagramMediaInsights(fbRestBaseUrl, mediaId, accessToken, opts);
  // Keep fallback host when either social metric is still missing.
  if (igInsightBundleHasMetrics(primary) && igInsightBundleHasBothSocialMetrics(primary)) return primary;
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
    shares: 0,
    reposts: 0,
  };

  // Phase 1: main view/reach/watch-time metrics.
  // shares and reposts are intentionally excluded here — Meta sometimes silently omits
  // them when bundled with other metrics, causing the entire set to appear as if shares=0.
  // Fewer probes per media: each probe is a billed ShadowIGMedia/insights call.
  const metricSets = opts.isReel
    ? ['views,reach,ig_reels_avg_watch_time,ig_reels_video_view_total_time', 'views,reach']
    : ['views,reach,impressions', 'impressions,reach'];
  for (const metric of metricSets) {
    try {
      const insightsRes = await axios.get<{
        data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
        error?: { message?: string; code?: number };
      }>(`${baseUrl}/${mediaId}/insights`, {
        params: { metric, access_token: accessToken },
        timeout: 12_000,
        validateStatus: () => true,
      });
      noteMetaUsageFromHeaders(insightsRes.headers);
      if (insightsRes.status >= 400 || insightsRes.data?.error) {
        const code = insightsRes.data?.error?.code;
        if (code === 4 || code === 32 || code === 613) noteMetaRateLimitError();
        continue;
      }
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

  // Phase 2: fetch shares and reposts in a dedicated call so they are never silently
  // dropped when bundled with unrelated metrics that succeed first.
  // `reposts` = public repost to someone's own feed; `shares` = DM / Story shares.
  const socialMetricSets = ['shares,reposts'];
  for (const metric of socialMetricSets) {
    try {
      const socialRes = await axios.get<{
        data?: Array<{ name: string; values?: Array<{ value: number }>; total_value?: { value: number } }>;
        error?: { message?: string; code?: number };
      }>(`${baseUrl}/${mediaId}/insights`, {
        params: { metric, access_token: accessToken },
        timeout: 8_000,
        validateStatus: () => true,
      });
      noteMetaUsageFromHeaders(socialRes.headers);
      if (socialRes.status >= 400 || socialRes.data?.error) {
        const code = socialRes.data?.error?.code;
        if (code === 4 || code === 32 || code === 613) noteMetaRateLimitError();
        continue;
      }
      const socialData = socialRes.data?.data ?? [];
      if (socialData.length === 0) continue;
      for (const d of socialData) {
        const val = igInsightMetricValue(d);
        if (d.name === 'shares') out.shares = Math.max(out.shares, val);
        if (d.name === 'reposts') out.reposts = Math.max(out.reposts, val);
      }
      break;
    } catch {
      // sharing metrics unavailable for this post or permission not granted
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

async function refetchIgMediaThumbnail(
  mediaId: string,
  accessToken: string,
  opts?: { tryIgFallback?: boolean }
): Promise<string | null> {
  const tryIgFallback = opts?.tryIgFallback !== false;
  const bases = tryIgFallback ? [fbRestBaseUrl, igGraphRestBaseUrl] : [fbRestBaseUrl];
  for (const apiBase of bases) {
    try {
      const refetch = await axios.get<{ thumbnail_url?: string; media_url?: string }>(
        `${apiBase}/${mediaId}`,
        { params: { fields: 'thumbnail_url,media_url', access_token: accessToken }, timeout: 8000 }
      );
      noteMetaUsageFromHeaders(refetch.headers);
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
  accessToken: string,
  credentialsJson?: unknown
): Promise<string | undefined> {
  if (platform === 'INSTAGRAM') {
    /** Cap media list size; post-level /insights are filled by sync post_metrics, not here. */
    const maxMedia = 150;
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
      // Do not call GET /{media-id}/insights during bulk sync: N media × several hosts/metric
      // probes burned Meta app-level quota (ShadowIGMedia/insights). Impressions and rich IG
      // metrics are updated by the sync engine post_metrics scope (single batched metric call).
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
          interactions,
          likeCount,
          commentsCount,
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
          impressions: 0,
          interactions,
          likeCount,
          commentsCount,
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
      // If published_posts failed with a permission error, propagate it so the user can reconnect.
      if (items.length === 0 && fetched.lastError) {
        return `Facebook posts could not be loaded (${fetched.lastError}). Reconnect your Facebook Page and grant Pages permissions to sync posts.`;
      }
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
    const BUDGET_MS = 45_000;
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
      const sharesFromInsights = typeof insightMap.post_shares === 'number' ? insightMap.post_shares : 0;
      /** Do not let lifetime insights `0` wipe real share counts from the post object (common on Reels). */
      const sharesCountFinal = Math.max(sharesFromPayload, sharesFromInsights);
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
      const thumbnailUrl = pickFacebookThumbnailFromPublishedPost(p);

      await upsertImportedPostWithFallback({
        socialAccountId,
        platformPostId: p.id,
        updateData: {
          content: p.message ?? null,
          thumbnailUrl,
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
          thumbnailUrl,
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
      const timelineUrl = `https://api.twitter.com/2/users/${platformUserId}/tweets`;
      const baseParams: Record<string, string> = {
        max_results: '50',
        expansions: 'attachments.media_keys',
        'media.fields': 'url,preview_image_url,type',
        exclude: 'retweets,replies',
      };
      const tryFields = [
        'created_at,text,public_metrics,organic_metrics,non_public_metrics,attachments',
        'created_at,text,public_metrics,organic_metrics,attachments',
        'created_at,text,public_metrics,attachments',
      ] as const;
      let items: Array<{
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
        organic_metrics?: Record<string, unknown>;
        non_public_metrics?: Record<string, unknown>;
      }> = [];
      let tweetsRes!: AxiosResponse<{
        data?: typeof items;
        includes?: { media?: Array<{ media_key: string; url?: string; preview_image_url?: string; type?: string }> };
      }>;
      let lastStatus = 400;
      for (const fields of tryFields) {
        await checkAndIncrementXApiUsage(socialAccountId);
        tweetsRes = await axios.get(timelineUrl, {
          params: { ...baseParams, 'tweet.fields': fields },
          headers: { Authorization: `Bearer ${accessToken}` },
          validateStatus: () => true,
        });
        lastStatus = tweetsRes.status;
        if (tweetsRes.status >= 200 && tweetsRes.status < 300) {
          items = tweetsRes.data?.data ?? [];
          break;
        }
      }
      if (lastStatus < 200 || lastStatus >= 300) {
        const msg = (tweetsRes!.data as { errors?: Array<{ detail?: string }> })?.errors?.[0]?.detail ?? 'Timeline request failed';
        throw new Error(typeof msg === 'string' ? msg : 'Timeline request failed');
      }
      const mediaList = tweetsRes.data?.includes?.media ?? [];
      const mediaByKey = new Map(mediaList.map((m) => [m.media_key, m]));
      for (const t of items) {
        const publishedAt = t.created_at ? new Date(t.created_at) : new Date();
        const permalinkUrl = `https://x.com/i/status/${t.id}`;
        const m = metricsFromTweetPayload(t);
        const impressions = m.impression_count;
        const likeCount = m.like_count;
        const replyCount = m.reply_count;
        const retweetCount = m.retweet_count;
        const quoteCount = m.quote_count;
        const interactions = likeCount + replyCount + retweetCount + quoteCount;
        const firstMediaKey = t.attachments?.media_keys?.[0];
        const firstMedia = firstMediaKey ? mediaByKey.get(firstMediaKey) : undefined;
        const thumbnailUrl = firstMedia?.preview_image_url ?? firstMedia?.url ?? null;
        // 'video' or 'animated_gif' → store as VIDEO so the Reels section picks it up
        const rawMediaType = (firstMedia?.type ?? '').toLowerCase();
        const mediaType = rawMediaType === 'video' || rawMediaType === 'animated_gif' ? 'VIDEO' : rawMediaType === 'photo' ? 'IMAGE' : null;
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
            mediaType,
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
            mediaType,
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
    const { syncError } = await syncLinkedInUgcPosts({
      socialAccountId,
      platformUserId,
      accessToken,
      credentialsJson,
    });
    return syncError;
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
        share_count?: number;
        view_count?: number;
        [key: string]: unknown;
      };
      const fields =
        'cover_image_url,id,title,create_time,share_url,like_count,comment_count,share_count,view_count,favorites_count,duration';
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
            timeout: 20_000,
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
        const raw = v as Record<string, unknown>;
        const { shareCount, saveCount } = parseTikTokVideoEngagement(raw);
        const durationSec = parseTikTokVideoDurationSec(raw);
        const sharesCount = shareCount;
        const savesVal = saveCount != null ? saveCount : undefined;
        const interactions = likeCount + commentsCount + sharesCount + (saveCount ?? 0);
        const tiktokMeta =
          durationSec != null ? ({ tiktokDurationSec: durationSec } as Record<string, unknown>) : undefined;
        const whereTt = { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } };
        try {
          await prisma.importedPost.upsert({
            where: whereTt,
            update: {
              content: title,
              thumbnailUrl,
              permalinkUrl,
              publishedAt,
              mediaType: 'VIDEO',
              impressions,
              interactions,
              likeCount,
              commentsCount,
              sharesCount,
              repostsCount: 0,
              ...(savesVal !== undefined ? { savesCount: savesVal } : {}),
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
              syncedAt: new Date(),
            },
            create: {
              socialAccountId,
              platformPostId: videoId,
              platform: 'TIKTOK',
              content: title,
              thumbnailUrl,
              permalinkUrl,
              publishedAt,
              mediaType: 'VIDEO',
              impressions,
              interactions,
              likeCount,
              commentsCount,
              sharesCount,
              repostsCount: 0,
              savesCount: saveCount ?? 0,
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            },
          });
        } catch (upErr) {
          if (!isMissingImportedPostSavesCountColumn(upErr)) throw upErr;
          const interactionsNoSaves = likeCount + commentsCount + sharesCount;
          await prisma.importedPost.upsert({
            where: whereTt,
            update: {
              content: title,
              thumbnailUrl,
              permalinkUrl,
              publishedAt,
              mediaType: 'VIDEO',
              impressions,
              interactions: interactionsNoSaves,
              likeCount,
              commentsCount,
              sharesCount,
              repostsCount: 0,
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
              syncedAt: new Date(),
            },
            create: {
              socialAccountId,
              platformPostId: videoId,
              platform: 'TIKTOK',
              content: title,
              thumbnailUrl,
              permalinkUrl,
              publishedAt,
              mediaType: 'VIDEO',
              impressions,
              interactions: interactionsNoSaves,
              likeCount,
              commentsCount,
              sharesCount,
              repostsCount: 0,
              ...(tiktokMeta ? { platformMetadata: tiktokMeta as object } : {}),
            },
          });
        }
      }
      return undefined;
    } catch (e) {
      const ax = e as { response?: { data?: { error?: { message?: string; code?: string } } } };
      const msg = (e as Error)?.message ?? '';
      const apiMsg = ax?.response?.data?.error?.message;
      if (msg.includes('403') || apiMsg?.toLowerCase().includes('scope')) return 'Add video.list scope and reconnect to sync TikTok videos.';
      if (msg.includes('401')) return 'Reconnect your TikTok account to sync videos.';
      console.warn('[TikTok sync] unexpected error:', msg.slice(0, 200));
      return `TikTok sync error: ${msg.slice(0, 100)}`;
    }
  }

  if (platform === 'YOUTUBE') {
    try {
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

      /** Channel Shorts shelf playlist: same id as uploads but `UU` → `UUSH` (not duration-based). */
      const shortsPlaylistId =
        platformUserId.startsWith('UC') ? `UUSH${platformUserId.slice(2)}` : null;
      const shortsVideoIds = new Set<string>();
      /** Only trust `youtubeInShortsPlaylist` false/true when at least one Shorts playlist request succeeded. */
      let shortsPlaylistIndexOk = false;
      if (shortsPlaylistId) {
        try {
          let shortsPageToken: string | null = null;
          let shortsPages = 0;
          do {
            const sp: Record<string, string | number | boolean> = {
              part: 'snippet',
              playlistId: shortsPlaylistId,
              maxResults: 50,
            };
            if (shortsPageToken) sp.pageToken = shortsPageToken;
            const sres = await axios.get<{
              items?: YtPlaylistItem[];
              nextPageToken?: string;
              error?: { message?: string };
            }>('https://www.googleapis.com/youtube/v3/playlistItems', {
              params: sp,
              headers: { Authorization: `Bearer ${accessToken}` },
              validateStatus: () => true,
            });
            if (sres.status !== 200 || sres.data?.error) {
              throw new Error(sres.data?.error?.message ?? `Shorts playlist HTTP ${sres.status}`);
            }
            shortsPlaylistIndexOk = true;
            for (const it of sres.data?.items ?? []) {
              const vid = it.snippet?.resourceId?.videoId;
              if (vid) {
                shortsVideoIds.add(vid);
                shortsVideoIds.add(vid.toLowerCase());
              }
            }
            shortsPageToken = sres.data?.nextPageToken ?? null;
            shortsPages++;
          } while (shortsPageToken && shortsVideoIds.size < 500 && shortsPages < 10);
        } catch (e) {
          console.warn('[YouTube sync] Shorts playlist (UUSH) fetch failed:', (e as Error)?.message ?? e);
        }
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

      const statsMap: Record<
        string,
        {
          canonicalId: string;
          viewCount: number;
          likeCount: number;
          commentCount: number;
          durationSec: number;
          title: string;
          description: string;
        }
      > = {};
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        try {
          const statsRes = await axios.get<{
            items?: Array<{
              id: string;
              statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
              contentDetails?: { duration?: string };
              snippet?: { title?: string; description?: string };
            }>;
          }>('https://www.googleapis.com/youtube/v3/videos', {
            params: { part: 'snippet,statistics,contentDetails', id: batch.join(',') },
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          for (const v of statsRes.data?.items ?? []) {
            const durationSec = parseYoutubeIso8601DurationSeconds(v.contentDetails?.duration);
            const row = {
              canonicalId: v.id,
              viewCount: v.statistics?.viewCount ? parseInt(v.statistics.viewCount, 10) : 0,
              likeCount: v.statistics?.likeCount ? parseInt(v.statistics.likeCount, 10) : 0,
              commentCount: v.statistics?.commentCount ? parseInt(v.statistics.commentCount, 10) : 0,
              durationSec,
              title: v.snippet?.title ?? '',
              description: v.snippet?.description ?? '',
            };
            statsMap[v.id] = row;
            statsMap[v.id.toLowerCase()] = row;
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
        const stats = statsMap[videoId] ?? statsMap[videoId.toLowerCase()] ?? {
          canonicalId: videoId,
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
          durationSec: 0,
          title: title ?? '',
          description: '',
        };
        const canonicalVideoId = stats.canonicalId || videoId;
        const thumbnailUrl = v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url
          ?? `https://i.ytimg.com/vi/${canonicalVideoId}/mqdefault.jpg`;
        const impressions = stats.viewCount;
        const likeCount = stats.likeCount;
        const commentsCount = stats.commentCount;
        const interactions = likeCount + commentsCount;
        const inChannelShortsPlaylist = shortsPlaylistIndexOk
          ? shortsVideoIds.has(videoId) || shortsVideoIds.has(canonicalVideoId)
          : undefined;
        const youtubeVideoFormat = classifyYoutubeVideoFormat({
          durationSec: stats.durationSec,
          title: stats.title || (title ?? ''),
          description: stats.description,
          inChannelShortsPlaylist,
        });
        const permalinkUrl = buildYoutubePrimaryPermalink(canonicalVideoId, youtubeVideoFormat);
        const youtubeMeta: Record<string, unknown> = {
          youtubeVideoFormat,
          youtubeShortsIndexUnavailable: !shortsPlaylistIndexOk,
          /** Helps client-side Shorts vs long-form when title omits #shorts (matches classifyYoutubeVideoFormat). */
          youtubeDescriptionPreview: (stats.description || '').slice(0, 4000),
          youtubeStandardWatchUrl: `https://www.youtube.com/watch?v=${canonicalVideoId}`,
          youtubeShortsPageUrl: `https://www.youtube.com/shorts/${canonicalVideoId}`,
        };
        if (shortsPlaylistIndexOk) {
          youtubeMeta.youtubeInShortsPlaylist =
            shortsVideoIds.has(videoId) || shortsVideoIds.has(canonicalVideoId);
        }
        if (stats.durationSec > 0) {
          youtubeMeta.youtubeDurationSec = stats.durationSec;
        }
        await prisma.importedPost.upsert({
          where: { socialAccountId_platformPostId: { socialAccountId, platformPostId: videoId } },
          update: {
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions,
            likeCount,
            commentsCount,
            platformMetadata: youtubeMeta as object,
            syncedAt: new Date(),
          },
          create: {
            socialAccountId,
            platformPostId: videoId,
            platform: 'YOUTUBE',
            content: title,
            thumbnailUrl,
            permalinkUrl,
            publishedAt,
            mediaType: 'VIDEO',
            impressions,
            interactions,
            likeCount,
            commentsCount,
            platformMetadata: youtubeMeta as object,
          },
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
      pin_metrics?: unknown;
    };
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const collected: PinItem[] = [];
      let bookmark: string | undefined;
      let pages = 0;
      /** Pinterest cursor order is not guaranteed newest-first; paginate enough so recent pins are included for busy accounts. */
      const MAX_PIN_LIST_PAGES = 50;
      while (pages < MAX_PIN_LIST_PAGES) {
        const res = await axios.get<{ items?: PinItem[]; bookmark?: string }>('https://api.pinterest.com/v5/pins', {
          headers,
          params: {
            page_size: 25,
            pin_metrics: true,
            include_protected_pins: true,
            ...(bookmark ? { bookmark } : {}),
          },
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
        let detailMedia: unknown | null = null;
        let pinMetrics: unknown | null = pin.pin_metrics ?? null;
        let thumbnailUrl = pickPinThumbnailFromMedia(pin.media);
        if (!thumbnailUrl || !pinMetrics) {
          const detail = await fetchPinterestPinDetail(pinId, headers);
          if (!thumbnailUrl) {
            detailMedia = detail?.media ?? null;
            thumbnailUrl = pickPinThumbnailFromMedia(detailMedia);
          }
          pinMetrics = pinMetrics ?? detail?.pin_metrics ?? null;
        }
        const permalinkUrl = `https://www.pinterest.com/pin/${pinId}/`;
        const mediaType =
          inferPinterestMediaType(pin.media) ??
          inferPinterestMediaType(detailMedia) ??
          'IMAGE';
        const prev = await findImportedPostPrevSafe(socialAccountId, pinId);
        const prevMeta =
          prev?.platformMetadata && typeof prev.platformMetadata === 'object' && !Array.isArray(prev.platformMetadata)
            ? (prev.platformMetadata as Record<string, unknown>)
            : {};
        const extracted = extractPinterestImportedPostMetrics({ mediaType, pinMetrics });
        const impressions = extracted.impressions;
        const interactions = extracted.interactions;
        const likeCount = extracted.likeCount;
        const commentsCount = extracted.commentsCount;
        const sharesCount = extracted.sharesCount;
        const savesCount = extracted.savesCount;
        const platformMetadata = {
          ...prevMeta,
          pinterest: {
            ...(typeof prevMeta.pinterest === 'object' && prevMeta.pinterest && !Array.isArray(prevMeta.pinterest)
              ? (prevMeta.pinterest as Record<string, unknown>)
              : {}),
            pin_metrics: pinMetrics,
            compatInsights: extracted.facebookInsightsCompat,
            metricsExtractedAt: new Date().toISOString(),
          },
        };
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
            likeCount,
            commentsCount,
            sharesCount,
            savesCount,
            platformMetadata: platformMetadata as object,
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
            likeCount,
            commentsCount,
            sharesCount,
            savesCount,
            platformMetadata: platformMetadata as object,
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
