import { prisma } from '@/lib/db';
import type { NicheVideoType } from '@prisma/client';
import { NICHE_KEYWORDS } from './niche-keywords';

const YT = 'https://www.googleapis.com/youtube/v3';

/** Save rows with views/subs above this; goal-line “outlier” for product is 5x (UI can badge). */
const SAVE_MIN_RATIO = 2.0;

export type NicheTrendSweepSummary = {
  nichesProcessed: number;
  videosConsidered: number;
  rowsUpserted: number;
  errors: string[];
  quotaNote: string;
};

function parseIso8601DurationSeconds(iso: string): number {
  if (!iso || iso === 'P0D') return 0;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const h = parseInt(m[1] || '0', 10);
  const min = parseInt(m[2] || '0', 10);
  const s = parseInt(m[3] || '0', 10);
  return h * 3600 + min * 60 + s;
}

async function ytGet<T>(path: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const u = new URL(`${YT}/${path}`);
  u.searchParams.set('key', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v !== '') u.searchParams.set(k, v);
  }
  const res = await fetch(u.toString(), { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`YouTube ${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

function rfc3339(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Alternating halves keep search quota under ~10k units per run (2 × search × 49 niches ≈ 9800). */
export function nichesForCurrentSweep(): string[] {
  const sliceEnv = process.env.NICHE_TREND_SLICE?.trim();
  if (sliceEnv === 'all') return [...NICHE_KEYWORDS];
  const half = Math.ceil(NICHE_KEYWORDS.length / 2);
  if (sliceEnv === '0') return NICHE_KEYWORDS.slice(0, half);
  if (sliceEnv === '1') return NICHE_KEYWORDS.slice(half);
  const oddDay = new Date().getUTCDate() % 2 === 1;
  return oddDay ? NICHE_KEYWORDS.slice(0, half) : NICHE_KEYWORDS.slice(half);
}

type SearchItem = { id?: { videoId?: string } };
type SearchResp = { items?: SearchItem[] };

async function searchVideos(
  apiKey: string,
  q: string,
  publishedAfter: Date,
  videoDuration?: 'short' | 'medium' | 'long'
): Promise<string[]> {
  const params: Record<string, string> = {
    part: 'snippet',
    type: 'video',
    q,
    order: 'viewCount',
    maxResults: '50',
    publishedAfter: rfc3339(publishedAfter),
  };
  if (videoDuration) params.videoDuration = videoDuration;
  const data = await ytGet<SearchResp>('search', params, apiKey);
  const ids = (data.items ?? [])
    .map((it) => it.id?.videoId)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  return [...new Set(ids)];
}

type VideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    publishedAt?: string;
    channelId?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string }; default?: { url?: string } };
  };
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};
type VideosResp = { items?: VideoItem[] };

async function videosList(apiKey: string, ids: string[]): Promise<VideoItem[]> {
  if (ids.length === 0) return [];
  const data = await ytGet<VideosResp>(
    'videos',
    {
      part: 'statistics,snippet,contentDetails',
      id: ids.slice(0, 50).join(','),
      maxResults: '50',
    },
    apiKey
  );
  return data.items ?? [];
}

type ChannelItem = { id?: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } };
type ChannelsResp = { items?: ChannelItem[] };

async function channelsList(apiKey: string, ids: string[]): Promise<Map<string, bigint>> {
  const out = new Map<string, bigint>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 50) {
    const chunk = unique.slice(i, i + 50);
    const data = await ytGet<ChannelsResp>(
      'channels',
      {
        part: 'statistics',
        id: chunk.join(','),
        maxResults: '50',
      },
      apiKey
    );
    for (const ch of data.items ?? []) {
      if (!ch.id) continue;
      const hidden = ch.statistics?.hiddenSubscriberCount === true;
      const raw = ch.statistics?.subscriberCount;
      const n = hidden || raw == null ? BigInt(0) : BigInt(String(raw));
      out.set(ch.id, n);
    }
  }
  return out;
}

export async function sweepOneNiche(apiKey: string, nicheName: string): Promise<{ upserted: number; considered: number; error?: string }> {
  const now = Date.now();
  const after48h = new Date(now - 48 * 60 * 60 * 1000);
  const after24h = new Date(now - 24 * 60 * 60 * 1000);

  let broad48: string[] = [];
  let short24: string[] = [];
  try {
    [broad48, short24] = await Promise.all([
      searchVideos(apiKey, nicheName, after48h),
      searchVideos(apiKey, nicheName, after24h, 'short'),
    ]);
  } catch (e) {
    return { upserted: 0, considered: 0, error: (e as Error).message };
  }

  const union: string[] = [];
  const seen = new Set<string>();
  for (const id of [...broad48, ...short24]) {
    if (seen.has(id)) continue;
    seen.add(id);
    union.push(id);
    if (union.length >= 50) break;
  }
  const allIds = union;
  if (allIds.length === 0) return { upserted: 0, considered: 0 };

  let items: VideoItem[];
  try {
    items = await videosList(apiKey, allIds);
  } catch (e) {
    return { upserted: 0, considered: allIds.length, error: (e as Error).message };
  }

  const channelIds = items.map((v) => v.snippet?.channelId).filter((c): c is string => !!c);
  let subsByChannel: Map<string, bigint>;
  try {
    subsByChannel = await channelsList(apiKey, channelIds);
  } catch (e) {
    return { upserted: 0, considered: items.length, error: (e as Error).message };
  }

  const nowDate = new Date();
  let upserted = 0;

  for (const v of items) {
    const vid = v.id;
    const ch = v.snippet?.channelId;
    if (!vid || !ch) continue;
    const durSec = parseIso8601DurationSeconds(v.contentDetails?.duration ?? '');
    const videoType: NicheVideoType = durSec > 0 && durSec < 60 ? 'short' : 'long';
    const viewsRaw = v.statistics?.viewCount;
    if (viewsRaw == null) continue;
    const views = BigInt(viewsRaw);
    const subs = subsByChannel.get(ch) ?? BigInt(0);
    if (subs <= BigInt(0)) continue;
    const ratio = Number(views) / Number(subs);
    if (!Number.isFinite(ratio) || ratio <= SAVE_MIN_RATIO) continue;

    const title = v.snippet?.title?.slice(0, 500) ?? 'Untitled';
    const thumb =
      v.snippet?.thumbnails?.high?.url ??
      v.snippet?.thumbnails?.medium?.url ??
      v.snippet?.thumbnails?.default?.url ??
      '';
    const publishedAt = v.snippet?.publishedAt ? new Date(v.snippet.publishedAt) : nowDate;

    await prisma.nicheTrend.upsert({
      where: { videoId: vid },
      create: {
        nicheName,
        videoId: vid,
        title,
        thumbnailUrl: thumb,
        viewCount: views,
        subscriberCount: subs,
        performanceRatio: ratio,
        videoType,
        publishedAt,
        lastUpdated: nowDate,
      },
      update: {
        nicheName,
        title,
        thumbnailUrl: thumb,
        viewCount: views,
        subscriberCount: subs,
        performanceRatio: ratio,
        videoType,
        publishedAt,
        lastUpdated: nowDate,
      },
    });
    upserted += 1;
  }

  return { upserted, considered: items.length };
}

/** Run YouTube sweep for an explicit list of niche keywords (used by cron slices and batched UI sync). */
export async function sweepNicheList(apiKey: string, nicheNames: string[]): Promise<NicheTrendSweepSummary> {
  const errors: string[] = [];
  let rowsUpserted = 0;
  let videosConsidered = 0;

  for (const niche of nicheNames) {
    const r = await sweepOneNiche(apiKey, niche);
    videosConsidered += r.considered;
    rowsUpserted += r.upserted;
    if (r.error) errors.push(`${niche}: ${r.error}`);
    await new Promise((res) => setTimeout(res, 50));
  }

  return {
    nichesProcessed: nicheNames.length,
    videosConsidered,
    rowsUpserted,
    errors,
    quotaNote:
      'Per niche: 2× search.list + videos.list + channels.list. Full 98 niches uses high YouTube quota; use small batches on serverless.',
  };
}

export async function runNicheTrendSweep(apiKey: string): Promise<NicheTrendSweepSummary> {
  return sweepNicheList(apiKey, nichesForCurrentSweep());
}

export type NicheBatchSweepResult = NicheTrendSweepSummary & {
  startIndex: number;
  nextIndex: number;
  done: boolean;
  totalNiches: number;
};

/** Process `count` niches starting at `startIndex` in NICHE_KEYWORDS order (0-based). */
export async function sweepNicheBatch(
  apiKey: string,
  startIndex: number,
  count: number
): Promise<NicheBatchSweepResult> {
  const all = NICHE_KEYWORDS;
  const safeStart = Math.max(0, Math.min(startIndex, all.length));
  const safeCount = Math.max(0, Math.min(count, all.length - safeStart));
  const slice = all.slice(safeStart, safeStart + safeCount);
  const summary = await sweepNicheList(apiKey, slice);
  const nextIndex = safeStart + slice.length;
  return {
    ...summary,
    startIndex: safeStart,
    nextIndex,
    done: nextIndex >= all.length,
    totalNiches: all.length,
  };
}

/** Latest sweep freshness for a niche (hours since last row update). */
export async function nicheLastUpdatedHoursAgo(nicheName: string): Promise<number | null> {
  const row = await prisma.nicheTrend.findFirst({
    where: { nicheName },
    orderBy: { lastUpdated: 'desc' },
    select: { lastUpdated: true },
  });
  if (!row) return null;
  return (Date.now() - row.lastUpdated.getTime()) / (60 * 60 * 1000);
}
