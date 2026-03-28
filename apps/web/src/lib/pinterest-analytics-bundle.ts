/**
 * Map Pinterest user_account + analytics API shapes into the same bundle type
 * the premium analytics UI uses for Facebook, so charts and KPIs render without FB-only code paths.
 */

import type { FacebookFrontendAnalyticsBundle, FacebookMetricSeriesPoint } from '@/lib/facebook/frontend-analytics-bundle';

function sumSeries(points: FacebookMetricSeriesPoint[]): number {
  return points.reduce((a, p) => a + (typeof p.value === 'number' && Number.isFinite(p.value) ? p.value : 0), 0);
}

function mergeByDate(points: FacebookMetricSeriesPoint[]): FacebookMetricSeriesPoint[] {
  const map: Record<string, number> = {};
  for (const p of points) {
    const d = p.date?.slice(0, 10);
    if (!d) continue;
    map[d] = (map[d] ?? 0) + (typeof p.value === 'number' ? p.value : 0);
  }
  return Object.entries(map)
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function metricNum(m: Record<string, number>, ...keys: string[]): number {
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return 0;
}

/**
 * Build dashboard bundle from Pinterest `GET /v5/user_account/analytics` body (`all.daily_metrics` / `all.summary_metrics`).
 */
export function buildPinterestFrontendAnalyticsBundle(input: {
  followerCount: number;
  daily: Array<{ date?: string; metrics?: Record<string, number> }>;
}): FacebookFrontendAnalyticsBundle {
  const rawContent: FacebookMetricSeriesPoint[] = [];
  const rawEngagement: FacebookMetricSeriesPoint[] = [];
  const rawVideo: FacebookMetricSeriesPoint[] = [];

  for (const row of input.daily) {
    const d = (row.date ?? '').slice(0, 10);
    if (!d) continue;
    const m = row.metrics ?? {};
    const imp = metricNum(m, 'IMPRESSION', 'impression', 'PIN_IMPRESSION', 'pin_impression');
    const eng =
      metricNum(m, 'ENGAGEMENT', 'engagement') ||
      metricNum(m, 'SAVE', 'save') +
        metricNum(m, 'OUTBOUND_CLICK', 'outbound_click') +
        metricNum(m, 'PIN_CLICK', 'pin_click') +
        metricNum(m, 'CLICKTHROUGH', 'clickthrough');
    const vid =
      metricNum(m, 'VIDEO_MRC_VIEW', 'video_mrc_view', 'VIDEO_START', 'video_start', 'VIDEO_V50_WATCH', 'video_v50_watch') ||
      metricNum(m, 'QUARTILE_95_PERCENT_VIEW', 'quartile_95_percent_view');
    rawContent.push({ date: d, value: imp });
    rawEngagement.push({ date: d, value: eng });
    rawVideo.push({ date: d, value: vid });
  }

  const contentViews = mergeByDate(rawContent);
  const engagement = mergeByDate(rawEngagement);
  const videoViews = mergeByDate(rawVideo);
  const postImpressions = mergeByDate(rawContent);

  const dates = new Set<string>();
  for (const s of [contentViews, engagement, videoViews]) {
    for (const p of s) dates.add(p.date);
  }
  const follows: FacebookMetricSeriesPoint[] = [...dates]
    .sort((a, b) => a.localeCompare(b))
    .map((date) => ({ date, value: input.followerCount }));

  const series = {
    contentViews,
    pageTabViews: [] as FacebookMetricSeriesPoint[],
    engagement,
    videoViews,
    videoViewTime: [] as FacebookMetricSeriesPoint[],
    follows,
    dailyFollows: [] as FacebookMetricSeriesPoint[],
    totalActions: engagement,
    postImpressions,
    postImpressionsNonviral: postImpressions,
    postImpressionsViral: [] as FacebookMetricSeriesPoint[],
  };

  return {
    followers: input.followerCount,
    series,
    totals: {
      contentViews: sumSeries(contentViews),
      pageTabViews: 0,
      engagement: sumSeries(engagement),
      videoViews: sumSeries(videoViews),
      videoViewTime: 0,
      follows: sumSeries(follows),
      dailyFollows: 0,
      totalActions: sumSeries(engagement),
      postImpressions: sumSeries(postImpressions),
      postImpressionsNonviral: sumSeries(postImpressions),
      postImpressionsViral: 0,
    },
    sourceGraphMetricsIncluded: ['pinterest_user_account_analytics'],
  };
}
