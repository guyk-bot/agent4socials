import axios from 'axios';
import type { AxiosResponse } from 'axios';
import { fbRestBaseUrl } from './constants';
import { metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';
import { getOrDiscoverPostLifetimeMetrics } from './discovery';

/** Page identity + counts for dashboards (Graph v18 object endpoint). */
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
  attachments?: {
    data?: Array<{
      media_type?: string;
      type?: string;
      media?: { image?: { src?: string } };
      subattachments?: { data?: Array<{ media_type?: string; type?: string }> };
    }>;
  };
};

type PublishedPostsPage = { data?: FbPublishedPostRow[]; paging?: { next?: string; cursors?: { after?: string } } };

const PUBLISHED_FIELDS =
  'id,message,created_time,permalink_url,full_picture,status_type,reactions.summary(1),comments.summary(1),attachments{media_type,type,media{image{src}},subattachments{media_type,type}}';

/**
 * Paginate `published_posts` until cap. Uses Graph REST base (v18) for compatibility with existing tokens.
 */
export async function fetchPublishedPostsPage(
  pageId: string,
  accessToken: string,
  options?: { after?: string; limit?: number }
): Promise<{ items: FbPublishedPostRow[]; nextUrl: string | null; afterCursor: string | null }> {
  const limit = options?.limit ?? 50;
  const params: Record<string, string | number> = {
    fields: PUBLISHED_FIELDS,
    access_token: accessToken,
    limit,
  };
  if (options?.after) params.after = options.after;
  const res: AxiosResponse<PublishedPostsPage> = await axios.get(`${fbRestBaseUrl}/${pageId}/published_posts`, {
    params,
    timeout: 20_000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    return { items: [], nextUrl: null, afterCursor: null };
  }
  const data = res.data?.data ?? [];
  const paging = res.data?.paging;
  return {
    items: data,
    nextUrl: paging?.next ?? null,
    afterCursor: paging?.cursors?.after ?? null,
  };
}

/** Follow `paging.next` or `after` cursor until cap or empty page. */
export async function fetchAllPublishedPostsForPage(
  pageId: string,
  accessToken: string,
  cap: number
): Promise<{ items: FbPublishedPostRow[]; pageFetches: number }> {
  const items: FbPublishedPostRow[] = [];
  let nextUrl: string | null = null;
  let after: string | undefined;
  let pageFetches = 0;

  while (items.length < cap && pageFetches < 60) {
    pageFetches += 1;
    let res: AxiosResponse<PublishedPostsPage>;
    if (nextUrl) {
      res = await axios.get<PublishedPostsPage>(nextUrl, { timeout: 25_000, validateStatus: () => true });
    } else {
      const params: Record<string, string | number> = {
        fields: PUBLISHED_FIELDS,
        access_token: accessToken,
        limit: 50,
      };
      if (after) params.after = after;
      res = await axios.get<PublishedPostsPage>(`${fbRestBaseUrl}/${pageId}/published_posts`, {
        params,
        timeout: 25_000,
        validateStatus: () => true,
      });
    }
    if (res.status !== 200) break;
    const chunk = res.data?.data ?? [];
    const paging = res.data?.paging;
    nextUrl = paging?.next ?? null;
    after = paging?.cursors?.after ?? undefined;
    if (chunk.length === 0) break;
    for (const row of chunk) {
      if (items.length >= cap) break;
      items.push(row);
    }
    if (items.length >= cap) break;
    if (!nextUrl && !after) break;
  }

  return { items, pageFetches };
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
  const preferred = ['post_media_view', 'post_impressions', 'post_impressions_unique', 'post_engaged_users', 'post_video_views'];
  const ordered = [...preferred.filter((m) => metrics.includes(m)), ...metrics.filter((m) => !preferred.includes(m))];
  return ordered;
}
