/**
 * Facebook Page @mentions / tags via GET /{page-id}/tagged.
 * @see https://developers.facebook.com/docs/graph-api/reference/page/feed/
 */

import axios from 'axios';
import { aggregateMentionsByDate } from '@/lib/analytics/mentions-time-series';
import { isMetaNonCriticalThrottled, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';

type TaggedRow = { id?: string; created_time?: string };

async function fetchTaggedPage(
  url: string,
  params: Record<string, string>
): Promise<{ rows: TaggedRow[]; nextUrl: string | null }> {
  const res = await axios.get<{
    data?: TaggedRow[];
    paging?: { next?: string };
    error?: { message?: string };
  }>(url, {
    params,
    timeout: 15_000,
    validateStatus: () => true,
  });
  noteMetaUsageFromHeaders(res.headers);
  if (res.status < 200 || res.status >= 300 || res.data?.error) {
    return { rows: [], nextUrl: null };
  }
  return {
    rows: res.data?.data ?? [],
    nextUrl: res.data?.paging?.next ?? null,
  };
}

export async function fetchFacebookTaggedTimeSeries(params: {
  pageId: string;
  accessToken: string;
  graphBaseUrl: string;
  since?: string;
  until?: string;
  maxPages?: number;
}): Promise<{ total: number; series: Array<{ date: string; value: number }> }> {
  if (isMetaNonCriticalThrottled()) {
    return { total: 0, series: [] };
  }

  const { pageId, accessToken, graphBaseUrl, since, until } = params;
  const maxPages = params.maxPages ?? 6;
  const timestamps: string[] = [];

  let nextUrl: string | null = `${graphBaseUrl}/${pageId}/tagged`;
  let nextParams: Record<string, string> | undefined = {
    fields: 'id,created_time',
    limit: '50',
    access_token: accessToken,
  };
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const { rows, nextUrl: pagingNext } = await fetchTaggedPage(nextUrl, nextParams ?? {});
    for (const row of rows) {
      if (row.created_time) timestamps.push(row.created_time);
    }
    pages += 1;
    if (!pagingNext) break;
    nextUrl = pagingNext;
    nextParams = undefined;
    const oldest = rows[rows.length - 1]?.created_time?.slice(0, 10);
    if (oldest && since?.trim() && oldest < since.trim().slice(0, 10)) break;
  }

  return aggregateMentionsByDate(timestamps, since, until);
}
