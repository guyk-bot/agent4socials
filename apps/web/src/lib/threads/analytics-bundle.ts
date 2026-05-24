import { prisma } from '@/lib/db';
import { threadsGet } from '@/lib/threads/threads-api';
import { fetchThreadsProfile } from '@/lib/threads/threads-api';
import { fetchThreadsMentionsTimeSeries } from '@/lib/threads/mentions-analytics';

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

function metricSeriesFromInsights(
  metrics: InsightMetric[],
  name: string
): Array<{ date: string; value: number }> {
  const row = metrics.find((m) => (m.name ?? '').toLowerCase() === name.toLowerCase());
  if (!row) return [];
  return insightTimeSeriesFromMetric(row);
}

function mergeDailySeries(
  ...seriesList: Array<Array<{ date: string; value: number }>>
): Array<{ date: string; value: number }> {
  const byDate = new Map<string, number>();
  for (const series of seriesList) {
    for (const pt of series) {
      byDate.set(pt.date, (byDate.get(pt.date) ?? 0) + pt.value);
    }
  }
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Threads insights API expects Unix timestamps for since/until. */
function threadsInsightsUnixRange(since?: string, until?: string): { since?: string; until?: string } {
  const out: { since?: string; until?: string } = {};
  if (since?.trim()) {
    const ms = Date.parse(`${since.trim().slice(0, 10)}T00:00:00.000Z`);
    if (Number.isFinite(ms)) out.since = String(Math.floor(ms / 1000));
  }
  if (until?.trim()) {
    const ms = Date.parse(`${until.trim().slice(0, 10)}T23:59:59.999Z`);
    if (Number.isFinite(ms)) out.until = String(Math.floor(ms / 1000));
  }
  return out;
}

/** Sum synced per-post metrics in range (fallback when account-level reposts/quotes lag). */
export async function sumThreadsImportedPostMetricsInRange(
  socialAccountId: string,
  since?: string,
  until?: string
): Promise<{ likes: number; replies: number; repostsQuotes: number; views: number }> {
  const sinceDate = since?.trim()
    ? new Date(`${since.trim().slice(0, 10)}T00:00:00.000Z`)
    : new Date(0);
  const untilDate = until?.trim()
    ? new Date(`${until.trim().slice(0, 10)}T23:59:59.999Z`)
    : new Date();
  const posts = await prisma.importedPost.findMany({
    where: {
      socialAccountId,
      publishedAt: { gte: sinceDate, lte: untilDate },
    },
    select: {
      likeCount: true,
      commentsCount: true,
      repostsCount: true,
      sharesCount: true,
      impressions: true,
    },
  });
  let likes = 0;
  let replies = 0;
  let repostsQuotes = 0;
  let views = 0;
  for (const p of posts) {
    likes += p.likeCount ?? 0;
    replies += p.commentsCount ?? 0;
    repostsQuotes += Math.max(p.repostsCount ?? 0, p.sharesCount ?? 0);
    views += p.impressions ?? 0;
  }
  return { likes, replies, repostsQuotes, views };
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
  mentionsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  engagementTimeSeries: Array<{ date: string; value: number }>;
  metricSeries: {
    likes: Array<{ date: string; value: number }>;
    replies: Array<{ date: string; value: number }>;
    reposts: Array<{ date: string; value: number }>;
    quotes: Array<{ date: string; value: number }>;
    mentions: Array<{ date: string; value: number }>;
  };
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
  Object.assign(params, threadsInsightsUnixRange(since, until));

  const { status, data } = await threadsGet<{
    data?: InsightMetric[];
    error?: { message?: string };
  }>('me/threads_insights', accessToken, params);

  let metricSeries = {
    likes: [] as Array<{ date: string; value: number }>,
    replies: [] as Array<{ date: string; value: number }>,
    reposts: [] as Array<{ date: string; value: number }>,
    quotes: [] as Array<{ date: string; value: number }>,
    mentions: [] as Array<{ date: string; value: number }>,
  };
  let mentionsTotal = 0;
  let engagementTimeSeries: Array<{ date: string; value: number }> = [];

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
    metricSeries = {
      likes: metricSeriesFromInsights(data.data, 'likes'),
      replies: metricSeriesFromInsights(data.data, 'replies'),
      reposts: metricSeriesFromInsights(data.data, 'reposts'),
      quotes: metricSeriesFromInsights(data.data, 'quotes'),
      mentions: [],
    };
    engagementTimeSeries = mergeDailySeries(
      metricSeries.likes,
      metricSeries.replies,
      metricSeries.reposts,
      metricSeries.quotes
    );
    const viewsMetric = data.data.find((m) => (m.name ?? '').toLowerCase() === 'views');
    if (viewsMetric) {
      const series = insightTimeSeriesFromMetric(viewsMetric);
      if (series.length > 0) impressionsTimeSeries.push(...series);
    }
  }

  try {
    const mentions = await fetchThreadsMentionsTimeSeries(accessToken, since, until);
    mentionsTotal = mentions.total;
    metricSeries = { ...metricSeries, mentions: mentions.series };
    engagementTimeSeries = mergeDailySeries(
      metricSeries.likes,
      metricSeries.replies,
      metricSeries.reposts,
      metricSeries.quotes,
      metricSeries.mentions
    );
  } catch {
    /* mentions are optional when scope missing */
  }

  return {
    viewsTotal,
    likesTotal,
    repliesTotal,
    repostsTotal,
    quotesTotal,
    mentionsTotal,
    impressionsTimeSeries,
    engagementTimeSeries,
    metricSeries,
    profile: profile
      ? {
          username: profile.username,
          name: profile.name,
          picture: profile.threads_profile_picture_url,
        }
      : undefined,
  };
}
