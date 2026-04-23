import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { createHash } from 'crypto';
import { fbRestBaseUrl } from './constants';
import { metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';
import { getOrDiscoverPostLifetimeMetrics } from './discovery';

/** Page identity + counts for dashboards. */
export async function fetchPageProfile(pageId: string, accessToken: string) {
  const res = await axios.get<{
    id?: string;
    name?: string;
    username?: string;
    about?: string;
    category?: string;
    category_list?: Array<{ id: string; name: string }>;
    fan_count?: number;
    followers_count?: number;
    verification_status?: string;
    is_published?: boolean;
    is_verified?: boolean;
    link?: string;
    website?: string;
    phone?: string;
  }>(`${fbRestBaseUrl}/${pageId}`, {
    params: {
      fields:
        'id,name,username,about,category,category_list,fan_count,followers_count,verification_status,is_published,is_verified,link,website,phone',
      access_token: accessToken,
    },
    timeout: 12_000,
    validateStatus: () => true,
  });
  return res;
}

export type FbPublishedPostRow = {
  id: string;
  message?: string;
  created_time?: string;
  permalink_url?: string;
  full_picture?: string;
  status_type?: string;
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  shares?: { count?: number };
  attachments?: {
    data?: Array<{
      media_type?: string;
      type?: string;
      media?: { image?: { src?: string } };
      subattachments?: {
        data?: Array<{
          media_type?: string;
          type?: string;
          media?: { image?: { src?: string } };
        }>;
      };
    }>;
  };
};

type PublishedPostsPage = { data?: FbPublishedPostRow[]; paging?: { next?: string; cursors?: { after?: string } } };

const PUBLISHED_FIELDS =
  'id,message,created_time,permalink_url,full_picture,status_type,reactions.summary(1),comments.summary(1),shares,attachments{media_type,type,media{image{src}},subattachments{media_type,type,media{image{src}}}}';

const POSTS_FEED_FIELDS = 'id,message,created_time,permalink_url';

type PostsFeedRow = { id: string; message?: string; created_time?: string; permalink_url?: string };
type PostsFeedPage = { data?: PostsFeedRow[]; paging?: { cursors?: { after?: string } } };

/**
 * One page of `published_posts`. Prefer advancing with `after` from `cursors`, not `paging.next`
 * (Meta often returns `next` on a different Graph version than the app).
 */
export async function fetchPublishedPostsPage(
  pageId: string,
  accessToken: string,
  options?: { after?: string; limit?: number }
): Promise<{ items: FbPublishedPostRow[]; afterCursor: string | null; ok: boolean; errorMessage?: string }> {
  const limit = options?.limit ?? 50;
  const params: Record<string, string | number> = {
    fields: PUBLISHED_FIELDS,
    access_token: accessToken,
    limit,
  };
  if (options?.after) params.after = options.after;
  const res: AxiosResponse<PublishedPostsPage & { error?: { message?: string; code?: number } }> = await axios.get(`${fbRestBaseUrl}/${pageId}/published_posts`, {
    params,
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    const errorMessage = res.data?.error?.message ?? `HTTP ${res.status}`;
    return { items: [], afterCursor: null, ok: false, errorMessage };
  }
  const data = res.data?.data ?? [];
  const paging = res.data?.paging;
  return {
    items: data,
    afterCursor: paging?.cursors?.after ?? null,
    ok: true,
  };
}

/**
 * Paginate `published_posts` using only our `fbRestBaseUrl` + `after` cursor (never follow `paging.next`).
 */
export async function fetchAllPublishedPostsForPage(
  pageId: string,
  accessToken: string,
  cap: number
): Promise<{ items: FbPublishedPostRow[]; pageFetches: number; lastError?: string }> {
  const items: FbPublishedPostRow[] = [];
  let after: string | undefined;
  let pageFetches = 0;
  const pageLimit = 50;
  let lastError: string | undefined;

  while (items.length < cap && pageFetches < 80) {
    pageFetches += 1;
    const { items: chunk, afterCursor, ok, errorMessage } = await fetchPublishedPostsPage(pageId, accessToken, {
      after,
      limit: pageLimit,
    });
    if (!ok) {
      lastError = errorMessage ?? 'published_posts request failed';
      break;
    }
    if (chunk.length === 0) break;
    for (const row of chunk) {
      if (items.length >= cap) break;
      items.push(row);
    }
    if (items.length >= cap) break;
    if (!afterCursor) break;
    after = afterCursor;
  }

  return { items, pageFetches, lastError };
}

/** Meta often returns `published_posts` oldest-first; sync must refresh newest posts first for insight caps. */
export function sortFbPublishedPostsNewestFirst(items: FbPublishedPostRow[]): FbPublishedPostRow[] {
  return [...items].sort((a, b) => {
    const ta = a.created_time ? Date.parse(a.created_time) : 0;
    const tb = b.created_time ? Date.parse(b.created_time) : 0;
    return tb - ta;
  });
}

export async function fetchPostsFeedPage(
  pageId: string,
  accessToken: string,
  options?: { after?: string; limit?: number }
): Promise<{ items: PostsFeedRow[]; afterCursor: string | null; ok: boolean }> {
  const limit = options?.limit ?? 50;
  const params: Record<string, string | number> = {
    fields: POSTS_FEED_FIELDS,
    access_token: accessToken,
    limit,
  };
  if (options?.after) params.after = options.after;
  const res: AxiosResponse<PostsFeedPage> = await axios.get(`${fbRestBaseUrl}/${pageId}/posts`, {
    params,
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    return { items: [], afterCursor: null, ok: false };
  }
  const data = res.data?.data ?? [];
  return {
    items: data,
    afterCursor: res.data?.paging?.cursors?.after ?? null,
    ok: true,
  };
}

/** Backfill `/posts` edge without following Meta's cross-version `paging.next`. */
export async function fetchAllPostsFeedForPage(
  pageId: string,
  accessToken: string,
  cap: number
): Promise<{ items: PostsFeedRow[]; pageFetches: number; lastError?: string }> {
  const items: PostsFeedRow[] = [];
  let after: string | undefined;
  let pageFetches = 0;
  const pageLimit = 50;
  let lastError: string | undefined;

  while (items.length < cap && pageFetches < 80) {
    pageFetches += 1;
    const { items: chunk, afterCursor, ok } = await fetchPostsFeedPage(pageId, accessToken, { after, limit: pageLimit });
    if (!ok) {
      lastError = 'posts feed request failed';
      break;
    }
    if (chunk.length === 0) break;
    for (const row of chunk) {
      if (items.length >= cap) break;
      items.push(row);
    }
    if (items.length >= cap) break;
    if (!afterCursor) break;
    after = afterCursor;
  }

  return { items, pageFetches, lastError };
}

export function reviewContentHash(createdTimeIso: string | null, reviewText: string | null): string {
  const t = createdTimeIso ?? '';
  const x = reviewText ?? '';
  return createHash('sha256').update(`${t}\0${x}`).digest('hex').slice(0, 48);
}

/** Pick primary “views” value for ImportedPost.impressions using probed-valid post metrics (order preserved). */
export async function fetchPostLifetimeMetricTotals(
  postId: string,
  accessToken: string,
  validMetricsInOrder: string[]
): Promise<{ impressions: number; metricUsed: string | null }> {
  for (const metric of validMetricsInOrder) {
    if (!metric) continue;
    try {
      const res = await axios.get(`${metaGraphInsightsBaseUrl}/${postId}/insights`, {
        params: { metric, access_token: accessToken },
        timeout: 10_000,
        validateStatus: () => true,
      });
      const body = res.data as {
        data?: Array<{ name: string; values?: Array<{ value: number }> }>;
        error?: { message?: string; code?: number };
      };
      if (body.error || res.status !== 200) continue;
      const row = body.data?.find((d) => d.name === metric);
      const v = row?.values?.[0]?.value;
      if (typeof v === 'number' && v >= 0) return { impressions: v, metricUsed: metric };
    } catch {
      continue;
    }
  }
  return { impressions: 0, metricUsed: null };
}

const POST_INSIGHT_PARALLEL = 4;

/** Normalize Meta post insight payloads (lifetime can use values[], total_value, or string numbers). */
function insightDataPointToNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function extractPostInsightMetricValue(row: {
  name?: string;
  values?: Array<{ value?: unknown }>;
  total_value?: { value?: unknown };
} | undefined): number | null {
  if (!row) return null;
  const tv = insightDataPointToNumber(row.total_value?.value);
  if (tv != null && tv >= 0) return tv;
  let sum = 0;
  let any = false;
  for (const pt of row.values ?? []) {
    const n = insightDataPointToNumber(pt?.value);
    if (n != null && n >= 0) {
      sum += n;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Fetch every probed-valid post metric (one Graph call each, small parallel batches). */
export async function fetchPostLifetimeInsightMap(
  postId: string,
  accessToken: string,
  metricNames: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const unique = [...new Set(metricNames.filter(Boolean))];
  for (let i = 0; i < unique.length; i += POST_INSIGHT_PARALLEL) {
    const chunk = unique.slice(i, i + POST_INSIGHT_PARALLEL);
    await Promise.all(
      chunk.map(async (metric) => {
        try {
          const res = await axios.get(`${metaGraphInsightsBaseUrl}/${postId}/insights`, {
            params: { metric, access_token: accessToken },
            timeout: 12_000,
            validateStatus: () => true,
          });
          const body = res.data as {
            data?: Array<{ name: string; values?: Array<{ value?: unknown }>; total_value?: { value?: unknown } }>;
            error?: { message?: string; code?: number };
          };
          if (body.error || res.status !== 200) return;
          const row = body.data?.find((d) => d.name === metric);
          const v = extractPostInsightMetricValue(row);
          if (v != null && v >= 0) out[metric] = v;
        } catch {
          /* skip */
        }
      })
    );
  }
  return out;
}

export function pickFacebookPostImpressionsFromInsightMap(m: Record<string, number>): {
  impressions: number;
  metricUsed: string | null;
} {
  const order = ['post_media_view', 'post_impressions', 'post_impressions_unique', 'post_engaged_users', 'post_video_views'];
  for (const k of order) {
    if (typeof m[k] === 'number' && m[k] >= 0) return { impressions: m[k], metricUsed: k };
  }
  for (const [k, v] of Object.entries(m)) {
    if (typeof v === 'number' && v >= 0) return { impressions: v, metricUsed: k };
  }
  return { impressions: 0, metricUsed: null };
}

export async function resolvePostInsightMetricsForSync(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
  samplePostId: string | null;
}): Promise<string[]> {
  const { metrics } = await getOrDiscoverPostLifetimeMetrics({
    socialAccountId: params.socialAccountId,
    pageId: params.pageId,
    samplePostId: params.samplePostId,
    accessToken: params.accessToken,
  });
  const preferred = [
    'post_media_view',
    'post_total_media_view_unique',
    'post_impressions',
    'post_impressions_unique',
    'post_engaged_users',
    'post_video_views',
  ];
  const ordered = [...preferred.filter((m) => metrics.includes(m)), ...metrics.filter((m) => !preferred.includes(m))];
  return ordered;
}
