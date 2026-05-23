import { threadsGet } from '@/lib/threads/threads-api';
import { fetchThreadsProfile } from '@/lib/threads/threads-api';

type InsightMetric = {
  name?: string;
  total_value?: { value?: number };
  values?: Array<{ value?: number; end_time?: string }>;
};

function insightMetricTotal(m: InsightMetric): number {
  if (m.total_value?.value != null && Number.isFinite(m.total_value.value)) {
    return m.total_value.value;
  }
  const vals = m.values ?? [];
  let sum = 0;
  for (const v of vals) {
    if (typeof v.value === 'number' && Number.isFinite(v.value)) sum += v.value;
  }
  return sum;
}

function insightTimeSeriesFromMetric(m: InsightMetric): Array<{ date: string; value: number }> {
  const out: Array<{ date: string; value: number }> = [];
  for (const v of m.values ?? []) {
    if (typeof v.value !== 'number' || !Number.isFinite(v.value)) continue;
    const end = v.end_time?.trim();
    const date = end ? new Date(end).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    out.push({ date, value: v.value });
  }
  return out;
}

export async function buildThreadsInsightsBundle(
  accessToken: string,
  since?: string,
  until?: string
): Promise<{
  viewsTotal: number;
  likesTotal: number;
  repliesTotal: number;
  repostsTotal: number;
  quotesTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  profile?: { username?: string; name?: string; picture?: string };
}> {
  const profile = await fetchThreadsProfile(accessToken);
  let viewsTotal = 0;
  let likesTotal = 0;
  let repliesTotal = 0;
  let repostsTotal = 0;
  let quotesTotal = 0;
  const impressionsTimeSeries: Array<{ date: string; value: number }> = [];

  const params: Record<string, string> = {
    metric: 'views,likes,replies,reposts,quotes',
  };
  if (since) params.since = since;
  if (until) params.until = until;

  const { status, data } = await threadsGet<{
    data?: InsightMetric[];
    error?: { message?: string };
  }>('me/threads_insights', accessToken, params);

  if (status === 200 && Array.isArray(data?.data)) {
    for (const m of data.data) {
      const n = insightMetricTotal(m);
      const name = (m.name ?? '').toLowerCase();
      if (name === 'views') viewsTotal += n;
      if (name === 'likes') likesTotal += n;
      if (name === 'replies') repliesTotal += n;
      if (name === 'reposts') repostsTotal += n;
      if (name === 'quotes') quotesTotal += n;
    }
    const viewsMetric = data.data.find((m) => (m.name ?? '').toLowerCase() === 'views');
    if (viewsMetric) {
      const series = insightTimeSeriesFromMetric(viewsMetric);
      if (series.length > 0) impressionsTimeSeries.push(...series);
    }
  }

  return {
    viewsTotal,
    likesTotal,
    repliesTotal,
    repostsTotal,
    quotesTotal,
    impressionsTimeSeries,
    profile: profile
      ? {
          username: profile.username,
          name: profile.name,
          picture: profile.threads_profile_picture_url,
        }
      : undefined,
  };
}
