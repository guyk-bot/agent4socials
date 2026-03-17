'use client';

import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type { FacebookInsights, FacebookPost } from './types';

interface FacebookOverviewTabProps {
  insights: FacebookInsights | null;
  posts: FacebookPost[];
  dateRange: { start: string; end: string };
  loading: boolean;
  onUpgrade?: () => void;
  followersLabel?: string;
}

export function FacebookOverviewTab({
  insights,
  posts,
  dateRange,
  loading,
  onUpgrade,
  followersLabel = 'Followers',
}: FacebookOverviewTabProps) {
  const start = dateRange.start ? new Date(dateRange.start) : null;
  const end = dateRange.end ? new Date(dateRange.end) : null;
  const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;

  const followers = insights?.followers ?? 0;
  const reach = insights?.reachTotal ?? 0;
  const impressions = insights?.impressionsTotal ?? 0;
  const impressionsSeries = insights?.impressionsTimeSeries ?? [];
  const chartData = useMemo(() => {
    const byDate: Record<string, { impressions: number; posts: number }> = {};
    impressionsSeries.forEach((d) => {
      byDate[d.date] = { impressions: d.value, posts: byDate[d.date]?.posts ?? 0 };
    });
    posts.forEach((p) => {
      const d = p.publishedAt.slice(0, 10);
      if (!byDate[d]) byDate[d] = { impressions: 0, posts: 0 };
      byDate[d].posts += 1;
    });
    const dates = new Set([...Object.keys(byDate), ...impressionsSeries.map((x) => x.date)]);
    return Array.from(dates)
      .sort()
      .map((date) => ({
        date,
        impressions: byDate[date]?.impressions ?? 0,
        posts: byDate[date]?.posts ?? 0,
      }));
  }, [impressionsSeries, posts]);

  const totalInteractions = posts.reduce((s, p) => s + (p.interactions ?? 0), 0);
  const showWatermark = days > 30;

  if (loading) {
    return (
      <div className="min-h-[420px] animate-pulse">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-40 rounded-lg bg-neutral-100" />
          <div className="h-9 w-48 rounded-lg bg-neutral-100" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-2xl bg-neutral-100" />
          ))}
        </div>
        <div className="h-[320px] rounded-2xl bg-neutral-100" />
      </div>
    );
  }

  return (
    <div className="max-w-full" style={{ maxWidth: 1200 }}>
      {/* Top upgrade CTA: button first, then message */}
      <div className="mb-6 rounded-xl border border-[#5ff6fd]/30 bg-gradient-to-r from-[#5ff6fd]/10 to-[#df44dc]/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <button
          type="button"
          onClick={() => (onUpgrade ? onUpgrade() : window.location.assign('/pricing'))}
          className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-[#5ff6fd] to-[#df44dc] text-neutral-900 font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Upgrade
        </button>
        <p className="text-sm text-neutral-700">
          Upgrade to view more than 30 days of analytics and export reports without watermarks.
        </p>
      </div>

      {/* Reminder when date range &gt; 30 days */}
      {showWatermark && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="button"
            onClick={() => (onUpgrade ? onUpgrade() : window.location.assign('/pricing'))}
            className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg bg-gradient-to-r from-[#5ff6fd] to-[#df44dc] text-neutral-900 font-semibold text-sm hover:opacity-90 transition-opacity"
          >
            Upgrade
          </button>
          <p className="text-sm text-amber-800">
            You are viewing more than 30 days. Upgrade to remove watermarks and access full history.
          </p>
        </div>
      )}

      {/* Header: title + time range selector (visual only for now; range comes from dashboard) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">
          Page analytics
        </h1>
        <div className="inline-flex p-1 rounded-lg bg-neutral-100 border border-neutral-200/80">
          <span className="px-3 py-1.5 text-sm font-medium text-neutral-900 bg-white rounded-md shadow-sm border border-neutral-200/80">
            Day
          </span>
          <span className="px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700">
            Week
          </span>
          <span className="px-3 py-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-700">
            Year
          </span>
        </div>
      </div>

      {/* Key metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">{followersLabel}</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">{followers.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Reach</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">{reach.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Impressions</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">{impressions.toLocaleString()}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-1">Posts</p>
          <p className="text-2xl font-bold text-neutral-900 tabular-nums">{posts.length.toLocaleString()}</p>
        </div>
      </div>

      {/* Main chart: Impressions & Posts (reference-style bar chart) */}
      <div className="rounded-2xl border border-neutral-200/80 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Impressions & Posts</h2>
        <p className="text-sm text-neutral-500 mb-6">
          {start && end
            ? `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
            : 'Select a date range'}
        </p>
        <div className="h-[320px] w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 12, right: 24, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.1)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => new Date(v).toLocaleDateString(undefined, { weekday: 'short' })}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12, fill: '#6b7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length || !label) return null;
                    return (
                      <div className="bg-neutral-900 text-white text-xs rounded-lg px-3 py-2.5 shadow-xl border border-neutral-700">
                        <p className="text-neutral-300 font-medium mb-1.5">
                          {new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                        </p>
                        {payload.map((p) => (
                          <p key={p.name} className="flex items-center gap-2">
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: p.color }}
                            />
                            {p.name}: {(p.value as number)?.toLocaleString() ?? 0}
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ paddingTop: 8 }}
                  formatter={(value) => <span className="text-sm text-neutral-600">{value}</span>}
                />
                <Bar
                  yAxisId="left"
                  dataKey="impressions"
                  name="Impressions"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                  isAnimationActive
                  animationDuration={400}
                />
                <Bar
                  yAxisId="right"
                  dataKey="posts"
                  name="Posts"
                  fill="#5ff6fd"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                  isAnimationActive
                  animationDuration={400}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-neutral-400">
              <p className="text-sm font-medium">No chart data for this period</p>
              <p className="text-xs mt-1">Connect your Page and post content to see reach and impressions.</p>
            </div>
          )}
        </div>
      </div>

      {/* Engagement summary line */}
      <div className="mt-8 rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-3">Engagement</h2>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Total interactions</p>
            <p className="text-xl font-bold text-neutral-900 tabular-nums mt-0.5">{totalInteractions.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Avg per post</p>
            <p className="text-xl font-bold text-neutral-900 tabular-nums mt-0.5">
              {posts.length ? Math.round(totalInteractions / posts.length).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
