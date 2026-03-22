/**
 * Stable, UI-oriented shape for Facebook Page analytics derived from Graph metric names.
 * Populated from registry-valid fetched series + merged snapshot-backed views where applicable.
 */

export type FacebookMetricSeriesPoint = { date: string; value: number };

export type FacebookFrontendAnalyticsBundle = {
  followers: number;
  series: {
    /** Primary "views" chart: merged `page_impressions` / `page_media_view` when available. */
    contentViews: FacebookMetricSeriesPoint[];
    /** Page tab / profile views (`page_views_total`). */
    pageTabViews: FacebookMetricSeriesPoint[];
    /** Engagements on posts (`page_post_engagements`). */
    engagement: FacebookMetricSeriesPoint[];
    videoViews: FacebookMetricSeriesPoint[];
    /** Typically seconds or ms per Meta; values passed through as returned. */
    videoViewTime: FacebookMetricSeriesPoint[];
    /** Net follows (`page_follows`). */
    follows: FacebookMetricSeriesPoint[];
    /** Daily new follows (`page_daily_follows`). */
    dailyFollows: FacebookMetricSeriesPoint[];
    totalActions: FacebookMetricSeriesPoint[];
    postImpressions: FacebookMetricSeriesPoint[];
    postImpressionsNonviral: FacebookMetricSeriesPoint[];
    postImpressionsViral: FacebookMetricSeriesPoint[];
  };
  /** Sum of daily values over the returned series (simple rollup for KPIs). */
  totals: {
    contentViews: number;
    pageTabViews: number;
    engagement: number;
    videoViews: number;
    videoViewTime: number;
    follows: number;
    dailyFollows: number;
    totalActions: number;
    postImpressions: number;
    postImpressionsNonviral: number;
    postImpressionsViral: number;
  };
  /** Graph metric keys that had at least one point in this response. */
  sourceGraphMetricsIncluded: string[];
};

function sumSeries(s: FacebookMetricSeriesPoint[]): number {
  return s.reduce((a, p) => a + (typeof p.value === 'number' ? p.value : 0), 0);
}

function pick(
  graph: Record<string, FacebookMetricSeriesPoint[]>,
  key: string
): FacebookMetricSeriesPoint[] {
  const s = graph[key];
  return Array.isArray(s) && s.length > 0 ? s : [];
}

/**
 * Build the dashboard-ready bundle. Prefer merged snapshot series for content/tab views when provided.
 */
export function buildFacebookFrontendAnalyticsBundle(input: {
  followers: number;
  graphSeries: Record<string, FacebookMetricSeriesPoint[]>;
  mergedContentViewsSeries: FacebookMetricSeriesPoint[];
  mergedPageTabViewsSeries?: FacebookMetricSeriesPoint[];
}): FacebookFrontendAnalyticsBundle {
  const g = input.graphSeries ?? {};
  const contentViews =
    input.mergedContentViewsSeries.length > 0 ? input.mergedContentViewsSeries : pick(g, 'page_media_view');
  const pageTabViews =
    input.mergedPageTabViewsSeries && input.mergedPageTabViewsSeries.length > 0
      ? input.mergedPageTabViewsSeries
      : pick(g, 'page_views_total');

  const engagement = pick(g, 'page_post_engagements');
  const videoViews = pick(g, 'page_video_views');
  const videoViewTime = pick(g, 'page_video_view_time');
  const follows = pick(g, 'page_follows');
  const dailyFollows = pick(g, 'page_daily_follows');
  const totalActions = pick(g, 'page_total_actions');
  const postImpressions = pick(g, 'page_posts_impressions');
  const postImpressionsNonviral = pick(g, 'page_posts_impressions_nonviral');
  const postImpressionsViral = pick(g, 'page_posts_impressions_viral');

  const sourceGraphMetricsIncluded = Object.keys(g).filter((k) => (g[k]?.length ?? 0) > 0);

  return {
    followers: input.followers,
    series: {
      contentViews,
      pageTabViews,
      engagement,
      videoViews,
      videoViewTime,
      follows,
      dailyFollows,
      totalActions,
      postImpressions,
      postImpressionsNonviral,
      postImpressionsViral,
    },
    totals: {
      contentViews: sumSeries(contentViews),
      pageTabViews: sumSeries(pageTabViews),
      engagement: sumSeries(engagement),
      videoViews: sumSeries(videoViews),
      videoViewTime: sumSeries(videoViewTime),
      follows: sumSeries(follows),
      dailyFollows: sumSeries(dailyFollows),
      totalActions: sumSeries(totalActions),
      postImpressions: sumSeries(postImpressions),
      postImpressionsNonviral: sumSeries(postImpressionsNonviral),
      postImpressionsViral: sumSeries(postImpressionsViral),
    },
    sourceGraphMetricsIncluded,
  };
}
