'use client';

import React from 'react';
import { AnalyticsKpiCard } from '../AnalyticsKpiCard';
import { AnalyticsSectionHeader } from '../AnalyticsSectionHeader';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import type { FacebookInsights } from './types';

interface FacebookPageViewsTabProps {
  insights: FacebookInsights | null;
  dateRange: { start: string; end: string };
  loading: boolean;
  onUpgrade?: () => void;
}

export function FacebookPageViewsTab({
  insights,
  dateRange,
  loading,
  onUpgrade,
}: FacebookPageViewsTabProps) {
  const start = dateRange.start ? new Date(dateRange.start) : null;
  const end = dateRange.end ? new Date(dateRange.end) : null;
  const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;

  const impressionsTotal = insights?.impressionsTotal ?? 0;
  const pageViewsTotal = insights?.pageViewsTotal ?? 0;
  const viewsSeries = insights?.impressionsTimeSeries ?? [];
  const displayViewsSeries =
    viewsSeries.length > 0 && viewsSeries.some((d) => d.value > 0)
      ? viewsSeries
      : impressionsTotal > 0
        ? [{ date: dateRange.start || '', value: impressionsTotal }, { date: dateRange.end || '', value: impressionsTotal }]
        : [];

  const avgDailyViews = days && impressionsTotal ? (impressionsTotal / days).toFixed(1) : '—';
  const avgDailyVisits = days && pageViewsTotal ? (pageViewsTotal / days).toFixed(1) : '—';

  if (loading) {
    return (
      <div className="space-y-10 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-10" style={{ maxWidth: 1400 }}>
      {/* Section A — Traffic summary cards */}
      <section>
        <AnalyticsSectionHeader title="Traffic summary" subtitle="Page views and visits in the selected period." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <AnalyticsKpiCard label="Total page views" value={impressionsTotal} accent="visibility" />
          <AnalyticsKpiCard label="Page visits" value={insights?.pageViewsTotal ?? '—'} accent="visibility" />
          <AnalyticsKpiCard label="Avg daily views" value={avgDailyViews} accent="visibility" />
          <AnalyticsKpiCard label="Avg daily visits" value={avgDailyVisits} accent="visibility" />
        </div>
      </section>

      {/* Section B — Main traffic chart (Views; page visits total in cards only, no daily series from API) */}
      <section>
        <AnalyticsSectionHeader title="Page views over time" subtitle="Daily page impressions." />
        <AnalyticsWatermarkedChart title="" height={280}>
          <div style={{ height: 260 }}>
            {displayViewsSeries.length > 0 ? (
              <InteractiveLineChart
                data={displayViewsSeries}
                valueLabel="Views"
                color="#6366f1"
                height={260}
                crosshair
              />
            ) : (
              <div className="flex items-center justify-center h-full text-neutral-400 text-sm">No views data for this period</div>
            )}
          </div>
        </AnalyticsWatermarkedChart>
      </section>

      {/* Section C — Daily averages row */}
      <section>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg daily page views</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{avgDailyViews}</p>
          </div>
          <div className="rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3">
            <p className="text-xs font-medium text-[#6b7280] uppercase tracking-wider">Avg daily visits</p>
            <p className="text-lg font-semibold text-[#111827] tabular-nums">{avgDailyVisits}</p>
          </div>
        </div>
      </section>

      {/* Section D — Locked/upgrade CTA */}
      <section>
        <AnalyticsUpgradeCard
          title="Unlock deeper Facebook insights"
          description="Get longer history, cleaner exports, and advanced account metrics with a paid plan."
          ctaLabel="Upgrade plan"
          onCta={onUpgrade}
        />
      </section>
    </div>
  );
}
