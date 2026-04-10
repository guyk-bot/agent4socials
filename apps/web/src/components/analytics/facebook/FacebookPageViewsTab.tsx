'use client';

import React, { useState, useMemo } from 'react';
import { AnalyticsKpiCard } from '../AnalyticsKpiCard';
import { AnalyticsSectionHeader } from '../AnalyticsSectionHeader';
import { AnalyticsWatermarkedChart } from '../AnalyticsWatermarkedChart';
import { AnalyticsUpgradeCard } from '../AnalyticsUpgradeCard';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import type { FacebookInsights } from './types';

type SeriesToggle = 'views' | 'visits' | 'clicks';

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
  const [visibleSeries, setVisibleSeries] = useState<SeriesToggle[]>(['views', 'visits']);

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

  const visitsSeries = useMemo(() => {
    if (!pageViewsTotal) return [];
    if (displayViewsSeries.length > 0) {
      return displayViewsSeries.map((d) => ({ date: d.date, value: Math.round(pageViewsTotal / Math.max(1, days || 1)) }));
    }
    return [{ date: dateRange.start || '', value: pageViewsTotal }, { date: dateRange.end || '', value: pageViewsTotal }];
  }, [pageViewsTotal, displayViewsSeries, days, dateRange.start, dateRange.end]);

  const avgDailyViews = days && impressionsTotal ? (impressionsTotal / days).toFixed(1) : '—';
  const avgDailyVisits = days && pageViewsTotal ? (pageViewsTotal / days).toFixed(1) : '—';

  const hasViews = displayViewsSeries.length > 0;
  const hasVisits = visitsSeries.length > 0 && pageViewsTotal > 0;
  const hasClicks = false;
  const showChart = (visibleSeries.includes('views') && hasViews) || (visibleSeries.includes('visits') && hasVisits);
  const showBoth = visibleSeries.includes('views') && visibleSeries.includes('visits') && hasViews && hasVisits;
  const primarySeries =
    showBoth || (visibleSeries.includes('views') && hasViews)
      ? displayViewsSeries
      : (visibleSeries.includes('visits') && hasVisits ? visitsSeries : displayViewsSeries);
  const secondarySeries = showBoth ? visitsSeries : undefined;
  const primaryLabel = visibleSeries.includes('views') && hasViews ? 'Views' : 'Page visits';
  const secondaryLabel = showBoth ? 'Page visits' : undefined;

  if (loading) {
    return (
      <div className="space-y-6 md:space-y-10 animate-pulse">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="h-80 rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-10 max-w-full" style={{ maxWidth: 1400 }}>
      {/* Section A — Traffic summary cards */}
      <section>
        <AnalyticsSectionHeader title="Traffic summary" subtitle="Page views and visits in the selected period." />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <AnalyticsKpiCard label="Total page views" value={impressionsTotal} accent="visibility" />
          <AnalyticsKpiCard label="Page visits" value={insights?.pageViewsTotal ?? '—'} accent="visibility" />
          <AnalyticsKpiCard label="Total clicks" value="—" accent="muted" />
          <AnalyticsKpiCard label="Avg daily views" value={avgDailyViews} accent="visibility" />
          <AnalyticsKpiCard label="Avg daily visits" value={avgDailyVisits} accent="visibility" />
        </div>
      </section>

      {/* Section B — Main traffic chart with toggle chips: Views, Page visits, Clicks (default Views + Page visits) */}
      <section>
        <AnalyticsSectionHeader title="Traffic over time" subtitle="Toggle series to compare." />
        <AnalyticsWatermarkedChart title="" height={280}>
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(['views', 'visits', 'clicks'] as const).map((key) => {
                const isOn = visibleSeries.includes(key);
                const available = key === 'views' ? hasViews : key === 'visits' ? hasVisits : hasClicks;
                const label = key === 'views' ? 'Views' : key === 'visits' ? 'Page visits' : 'Clicks';
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (key === 'clicks' && !hasClicks) return;
                      setVisibleSeries((prev) =>
                        isOn ? prev.filter((s) => s !== key) : [...prev, key].sort((a, b) => (a === 'views' ? -1 : a === 'visits' ? 0 : 1) - (b === 'views' ? -1 : b === 'visits' ? 0 : 1))
                      );
                    }}
                    disabled={key === 'clicks' && !hasClicks}
                    title={key === 'clicks' && !hasClicks ? 'Clicks data not available from API' : undefined}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      isOn ? 'bg-[#111827] text-white' : key === 'clicks' && !hasClicks ? 'bg-neutral-100 text-neutral-400 cursor-not-allowed' : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    {label}
                    {key === 'clicks' && !hasClicks && ' (unavailable)'}
                  </button>
                );
              })}
            </div>
            <div className="w-full" style={{ height: 260 }}>
              {showChart && primarySeries.length > 0 ? (
                <InteractiveLineChart
                  data={primarySeries}
                  valueLabel={primaryLabel}
                  color="#8b5cf6"
                  secondaryData={secondarySeries}
                  secondaryColor="#10b981"
                  secondaryLabel={secondaryLabel}
                  height={260}
                  crosshair
                  tooltipStyle="dark"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-neutral-400 text-sm">
                  {visibleSeries.length === 0 ? 'Select at least one series' : 'No data for this period'}
                </div>
              )}
            </div>
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
