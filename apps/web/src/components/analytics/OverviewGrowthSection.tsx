'use client';

import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Area,
  ComposedChart,
  ReferenceLine,
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
  primary,
}: {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  tint?: 'neutral' | 'violet' | 'blue' | 'emerald' | 'slate';
  sparkData?: number[];
  primary?: boolean;
}) {
  const bgTint =
    tint === 'violet'
      ? primary
        ? 'bg-violet-500/[0.1]'
        : 'bg-violet-500/[0.06]'
      : tint === 'blue'
        ? 'bg-blue-500/[0.05]'
        : tint === 'emerald'
          ? 'bg-emerald-500/[0.05]'
          : tint === 'slate'
            ? 'bg-slate-500/[0.05]'
            : 'bg-neutral-100/80';

  return (
    <div
      className={`relative rounded-[22px] flex flex-col justify-between shadow-sm border transition-all duration-200 ${primary ? 'p-6 min-h-[108px] border-violet-200/60 hover:border-violet-300/80' : 'p-5 min-h-[100px] border-neutral-100/80 hover:border-neutral-200/80'} hover:shadow-md ${bgTint}`}
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
        <p className={`font-semibold text-neutral-900 tracking-tight tabular-nums ${primary ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}>{value}</p>
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
    <div className="rounded-xl bg-neutral-50/60 border border-neutral-100/80 px-4 py-3 hover:bg-neutral-50/80 hover:border-neutral-200/60 transition-colors">
      <p className="text-base font-semibold text-neutral-700 tabular-nums">{value}</p>
      <p className="text-xs text-neutral-500 mt-0.5">{label}</p>
    </div>
  );
}

// —— FollowersGrowthChart ——
// Dates come from the data: when using real API data they are from insights.followersTimeSeries / impressionsTimeSeries / post dates; with sample data they are the fixed sample dates.
function FollowersGrowthChart({
  data,
  hoveredDate,
  onDateHover,
}: {
  data: GrowthDataPoint[];
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
}) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      gained: i > 0 ? Math.max(0, d.followers - data[i - 1].followers) : d.followers,
    }));
  }, [data]);

  const yDomain = useMemo(() => {
    const vals = chartData.map((d) => d.followers);
    const max = Math.max(...vals, 0);
    const min = 0;
    const offset = max <= 1 ? 0.5 : Math.min(0.5, max * 0.08);
    return [min, max + offset];
  }, [chartData]);

  const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : null;

  return (
    <div className="rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
      <p className="text-xs text-neutral-400 mb-3">Track how your audience grew over time.</p>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
            onMouseMove={(e) => {
              const payload = (e as unknown as { activePayload?: Array<{ payload?: { date?: string } }> }).activePayload;
              const date = payload?.[0]?.payload?.date;
              onDateHover(date ?? null);
            }}
            onMouseLeave={() => onDateHover(null)}
          >
            <defs>
              <linearGradient id="followersLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.75} />
              </linearGradient>
              <linearGradient id="followersAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.08} />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.02)" vertical={false} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 3" opacity={0.8} />
            )}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
            />
            <YAxis
              domain={yDomain as [number, number]}
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
                  <div className="rounded-lg bg-white/98 text-neutral-900 px-3 py-2 shadow-lg border border-neutral-200/60 text-left min-w-[140px] ring-1 ring-neutral-900/5">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="text-neutral-900 font-semibold mt-0.5 text-sm">Followers: {(payload[0]?.value as number) ?? 0}</p>
                    {point != null && (
                      <p className="text-neutral-500 text-xs mt-0.5">+{point.gained} that day</p>
                    )}
                  </div>
                );
              }}
              cursor={{ stroke: '#a78bfa', strokeWidth: 1, strokeDasharray: '4 2', strokeOpacity: 0.6 }}
            />
            <Area type="monotone" dataKey="followers" fill="url(#followersAreaGrad)" stroke="none" />
            <Line
              type="stepAfter"
              dataKey="followers"
              stroke="url(#followersLineGrad)"
              strokeWidth={2.8}
              dot={({ cx, cy, payload }) =>
                payload.date === lastDate ? (
                  <g key={payload.date}>
                    <circle cx={cx} cy={cy} r={7} fill="#7c3aed" fillOpacity={0.2} />
                    <circle cx={cx} cy={cy} r={4.5} fill="#7c3aed" stroke="#fff" strokeWidth={1.5} />
                  </g>
                ) : (
                  <circle key={payload.date} cx={cx} cy={cy} r={2} fill="#7c3aed" fillOpacity={0.9} />
                )
              }
              activeDot={{ r: 5, fill: '#7c3aed', stroke: '#fff', strokeWidth: 1.5 }}
              strokeLinecap="round"
              strokeLinejoin="round"
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// —— ContentActivityChart ——
function ContentActivityChart({
  data,
  hoveredDate,
  onDateHover,
}: {
  data: GrowthDataPoint[];
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
}) {
  const maxPosts = useMemo(() => Math.max(...data.map((d) => d.posts), 0), [data]);
  const maxPostsDate = useMemo(
    () => (maxPosts > 0 ? data.find((d) => d.posts === maxPosts)?.date : null),
    [data, maxPosts]
  );

  return (
    <div className="rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
      <h3 className="text-sm font-semibold text-neutral-800">Content activity</h3>
      <p className="text-xs text-neutral-400 mt-0.5 mb-3">See how publishing frequency aligns with account growth.</p>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 12, right: 12, left: 4, bottom: 4 }}
            onMouseMove={(e) => {
              const payload = (e as unknown as { activePayload?: Array<{ payload?: { date?: string } }> }).activePayload;
              const date = payload?.[0]?.payload?.date;
              onDateHover(date ?? null);
            }}
            onMouseLeave={() => onDateHover(null)}
          >
            <defs>
              <linearGradient id="contentBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.95} />
                <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.85} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.02)" vertical={false} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke="#a78bfa" strokeWidth={1} strokeDasharray="4 3" opacity={0.6} />
            )}
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
                  <div className="rounded-lg bg-white/98 text-neutral-900 px-3 py-2 shadow-lg border border-neutral-200/60 text-left min-w-[130px] ring-1 ring-neutral-900/5">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="text-neutral-900 font-semibold mt-0.5 text-sm">Posts: {(payload[0]?.value as number) ?? 0}</p>
                  </div>
                );
              }}
              cursor={false}
            />
            <Bar dataKey="posts" fill="url(#contentBarGrad)" radius={[6, 6, 0, 0]} barSize={17} maxBarSize={32}>
              {data.map((entry, index) => {
                const isMax = entry.date === maxPostsDate && maxPosts > 0;
                const isHovered = entry.date === hoveredDate;
                return (
                  <Cell
                    key={entry.date + index}
                    fill={isMax ? '#7c3aed' : 'url(#contentBarGrad)'}
                    fillOpacity={isHovered ? 1 : isMax ? 1 : 0.88}
                    stroke={isHovered ? '#7c3aed' : undefined}
                    strokeWidth={isHovered ? 1.5 : 0}
                  />
                );
              })}
            </Bar>
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
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

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
            primary
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
        <FollowersGrowthChart data={data} hoveredDate={hoveredDate} onDateHover={setHoveredDate} />

        {/* Secondary chart: Content activity */}
        <ContentActivityChart data={data} hoveredDate={hoveredDate} onDateHover={setHoveredDate} />

        {/* Bottom summary cards */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Averages</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryStatCard label="Average daily new followers" value={stats.avgDailyFollowers} />
            <SummaryStatCard label="Daily page views" value={stats.dailyPageViews} />
            <SummaryStatCard label="Daily posts" value={stats.dailyPosts} />
            <SummaryStatCard label="Posts per week" value={stats.postsPerWeek} />
          </div>
        </div>
      </div>
    </section>
  );
}
