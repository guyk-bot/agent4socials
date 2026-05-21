import { threadsGet } from '@/lib/threads/threads-api';
import { fetchThreadsProfile } from '@/lib/threads/threads-api';

type InsightMetric = {
  name?: string;
  total_value?: { value?: number };
  values?: Array<{ value?: number }>;
};

export async function buildThreadsInsightsBundle(
  accessToken: string,
  since?: string,
  until?: string
): Promise<{
  viewsTotal: number;
  likesTotal: number;
  repliesTotal: number;
  repostsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  profile?: { username?: string; name?: string; picture?: string };
}> {
  const profile = await fetchThreadsProfile(accessToken);
  let viewsTotal = 0;
  let likesTotal = 0;
  let repliesTotal = 0;
  let repostsTotal = 0;
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
      const val =
        m.total_value?.value ??
        (m.values?.[0]?.value != null ? m.values[0].value : 0);
      const n = typeof val === 'number' && Number.isFinite(val) ? val : 0;
      const name = (m.name ?? '').toLowerCase();
      if (name === 'views') viewsTotal += n;
      if (name === 'likes') likesTotal += n;
      if (name === 'replies') repliesTotal += n;
      if (name === 'reposts') repostsTotal += n;
    }
    const viewsMetric = data.data.find((m) => (m.name ?? '').toLowerCase() === 'views');
    if (viewsMetric?.values?.length) {
      for (const v of viewsMetric.values) {
        if (typeof v.value === 'number') {
          impressionsTimeSeries.push({
            date: new Date().toISOString().slice(0, 10),
            value: v.value,
          });
        }
      }
    }
  }

  return {
    viewsTotal,
    likesTotal,
    repliesTotal,
    repostsTotal,
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
