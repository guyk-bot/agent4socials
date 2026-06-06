'use client';

import React, { useMemo, useState } from 'react';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import { formatMetricNumber } from '@/lib/metric-format';

import type { ReportSnapshotArtifact } from '@/lib/ai/aysop-artifacts';

export type { ReportSnapshotArtifact };

type MetricKey = 'followers' | 'views' | 'engagement';

const METRIC_META: Record<
  MetricKey,
  { label: string; kpiKey: keyof ReportSnapshotArtifact['kpis']; color: string; seriesKey: keyof ReportSnapshotArtifact['chartSeries'] }
> = {
  followers: { label: 'New Followers', kpiKey: 'newFollowers', color: '#34d399', seriesKey: 'followers' },
  views: { label: 'Views', kpiKey: 'views', color: '#fbbf24', seriesKey: 'views' },
  engagement: { label: 'Engagement', kpiKey: 'engagement', color: '#f87171', seriesKey: 'engagement' },
};

function formatRange(range: { start: string; end: string }) {
  return `${range.start} to ${range.end}`;
}

export function AysopAnalyticsReportCard({ report }: { report: ReportSnapshotArtifact }) {
  const [active, setActive] = useState<MetricKey>('views');
  const meta = METRIC_META[active];
  const chartData = report.chartSeries[meta.seriesKey] ?? [];

  const hasChartData = useMemo(() => chartData.some((p) => p.value > 0), [chartData]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-neutral-100 bg-neutral-50">
        <p className="font-semibold text-neutral-900">
          {report.platformLabel}
          {report.username ? ` @${report.username}` : ''}
        </p>
        <p className="text-xs text-neutral-500 mt-0.5">{formatRange(report.dateRange)}</p>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
        {(Object.keys(METRIC_META) as MetricKey[]).map((key) => {
          const m = METRIC_META[key];
          const selected = active === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActive(key)}
              className={`rounded-xl border px-2 py-2 text-left transition-colors ${
                selected ? 'border-[var(--primary)] bg-[#E8F4FF]/60' : 'border-neutral-200 bg-neutral-50 hover:border-neutral-300'
              }`}
            >
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">{m.label}</p>
              <p className="text-base font-bold text-neutral-900">
                {formatMetricNumber(Number(report.kpis[m.kpiKey] ?? 0))}
              </p>
            </button>
          );
        })}
      </div>

      <div className="px-3 pb-3">
        {hasChartData ? (
          <InteractiveLineChart
            data={chartData}
            color={meta.color}
            height={200}
            valueLabel={meta.label}
            crosshair
            tooltipStyle="light"
          />
        ) : (
          <div className="h-[200px] flex items-center justify-center text-sm text-neutral-400 rounded-lg border border-dashed border-neutral-200">
            No chart data for this period yet. Sync posts on the Dashboard.
          </div>
        )}
        <p className="text-[11px] text-neutral-400 mt-2">
          Followers total: {formatMetricNumber(report.kpis.followers)} · Posts in range: {report.kpis.posts}
        </p>
        {report.insightsHint ? (
          <p className="text-[11px] text-amber-700 mt-1">{report.insightsHint}</p>
        ) : null}
      </div>
    </div>
  );
}
