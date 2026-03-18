'use client';

import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ComposedChart,
} from 'recharts';

export type GrowthDataPoint = {
  date: string;
  followers: number;
  posts: number;
  views: number;
  visits: number;
};

const SAMPLE_GROWTH_DATA: GrowthDataPoint[] = [
  { date: '2026-02-18', followers: 0, posts: 0, views: 8, visits: 1 },
  { date: '2026-02-19', followers: 0, posts: 0, views: 5, visits: 0 },
  { date: '2026-02-20', followers: 0, posts: 0, views: 4, visits: 1 },
  { date: '2026-02-21', followers: 0, posts: 0, views: 9, visits: 1 },
  { date: '2026-02-22', followers: 0, posts: 1, views: 10, visits: 0 },
  { date: '2026-02-23', followers: 0, posts: 0, views: 7, visits: 1 },
  { date: '2026-02-24', followers: 0, posts: 1, views: 11, visits: 0 },
  { date: '2026-02-25', followers: 0, posts: 0, views: 8, visits: 0 },
  { date: '2026-02-26', followers: 1, posts: 1, views: 12, visits: 1 },
  { date: '2026-02-27', followers: 1, posts: 0, views: 9, visits: 1 },
  { date: '2026-02-28', followers: 1, posts: 1, views: 13, visits: 0 },
  { date: '2026-03-01', followers: 1, posts: 0, views: 8, visits: 1 },
  { date: '2026-03-02', followers: 1, posts: 2, views: 14, visits: 2 },
  { date: '2026-03-03', followers: 1, posts: 0, views: 10, visits: 1 },
  { date: '2026-03-04', followers: 1, posts: 0, views: 9, visits: 0 },
  { date: '2026-03-05', followers: 1, posts: 1, views: 11, visits: 1 },
  { date: '2026-03-06', followers: 1, posts: 0, views: 8, visits: 0 },
  { date: '2026-03-07', followers: 1, posts: 0, views: 9, visits: 1 },
  { date: '2026-03-08', followers: 2, posts: 0, views: 15, visits: 1 },
  { date: '2026-03-09', followers: 2, posts: 0, views: 14, visits: 1 },
  { date: '2026-03-10', followers: 2, posts: 0, views: 13, visits: 0 },
  { date: '2026-03-11', followers: 2, posts: 0, views: 12, visits: 1 },
  { date: '2026-03-12', followers: 2, posts: 0, views: 11, visits: 0 },
  { date: '2026-03-13', followers: 2, posts: 0, views: 12, visits: 1 },
  { date: '2026-03-14', followers: 2, posts: 0, views: 13, visits: 0 },
  { date: '2026-03-15', followers: 2, posts: 0, views: 11, visits: 0 },
];

function formatDate(str: string) {
  return new Date(str + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateShort(str: string) {
  return new Date(str + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// —— KpiCard ——
function KpiCard({
  label,
  value,
  trend,
  trendUp,
  tint = 'neutral',
  sparkData,
}: {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  tint?: 'neutral' | 'violet' | 'blue' | 'emerald' | 'slate';
  sparkData?: number[];
}) {
  const bgTint =
    tint === 'violet'
      ? 'bg-violet-500/[0.06]'
      : tint === 'blue'
        ? 'bg-blue-500/[0.06]'
        : tint === 'emerald'
          ? 'bg-emerald-500/[0.06]'
          : tint === 'slate'
            ? 'bg-slate-500/[0.06]'
            : 'bg-neutral-100/80';

  return (
    <div
      className={`relative rounded-[22px] p-5 min-h-[100px] flex flex-col justify-between shadow-sm border border-neutral-100/80 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200 ${bgTint}`}
    >
      {trend != null && (
        <span
          className={`absolute top-4 right-4 text-xs font-medium ${
            trendUp ? 'text-emerald-600' : trend === '0' ? 'text-neutral-500' : 'text-rose-600'
          }`}
        >
          {trend}
        </span>
      )}
      <div className="flex-1">
        <p className="text-2xl md:text-3xl font-semibold text-neutral-900 tracking-tight tabular-nums">{value}</p>
        <p className="text-sm text-neutral-500 mt-1">{label}</p>
      </div>
      {sparkData != null && sparkData.length > 1 && (
        <div className="mt-3 h-8 -mb-1 opacity-50">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sparkData.map((value, index) => ({ value, index }))}
              margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
            >
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill="currentColor"
                fillOpacity={0.25}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// —— SummaryStatCard ——
function SummaryStatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-neutral-50/90 border border-neutral-100 px-4 py-3.5 hover:bg-neutral-50 hover:border-neutral-200/80 transition-colors">
      <p className="text-lg font-semibold text-neutral-800 tabular-nums">{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

// —— FollowersGrowthChart ——
function FollowersGrowthChart({ data }: { data: GrowthDataPoint[] }) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      gained: i > 0 ? Math.max(0, d.followers - data[i - 1].followers) : d.followers,
    }));
  }, [data]);

  return (
    <div className="rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
      <p className="text-xs text-neutral-400 mb-4">Track how your audience grew over time.</p>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              width={28}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !payload?.length || !labelStr) return null;
                const point = chartData.find((d) => d.date === labelStr);
                return (
                  <div className="rounded-xl bg-neutral-800 text-white px-3 py-2.5 shadow-lg border border-neutral-700/50 text-left min-w-[140px]">
                    <p className="text-neutral-300 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="text-white font-semibold mt-1">Followers: {(payload[0]?.value as number) ?? 0}</p>
                    {point != null && (
                      <p className="text-neutral-400 text-xs mt-0.5">+{point.gained} that day</p>
                    )}
                  </div>
                );
              }}
              cursor={{ stroke: '#a3a3a3', strokeWidth: 1, strokeDasharray: '4 2' }}
            />
            <Line
              type="monotone"
              dataKey="followers"
              stroke="#7c3aed"
              strokeWidth={2}
              dot={{ fill: '#7c3aed', strokeWidth: 0, r: 3 }}
              activeDot={{ r: 5, fill: '#7c3aed', stroke: '#fff', strokeWidth: 2 }}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// —— ContentActivityChart ——
function ContentActivityChart({ data }: { data: GrowthDataPoint[] }) {
  return (
    <div className="rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
      <h3 className="text-sm font-semibold text-neutral-800">Content activity</h3>
      <p className="text-xs text-neutral-400 mt-0.5 mb-4">See how publishing frequency aligns with account growth.</p>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              width={24}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !payload?.length || !labelStr) return null;
                return (
                  <div className="rounded-xl bg-neutral-800 text-white px-3 py-2.5 shadow-lg border border-neutral-700/50 text-left">
                    <p className="text-neutral-300 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="text-white font-semibold mt-1">Posts: {(payload[0]?.value as number) ?? 0}</p>
                  </div>
                );
              }}
              cursor={{ fill: 'rgba(0,0,0,0.04)' }}
            />
            <Bar
              dataKey="posts"
              fill="#8b5cf6"
              fillOpacity={0.85}
              radius={[4, 4, 0, 0]}
              barSize={12}
              maxBarSize={24}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// —— OverviewGrowthSection ——
export interface OverviewGrowthSectionProps {
  data?: GrowthDataPoint[];
  dateRange?: { start: string; end: string };
  onDateRangeChange?: (range: { start: string; end: string }) => void;
  onExport?: () => void;
}

export function OverviewGrowthSection({
  data = SAMPLE_GROWTH_DATA,
  dateRange,
  onDateRangeChange,
  onExport,
}: OverviewGrowthSectionProps) {
  const stats = useMemo(() => {
    const last = data[data.length - 1];
    const first = data[0];
    const totalViews = data.reduce((s, d) => s + d.views, 0);
    const totalVisits = data.reduce((s, d) => s + d.visits, 0);
    const totalPosts = data.reduce((s, d) => s + d.posts, 0);
    const days = data.length;
    const followersGain = last ? last.followers - (first?.followers ?? 0) : 0;
    const avgDailyFollowers = days > 0 && followersGain >= 0 ? (followersGain / days).toFixed(2) : '—';
    const dailyPageViews = days > 0 ? (totalViews / days).toFixed(2) : '0';
    const dailyPosts = days > 0 ? (totalPosts / days).toFixed(2) : '0';
    const postsPerWeek = days > 0 ? (totalPosts / (days / 7)).toFixed(2) : '0';

    return {
      followers: last?.followers ?? 0,
      followersTrend: followersGain > 0 ? `+${followersGain}` : followersGain < 0 ? String(followersGain) : '0',
      followersTrendUp: followersGain > 0,
      views: totalViews,
      visits: totalVisits,
      totalContent: totalPosts,
      avgDailyFollowers,
      dailyPageViews,
      dailyPosts,
      postsPerWeek,
      viewsSpark: data.map((d) => d.views),
      visitsSpark: data.map((d) => d.visits),
    };
  }, [data]);

  return (
    <section className="rounded-[24px] bg-white/80 border border-neutral-100 shadow-sm overflow-hidden">
      <div className="p-6 md:p-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-semibold text-neutral-900 tracking-tight">Growth</h2>
          <div className="flex items-center gap-2">
            {dateRange && onDateRangeChange && (
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => onDateRangeChange({ ...dateRange, start: e.target.value })}
                className="text-sm border border-neutral-200 rounded-lg px-3 py-2 text-neutral-700 bg-white focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500"
              />
            )}
            {onExport && (
              <button
                type="button"
                onClick={onExport}
                className="text-sm font-medium text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-lg hover:bg-neutral-100 transition-colors"
              >
                Export
              </button>
            )}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Followers"
            value={stats.followers}
            trend={stats.followersTrend}
            trendUp={stats.followersTrendUp}
            tint="violet"
          />
          <KpiCard
            label="Views"
            value={stats.views}
            trend={stats.views > 0 ? undefined : undefined}
            tint="blue"
            sparkData={stats.viewsSpark}
          />
          <KpiCard label="Page visits" value={stats.visits} tint="emerald" sparkData={stats.visitsSpark} />
          <KpiCard label="Total content" value={stats.totalContent} tint="slate" />
        </div>

        {/* Main chart: Followers growth */}
        <FollowersGrowthChart data={data} />

        {/* Secondary chart: Content activity */}
        <ContentActivityChart data={data} />

        {/* Bottom summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStatCard label="Average daily new followers" value={stats.avgDailyFollowers} />
          <SummaryStatCard label="Daily page views" value={stats.dailyPageViews} />
          <SummaryStatCard label="Daily posts" value={stats.dailyPosts} />
          <SummaryStatCard label="Posts per week" value={stats.postsPerWeek} />
        </div>
      </div>
    </section>
  );
}
