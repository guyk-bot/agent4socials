/**
 * Instagram @mentions in captions via mentioned_media (Instagram Graph API).
 * @see https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/mentioned_media/
 */

import axios from 'axios';
import { aggregateMentionsByDate } from '@/lib/analytics/mentions-time-series';
import { isMetaNonCriticalThrottled, noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';

type MentionRow = { id?: string; timestamp?: string };

async function fetchMentionPage(
  url: string,
  params: Record<string, string>
): Promise<{ rows: MentionRow[]; nextUrl: string | null }> {
  const res = await axios.get<{
    data?: MentionRow[];
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

export async function fetchInstagramMentionsTimeSeries(params: {
  igUserId: string;
  accessToken: string;
  graphBaseUrl: string;
  since?: string;
  until?: string;
  maxPages?: number;
}): Promise<{ total: number; series: Array<{ date: string; value: number }> }> {
  if (isMetaNonCriticalThrottled()) {
    return { total: 0, series: [] };
  }

  const { igUserId, accessToken, graphBaseUrl, since, until } = params;
  const maxPages = params.maxPages ?? 6;
  const timestamps: string[] = [];

  let nextUrl: string | null = `${graphBaseUrl}/${igUserId}/mentioned_media`;
  let nextParams: Record<string, string> | undefined = {
    fields: 'id,timestamp',
    limit: '50',
    access_token: accessToken,
  };
  let pages = 0;

  while (nextUrl && pages < maxPages) {
    const { rows, nextUrl: pagingNext } = await fetchMentionPage(nextUrl, nextParams ?? {});
    for (const row of rows) {
      if (row.timestamp) timestamps.push(row.timestamp);
    }
    pages += 1;
    if (!pagingNext) break;
    nextUrl = pagingNext;
    nextParams = undefined;
    const oldest = rows[rows.length - 1]?.timestamp?.slice(0, 10);
    if (oldest && since?.trim() && oldest < since.trim().slice(0, 10)) break;
  }

  return aggregateMentionsByDate(timestamps, since, until);
}
