/**
 * X @mentions analytics via GET /2/users/{id}/mentions (tweet.read).
 */

import axios from 'axios';
import { aggregateMentionsByDate } from '@/lib/analytics/mentions-time-series';
import { checkAndIncrementXApiUsage } from '@/lib/x/x-api-usage';

type MentionTweet = { id?: string; created_at?: string };

export async function fetchTwitterMentionsTimeSeries(params: {
  accessToken: string;
  platformUserId: string;
  socialAccountId?: string;
  since?: string;
  until?: string;
  maxPages?: number;
}): Promise<{ total: number; series: Array<{ date: string; value: number }> }> {
  const { accessToken, platformUserId, since, until, socialAccountId } = params;
  const userId = platformUserId.trim();
  if (!/^\d+$/.test(userId)) {
    return { total: 0, series: [] };
  }

  const maxPages = params.maxPages ?? 8;
  const timestamps: string[] = [];
  let nextToken: string | undefined;
  let pages = 0;
  const url = `https://api.twitter.com/2/users/${userId}/mentions`;

  while (pages < maxPages) {
    if (socialAccountId) await checkAndIncrementXApiUsage(socialAccountId);
    const qs: Record<string, string> = {
      max_results: '100',
      'tweet.fields': 'created_at',
    };
    if (nextToken) qs.pagination_token = nextToken;

    const res = await axios.get<{
      data?: MentionTweet[];
      meta?: { next_token?: string };
    }>(url, {
      params: qs,
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 20_000,
      validateStatus: () => true,
    });

    if (res.status < 200 || res.status >= 300) break;

    for (const row of res.data?.data ?? []) {
      if (row.created_at) timestamps.push(row.created_at);
    }

    nextToken = res.data?.meta?.next_token;
    pages += 1;
    if (!nextToken) break;

    const oldest = res.data?.data?.[res.data.data.length - 1]?.created_at?.slice(0, 10);
    if (oldest && since?.trim() && oldest < since.trim().slice(0, 10)) break;
  }

  return aggregateMentionsByDate(timestamps, since, until);
}
