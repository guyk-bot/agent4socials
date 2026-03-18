'use client';

import React, { useCallback, useMemo, useState } from 'react';
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

// —— Purple color system (one hue, multiple expressions) ——
const PURPLE = {
  primary: '#7c3aed',      // violet-600, main brand
  strong: '#6d28d9',       // violet-700, highlights / emphasis
  soft: '#a78bfa',        // violet-400, secondary elements
  muted: 'rgba(124, 58, 237, 0.4)',
  bg: 'rgba(124, 58, 237, 0.08)',
  grid: 'rgba(0, 0, 0, 0.018)',
} as const;

export type LineMetricId = 'followers' | 'views' | 'visits';
const LINE_METRIC_IDS: LineMetricId[] = ['followers', 'views', 'visits'];

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

// —— KpiCard (clickable for metric focus) ——
function KpiCard({
  label,
  value,
  trend,
  trendUp,
  tint = 'neutral',
  sparkData,
  primary,
  metricId,
  isActive,
  isPrimary,
  onFocusMetric,
}: {
  label: string;
  value: string | number;
  trend?: string;
  trendUp?: boolean;
  tint?: 'neutral' | 'violet' | 'blue' | 'emerald' | 'slate';
  sparkData?: number[];
  primary?: boolean;
  metricId?: LineMetricId;
  isActive?: boolean;
  isPrimary?: boolean;
  onFocusMetric?: (id: LineMetricId) => void;
}) {
  const isLineMetric = metricId != null;
  const bgTint =
    tint === 'violet'
      ? primary
        ? 'bg-violet-500/[0.07]'
        : 'bg-violet-500/[0.05]'
      : 'bg-neutral-100/90';

  const wrapperClass = [
    'relative rounded-[22px] flex flex-col justify-between shadow-sm border transition-all duration-200',
    isLineMetric ? 'cursor-pointer select-none' : '',
    primary ? 'p-6 min-h-[108px]' : 'p-5 min-h-[100px]',
    isPrimary ? 'border-violet-400/70 ring-1 ring-violet-400/20 shadow-md' : isActive ? 'border-violet-300/50 hover:border-violet-400/60' : primary ? 'border-violet-200/50 hover:border-violet-300/60' : 'border-neutral-200/60 hover:border-neutral-300/70',
    'hover:shadow-md',
    bgTint,
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {trend != null && (
        <span
          className={`absolute top-4 right-4 text-xs font-medium ${
            trendUp ? 'text-violet-600' : trend === '0' ? 'text-neutral-500' : 'text-rose-500/90'
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
        <div className={`mt-3 h-8 -mb-1 ${tint === 'violet' ? 'opacity-70' : 'opacity-40'}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sparkData.map((value, index) => ({ value, index }))}
              margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
            >
              {tint === 'violet' && (
                <defs>
                  <linearGradient id="kpiSparkGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor={PURPLE.primary} stopOpacity={0.1} />
                    <stop offset="100%" stopColor={PURPLE.soft} stopOpacity={0.4} />
                  </linearGradient>
                </defs>
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill={tint === 'violet' ? 'url(#kpiSparkGrad)' : 'currentColor'}
                fillOpacity={tint === 'violet' ? 1 : 0.2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  if (isLineMetric && metricId != null && onFocusMetric) {
    return (
      <button type="button" className={wrapperClass} onClick={() => onFocusMetric(metricId)}>
        {content}
      </button>
    );
  }
  return <div className={wrapperClass}>{content}</div>;
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

// Line metric colors (aligned with KPI card tints)
const METRIC_COLORS: Record<LineMetricId, { stroke: string; fill: string }> = {
  followers: { stroke: PURPLE.primary, fill: PURPLE.soft },
  views: { stroke: '#2563eb', fill: '#93c5fd' },
  visits: { stroke: '#059669', fill: '#6ee7b7' },
};

function formatYAxisValue(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

// —— FollowersGrowthChart ——
// KPI-driven focus: only active metrics shown; primary gets full opacity + area; dual Y-axis for scale.
function FollowersGrowthChart({
  data,
  hoveredDate,
  onDateHover,
  activeMetrics,
  primaryFocus,
}: {
  data: GrowthDataPoint[];
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
  activeMetrics: Set<LineMetricId>;
  primaryFocus: LineMetricId;
}) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      gained: i > 0 ? Math.max(0, d.followers - data[i - 1].followers) : d.followers,
    }));
  }, [data]);

  const leftMetricIds = useMemo(() => LINE_METRIC_IDS.filter((id) => id !== 'views' && activeMetrics.has(id)), [activeMetrics]);
  const hasViews = activeMetrics.has('views');

  const leftDomain = useMemo((): [number, number] => {
    if (leftMetricIds.length === 0) return [0, 10];
    let max = 0;
    for (const id of leftMetricIds) {
      const key = id as keyof GrowthDataPoint;
      const vals = chartData.map((d) => Number(d[key]) ?? 0);
      max = Math.max(max, ...vals);
    }
    const min = 0;
    const offset = max <= 1 ? 0.5 : Math.min(0.5, max * 0.08);
    return [min, max + offset];
  }, [chartData, leftMetricIds]);

  const rightDomain = useMemo((): [number, number] => {
    if (!hasViews) return [0, 10];
    const vals = chartData.map((d) => d.views ?? 0);
    const max = Math.max(...vals, 0);
    const min = 0;
    const offset = max <= 1 ? 0.5 : Math.min(0.5, max * 0.08);
    return [min, max + offset];
  }, [chartData, hasViews]);

  const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : null;

  return (
    <div className="rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
      <p className="text-xs text-neutral-400 mb-3">Track how your audience grew over time. Click KPI cards to focus metrics.</p>
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 12, right: hasViews ? 44 : 12, left: 4, bottom: 4 }}
            onMouseMove={(e) => {
              const payload = (e as unknown as { activePayload?: Array<{ payload?: { date?: string } }> }).activePayload;
              const date = payload?.[0]?.payload?.date;
              onDateHover(date ?? null);
            }}
            onMouseLeave={() => onDateHover(null)}
          >
            <defs>
              <linearGradient id="followersLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURPLE.strong} stopOpacity={1} />
                <stop offset="100%" stopColor={PURPLE.primary} stopOpacity={0.75} />
              </linearGradient>
              <linearGradient id="followersAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PURPLE.soft} stopOpacity={0.09} />
                <stop offset="100%" stopColor={PURPLE.primary} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="viewsLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d4ed8" stopOpacity={1} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0.85} />
              </linearGradient>
              <linearGradient id="viewsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#93c5fd" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#2563eb" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="visitsLineGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#047857" stopOpacity={1} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
              </linearGradient>
              <linearGradient id="visitsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6ee7b7" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={PURPLE.grid} vertical={false} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke={PURPLE.muted} strokeWidth={1} strokeDasharray="4 3" />
            )}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#737373' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
            />
            {(leftMetricIds.length > 0 || !hasViews) && (
              <YAxis
                yAxisId="left"
                domain={leftDomain}
                tick={{ fontSize: 11, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickFormatter={formatYAxisValue}
              />
            )}
            {hasViews && (
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={rightDomain}
                tick={{ fontSize: 11, fill: '#737373' }}
                axisLine={false}
                tickLine={false}
                width={36}
                tickFormatter={formatYAxisValue}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !labelStr) return null;
                const point = chartData.find((d) => d.date === labelStr);
                const activePayloads = (payload ?? []).filter((p) => p.dataKey && activeMetrics.has(p.dataKey as LineMetricId));
                if (activePayloads.length === 0) return null;
                const metricLabels: Record<LineMetricId, string> = { followers: 'Followers', views: 'Views', visits: 'Page visits' };
                return (
                  <div className="rounded-lg bg-white text-neutral-900 px-3 py-2 shadow-md border border-neutral-200/50 text-left min-w-[140px]">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    {activePayloads.map((p) => {
                      const id = p.dataKey as LineMetricId;
                      const value = (p.value as number) ?? 0;
                      const isPrimary = id === primaryFocus;
                      return (
                        <p key={id} className={`mt-0.5 text-sm ${isPrimary ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>
                          <span className="text-neutral-500">{metricLabels[id]}: </span>
                          <span className="tabular-nums" style={{ color: METRIC_COLORS[id].stroke }}>{formatYAxisValue(value)}</span>
                        </p>
                      );
                    })}
                    {point != null && primaryFocus === 'followers' && (
                      <p className="text-neutral-400 text-xs mt-0.5">+{point.gained} that day</p>
                    )}
                  </div>
                );
              }}
              cursor={{ stroke: PURPLE.muted, strokeWidth: 1, strokeDasharray: '4 2' }}
            />
            {LINE_METRIC_IDS.map((id) => {
              if (!activeMetrics.has(id)) return null;
              const isPrimary = id === primaryFocus;
              const opacity = isPrimary ? 1 : 0.38;
              const strokeWidth = isPrimary ? 2.8 : 1.5;
              const yAxisId = id === 'views' ? 'right' : 'left';
              const strokeGrad = id === 'followers' ? 'url(#followersLineGrad)' : id === 'views' ? 'url(#viewsLineGrad)' : 'url(#visitsLineGrad)';
              const areaGrad = id === 'followers' ? 'url(#followersAreaGrad)' : id === 'views' ? 'url(#viewsAreaGrad)' : 'url(#visitsAreaGrad)';
              const color = METRIC_COLORS[id];
              return (
                <React.Fragment key={id}>
                  {isPrimary && (
                    <Area type="monotone" dataKey={id} fill={areaGrad} stroke="none" yAxisId={yAxisId} isAnimationActive />
                  )}
                  <Line
                    type="stepAfter"
                    dataKey={id}
                    yAxisId={yAxisId}
                    stroke={strokeGrad}
                    strokeWidth={strokeWidth}
                    strokeOpacity={opacity}
                    dot={({ cx, cy, payload: p }) =>
                      p.date === lastDate && isPrimary ? (
                        <g key={p.date}>
                          <circle cx={cx} cy={cy} r={7} fill={color.stroke} fillOpacity={0.22} />
                          <circle cx={cx} cy={cy} r={4.5} fill={color.stroke} stroke="#fff" strokeWidth={1.5} />
                        </g>
                      ) : (
                        <circle key={p.date} cx={cx} cy={cy} r={2} fill={color.stroke} fillOpacity={isPrimary ? 0.85 : 0.5} />
                      )
                    }
                    activeDot={{ r: 5, fill: color.stroke, stroke: '#fff', strokeWidth: 1.5 }}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    connectNulls
                    isAnimationActive
                    animationDuration={300}
                  />
                </React.Fragment>
              );
            })}
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
              <linearGradient id="contentBarGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={PURPLE.soft} stopOpacity={0.7} />
                <stop offset="100%" stopColor={PURPLE.soft} stopOpacity={0.95} />
              </linearGradient>
              <linearGradient id="contentBarGradMax" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={PURPLE.primary} stopOpacity={0.85} />
                <stop offset="100%" stopColor={PURPLE.strong} stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={PURPLE.grid} vertical={false} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke={PURPLE.muted} strokeWidth={1} strokeDasharray="4 3" />
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
                const value = (payload[0]?.value as number) ?? 0;
                return (
                  <div className="rounded-lg bg-white text-neutral-900 px-3 py-2 shadow-md border border-neutral-200/50 text-left min-w-[130px]">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="mt-0.5 text-sm">
                      <span className="text-neutral-500">Posts: </span>
                      <span className="font-semibold text-violet-600 tabular-nums">{value}</span>
                    </p>
                  </div>
                );
              }}
              cursor={false}
            />
            <Bar dataKey="posts" fill="url(#contentBarGrad)" radius={[6, 6, 0, 0]} barSize={17} maxBarSize={32}>
              {data.map((entry, index) => {
                const isMax = entry.date === maxPostsDate && maxPosts > 0;
                const isHovered = entry.date === hoveredDate;
                const fill =
                  isHovered ? PURPLE.primary : isMax ? 'url(#contentBarGradMax)' : 'url(#contentBarGrad)';
                const fillOpacity = isHovered ? 1 : isMax ? 1 : 0.72;
                return (
                  <Cell
                    key={entry.date + index}
                    fill={fill}
                    fillOpacity={fillOpacity}
                    stroke={isHovered ? PURPLE.primary : undefined}
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
  const [activeMetrics, setActiveMetrics] = useState<Set<LineMetricId>>(() => new Set(['followers']));
  const [primaryFocus, setPrimaryFocus] = useState<LineMetricId>('followers');

  const handleFocusMetric = useCallback((id: LineMetricId) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
        setPrimaryFocus((p) => (p === id ? LINE_METRIC_IDS.find((m) => next.has(m)) ?? p : p));
        return next;
      }
      next.add(id);
      setPrimaryFocus(id);
      return next;
    });
  }, []);

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
            metricId="followers"
            isActive={activeMetrics.has('followers')}
            isPrimary={primaryFocus === 'followers'}
            onFocusMetric={handleFocusMetric}
          />
          <KpiCard
            label="Views"
            value={stats.views}
            trend={stats.views > 0 ? undefined : undefined}
            tint="blue"
            sparkData={stats.viewsSpark}
            metricId="views"
            isActive={activeMetrics.has('views')}
            isPrimary={primaryFocus === 'views'}
            onFocusMetric={handleFocusMetric}
          />
          <KpiCard
            label="Page visits"
            value={stats.visits}
            tint="emerald"
            sparkData={stats.visitsSpark}
            metricId="visits"
            isActive={activeMetrics.has('visits')}
            isPrimary={primaryFocus === 'visits'}
            onFocusMetric={handleFocusMetric}
          />
          <KpiCard label="Total content" value={stats.totalContent} tint="slate" />
        </div>

        {/* Main chart: Followers growth (KPI-driven focus) */}
        <FollowersGrowthChart
          data={data}
          hoveredDate={hoveredDate}
          onDateHover={setHoveredDate}
          activeMetrics={activeMetrics}
          primaryFocus={primaryFocus}
        />

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
