/**
 * Threads @mentions analytics via GET me/mentions (threads_manage_mentions).
 * Account insights API does not expose a mentions metric; we aggregate mention timestamps.
 */

import { threadsGet } from '@/lib/threads/threads-api';

type MentionRow = {
  id?: string;
  timestamp?: string;
};

function mentionDateKey(timestamp: string | undefined): string | null {
  if (!timestamp?.trim()) return null;
  const ms = Date.parse(timestamp);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function inRange(
  dateKey: string,
  since?: string,
  until?: string
): boolean {
  if (since?.trim() && dateKey < since.trim().slice(0, 10)) return false;
  if (until?.trim() && dateKey > until.trim().slice(0, 10)) return false;
  return true;
}

/** Count @mentions by calendar day for the selected analytics range. */
export async function fetchThreadsMentionsTimeSeries(
  accessToken: string,
  since?: string,
  until?: string
): Promise<{ total: number; series: Array<{ date: string; value: number }> }> {
  const byDate = new Map<string, number>();
  let nextPath: string | null = 'me/mentions';
  let nextParams: Record<string, string | number | undefined> | undefined = {
    fields: 'id,timestamp',
    limit: 50,
  };
  let pages = 0;
  const pageLimit = 8;

  type PagePayload = {
    data?: MentionRow[];
    paging?: { next?: string };
    error?: { message?: string };
  };

  while (nextPath && pages < pageLimit) {
    const currentPath: string = nextPath;
    const currentParams = nextParams;
    const response: { status: number; data: PagePayload } = await threadsGet<PagePayload>(
      currentPath,
      accessToken,
      currentParams
    );
    if (response.status !== 200) break;
    for (const row of response.data?.data ?? []) {
      const dateKey = mentionDateKey(row.timestamp);
      if (!dateKey || !inRange(dateKey, since, until)) continue;
      byDate.set(dateKey, (byDate.get(dateKey) ?? 0) + 1);
    }
    const nextUrl: string | undefined = response.data?.paging?.next;
    if (!nextUrl) break;
    try {
      const parsed: URL = new URL(String(nextUrl));
      nextPath = parsed.pathname.replace(/^\/v1\.0\//, '').replace(/^\//, '');
      nextParams = undefined;
    } catch {
      break;
    }
    pages += 1;
  }

  const series = [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = series.reduce((s, pt) => s + pt.value, 0);
  return { total, series };
}
