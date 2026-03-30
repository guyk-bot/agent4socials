'use client';

import React, { useMemo } from 'react';
import type { FacebookInsights } from './types';
import type { FacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';
import { FACEBOOK_ANALYTICS_SECTION_IDS } from './facebook-analytics-section-ids';

const sectionId = FACEBOOK_ANALYTICS_SECTION_IDS.readInsightsApi;

const TOTAL_ROWS: Array<{ key: keyof FacebookFrontendAnalyticsBundle['totals']; label: string; hint?: string }> = [
  { key: 'contentViews', label: 'Content views', hint: 'Page media views / impressions in this date range' },
  { key: 'pageTabViews', label: 'Page tab views', hint: 'page_views_total' },
  { key: 'engagement', label: 'Post engagements', hint: 'page_post_engagements' },
  { key: 'videoViews', label: 'Video views', hint: 'page_video_views' },
  { key: 'videoViewTime', label: 'Video view time', hint: 'As returned by Meta for your Page' },
  { key: 'follows', label: 'Follows (net in range)', hint: 'page_follows' },
  { key: 'dailyFollows', label: 'New follows (sum of daily)', hint: 'page_daily_follows' },
  { key: 'totalActions', label: 'Total actions', hint: 'page_total_actions' },
  { key: 'postImpressions', label: 'Post impressions', hint: 'page_posts_impressions' },
  { key: 'postImpressionsNonviral', label: 'Post impressions (non-viral)' },
  { key: 'postImpressionsViral', label: 'Post impressions (viral)' },
];

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n % 1) return n.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  return Math.round(n).toLocaleString();
}

export function FacebookReadInsightsPanel({
  insights,
  loading,
}: {
  insights: FacebookInsights | null;
  loading: boolean;
}) {
  const bundle = insights?.facebookAnalytics;
  const graphKeys = useMemo(() => {
    const fromBundle = bundle?.sourceGraphMetricsIncluded ?? [];
    const fromRaw = insights?.facebookPageMetricSeries
      ? Object.keys(insights.facebookPageMetricSeries).filter(
          (k) => (insights.facebookPageMetricSeries![k]?.length ?? 0) > 0
        )
      : [];
    const merged = [...new Set([...fromBundle, ...fromRaw])];
    return merged.sort();
  }, [bundle?.sourceGraphMetricsIncluded, insights?.facebookPageMetricSeries]);

  if (loading) {
    return (
      <div
        id={sectionId}
        className="scroll-mt-6 rounded-2xl border border-[#1877F2]/25 bg-gradient-to-br from-[#1877F2]/[0.06] to-transparent p-6 sm:p-8 animate-pulse"
      >
        <div className="h-6 w-64 rounded-lg bg-neutral-200 mb-4" />
        <div className="h-4 w-full max-w-2xl rounded bg-neutral-100 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-neutral-100" />
          ))}
        </div>
      </div>
    );
  }

  const totals = bundle?.totals;
  const hasAnyTotal = totals && TOTAL_ROWS.some((r) => (totals[r.key] ?? 0) !== 0);
  const hasGraphSeries = graphKeys.length > 0;

  return (
    <section
      id={sectionId}
      className="scroll-mt-6 rounded-2xl border border-[#1877F2]/30 bg-gradient-to-br from-[#1877F2]/[0.08] via-white to-white p-6 sm:p-8 shadow-sm"
      aria-labelledby="facebook-read-insights-heading"
    >
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h2 id="facebook-read-insights-heading" className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight">
            Page insights from Facebook
          </h2>
          <p className="mt-2 text-sm text-neutral-600 max-w-3xl leading-relaxed">
            This block shows metrics loaded with Meta&apos;s{' '}
            <strong className="font-semibold text-neutral-800">read_insights</strong> permission on your Page (Facebook
            Page Insights API). We use them only to display <strong>your</strong> Page analytics inside Agent4Socials,
            consistent with Meta&apos;s allowed use for your own analytics tools.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Follower count in the overview cards also comes from your Page profile when available; time series here are
            from Page Insights for the selected date range.
          </p>
        </div>
        <div className="shrink-0 rounded-lg bg-[#1877F2]/10 px-3 py-2 text-xs font-medium text-[#166FE5] border border-[#1877F2]/20">
          App Review: record this section
        </div>
      </div>

      {!bundle && !hasGraphSeries && (
        <p className="text-sm text-neutral-600 rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3">
          No Page Insights payload yet for this range. Connect a Facebook Page with{' '}
          <strong>read_insights</strong> granted, pick a date range, and refresh. If you still see this, check the hint
          at the top of analytics or reconnect the Page.
        </p>
      )}

      {totals && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
          {TOTAL_ROWS.map(({ key, label, hint }) => {
            const v = totals[key] ?? 0;
            return (
              <div
                key={key}
                className="rounded-xl border border-neutral-200/90 bg-white/90 p-4 shadow-sm"
                title={hint}
              >
                <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wide leading-tight">{label}</p>
                <p className="mt-1.5 text-xl font-bold text-neutral-900 tabular-nums">{fmt(v)}</p>
                {hint && <p className="mt-1 text-[10px] text-neutral-400 leading-snug">{hint}</p>}
              </div>
            );
          })}
        </div>
      )}

      {graphKeys.length > 0 && (
        <div className="mt-6 pt-6 border-t border-neutral-200/80">
          <h3 className="text-sm font-semibold text-neutral-800 mb-2">Graph metrics included in this response</h3>
          <p className="text-xs text-neutral-500 mb-3">
            Raw metric names from <code className="px-1 py-0.5 rounded bg-neutral-100 text-neutral-700">GET /&#123;page-id&#125;/insights</code>{' '}
            (day period) that had at least one data point for your Page in this load:
          </p>
          <ul className="flex flex-wrap gap-2">
            {graphKeys.map((k) => (
              <li
                key={k}
                className="text-xs font-mono px-2.5 py-1 rounded-md bg-neutral-100 text-neutral-800 border border-neutral-200/80"
              >
                {k}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasAnyTotal && bundle && (
        <p className="mt-4 text-sm text-neutral-500">
          All totals are zero for this range (common for new Pages or short windows). The metric list above still shows
          which insights Meta returned.
        </p>
      )}
    </section>
  );
}
