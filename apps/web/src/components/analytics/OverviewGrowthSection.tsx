'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import {
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
export type ChartMetricId = LineMetricId | 'posts';
const LINE_METRIC_IDS: LineMetricId[] = ['followers', 'views', 'visits'];
const CHART_METRIC_IDS: ChartMetricId[] = ['followers', 'views', 'visits', 'posts'];

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

// Count-up display value for KPI (animates from 0 to value on mount/change)
function useCountUp(value: string | number, duration = 520, enabled = true): string | number {
  const num = typeof value === 'number' ? value : parseInt(String(value), 10);
  const isNumeric = !Number.isNaN(num) && typeof value === 'number';
  const [display, setDisplay] = useState(isNumeric ? 0 : value);
  useEffect(() => {
    if (!enabled || !isNumeric) {
      setDisplay(value);
      return;
    }
    const end = num;
    const startTime = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      const eased = 1 - (1 - t) * (1 - t);
      setDisplay(Math.round(end * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [num, duration, enabled, isNumeric, value]);
  if (!isNumeric) return value;
  return display;
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
  metricId?: ChartMetricId;
  isActive?: boolean;
  isPrimary?: boolean;
  onFocusMetric?: (id: ChartMetricId) => void;
}) {
  const isChartMetric = metricId != null;
  const displayValue = useCountUp(value);
  const bgTint =
    tint === 'violet'
      ? primary
        ? 'bg-violet-500/[0.07]'
        : 'bg-violet-500/[0.05]'
      : 'bg-neutral-100/90';

  const wrapperClass = [
    'relative rounded-[22px] flex flex-col justify-between shadow-sm border transition-all duration-200',
    isChartMetric ? 'cursor-pointer select-none' : '',
    primary ? 'p-6 min-h-[108px]' : 'p-5 min-h-[100px]',
    isPrimary ? 'border-violet-400/70 ring-1 ring-violet-400/20 shadow-md' : isActive ? 'border-violet-300/50 hover:border-violet-400/60' : primary ? 'border-violet-200/50 hover:border-violet-300/60' : 'border-neutral-200/60 hover:border-neutral-300/70',
    'hover:shadow-md hover:-translate-y-0.5 hover:shadow-lg',
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
        <p className={`font-semibold text-neutral-900 tracking-tight tabular-nums ${primary ? 'text-2xl md:text-3xl' : 'text-xl md:text-2xl'}`}>{displayValue}</p>
        <p className="text-sm text-neutral-500 mt-1">{label}</p>
      </div>
      {sparkData != null && sparkData.length > 1 && (
        <div className={`mt-3 h-8 -mb-1 ${tint === 'violet' ? 'opacity-75' : tint === 'slate' ? 'opacity-75' : 'opacity-60'}`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={sparkData.map((value, index) => ({ value, index }))}
              margin={{ top: 2, right: 0, left: 0, bottom: 2 }}
            >
              <defs>
                <linearGradient id="kpiSparkGrad" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={PURPLE.primary} stopOpacity={0.1} />
                  <stop offset="100%" stopColor={PURPLE.soft} stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="kpiSparkGradSlate" x1="0" y1="1" x2="0" y2="0">
                  <stop offset="0%" stopColor={PURPLE.primary} stopOpacity={0.06} />
                  <stop offset="100%" stopColor={PURPLE.soft} stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="value"
                stroke="none"
                fill={tint === 'violet' ? 'url(#kpiSparkGrad)' : tint === 'slate' ? 'url(#kpiSparkGradSlate)' : 'currentColor'}
                fillOpacity={tint === 'violet' ? 1 : tint === 'slate' ? 1 : 0.2}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );

  if (isChartMetric && metricId != null && onFocusMetric) {
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
    <div className="rounded-xl bg-white border border-neutral-100 shadow-sm px-4 py-3 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200">
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
// KPI-driven focus: lines for followers/views/visits, bars for posts. Optional posting-day markers.
function FollowersGrowthChart({
  data,
  hoveredDate,
  onDateHover,
  activeMetrics,
  primaryFocus,
  showActivityOnGrowth = true,
  onShowActivityChange,
}: {
  data: GrowthDataPoint[];
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
  activeMetrics: Set<ChartMetricId>;
  primaryFocus: ChartMetricId;
  showActivityOnGrowth?: boolean;
  onShowActivityChange?: (show: boolean) => void;
}) {
  const chartData = useMemo(() => {
    return data.map((d, i) => ({
      ...d,
      gained: i > 0 ? Math.max(0, d.followers - data[i - 1].followers) : d.followers,
    }));
  }, [data]);

  const postingDays = useMemo(() => data.filter((d) => (d.posts ?? 0) > 0).map((d) => d.date), [data]);
  const hasEnoughData = useMemo(() => {
    const totalF = data.reduce((s, d) => s + (d.followers ?? 0), 0);
    const totalP = data.reduce((s, d) => s + (d.posts ?? 0), 0);
    return data.length >= 2 && (totalF > 0 || totalP > 0);
  }, [data]);

  const leftMetricIds = useMemo(() => LINE_METRIC_IDS.filter((id) => id !== 'views' && activeMetrics.has(id)), [activeMetrics]);
  const hasViews = activeMetrics.has('views');
  const hasPosts = activeMetrics.has('posts');

  const leftDomain = useMemo((): [number, number] => {
    let max = 0;
    for (const id of leftMetricIds) {
      const key = id as keyof GrowthDataPoint;
      const vals = chartData.map((d) => Number(d[key]) ?? 0);
      max = Math.max(max, ...vals);
    }
    if (hasPosts) {
      const postVals = chartData.map((d) => d.posts ?? 0);
      max = Math.max(max, ...postVals);
    }
    if (max === 0 && leftMetricIds.length === 0 && !hasPosts) return [0, 10];
    const min = 0;
    const offset = max <= 1 ? 0.5 : Math.min(0.5, max * 0.08);
    return [min, max + offset];
  }, [chartData, leftMetricIds, hasPosts]);

  const rightDomain = useMemo((): [number, number] => {
    if (!hasViews) return [0, 10];
    const vals = chartData.map((d) => d.views ?? 0);
    const max = Math.max(...vals, 0);
    const min = 0;
    const offset = max <= 1 ? 0.5 : Math.min(0.5, max * 0.08);
    return [min, max + offset];
  }, [chartData, hasViews]);

  const lastDate = chartData.length > 0 ? chartData[chartData.length - 1].date : null;
  const tickCount = 4;

  return (
    <div className={`rounded-[22px] bg-white border border-neutral-100 shadow-md p-6 hover:shadow-lg hover:border-neutral-200/80 transition-all duration-200 ${!hasEnoughData ? 'opacity-85' : ''}`}>
      <div className="flex items-center justify-between gap-4 mb-3">
        <h3 className="text-sm font-semibold text-neutral-800">Audience growth over time</h3>
        {onShowActivityChange && (
          <label className="flex items-center gap-2.5 cursor-pointer select-none shrink-0 group">
            <span className="text-xs font-medium text-neutral-500 group-hover:text-neutral-600 transition-colors">Overlay activity</span>
            <button
              type="button"
              role="switch"
              aria-checked={showActivityOnGrowth}
              onClick={() => onShowActivityChange(!showActivityOnGrowth)}
              className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:ring-offset-1 ${showActivityOnGrowth ? 'bg-violet-500 border-violet-500' : 'bg-neutral-200 border-neutral-200 group-hover:bg-neutral-300'}`}
            >
              <span
                className={`pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${showActivityOnGrowth ? 'translate-x-5' : 'translate-x-0'}`}
              />
            </button>
          </label>
        )}
      </div>
      {!hasEnoughData && (
        <p className="text-xs text-neutral-400 mb-2">Start posting to see trends.</p>
      )}
      <div className="h-[300px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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
              <linearGradient id="growthContentBarGrad" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={PURPLE.soft} stopOpacity={0.7} />
                <stop offset="100%" stopColor={PURPLE.soft} stopOpacity={0.95} />
              </linearGradient>
              <linearGradient id="growthContentBarGradPrimary" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor={PURPLE.primary} stopOpacity={0.85} />
                <stop offset="100%" stopColor={PURPLE.strong} stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={PURPLE.grid} vertical={false} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke={PURPLE.primary} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            {showActivityOnGrowth && postingDays.map((date) => (
              <ReferenceLine
                key={date}
                segment={[{ x: date, y: 0 }, { x: date, y: leftDomain[1] * 0.06 }]}
                stroke="rgba(124, 58, 237, 0.045)"
                strokeWidth={1}
              />
            ))}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#525252' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
              interval="preserveStartEnd"
            />
            {(leftMetricIds.length > 0 || hasPosts || !hasViews) && (
              <YAxis
                yAxisId="left"
                domain={leftDomain}
                tick={{ fontSize: 12, fill: '#525252' }}
                axisLine={false}
                tickLine={false}
                width={28}
                tickCount={tickCount}
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
                width={32}
                tickCount={tickCount}
                tickFormatter={formatYAxisValue}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !labelStr) return null;
                const point = chartData.find((d) => d.date === labelStr);
                const activePayloads = (payload ?? []).filter((p) => p.dataKey && activeMetrics.has(p.dataKey as ChartMetricId));
                const metricLabels: Record<ChartMetricId, string> = { followers: 'Followers', views: 'Views', visits: 'Page visits', posts: 'Posts' };
                const postsThatDay = point?.posts ?? 0;
                const showPostsInTooltip = activePayloads.length > 0 || postsThatDay >= 0;
                return (
                  <div className="rounded-lg bg-white text-neutral-900 px-3 py-2 shadow-lg border border-neutral-200/60 text-left min-w-[140px]">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    {activePayloads.map((p) => {
                      const id = p.dataKey as ChartMetricId;
                      const value = (p.value as number) ?? 0;
                      const isPrimary = id === primaryFocus;
                      const color = id === 'posts' ? PURPLE.primary : METRIC_COLORS[id].stroke;
                      return (
                        <p key={id} className={`mt-0.5 text-sm ${isPrimary ? 'font-semibold text-neutral-900' : 'text-neutral-600'}`}>
                          <span className="text-neutral-500">{metricLabels[id]}: </span>
                          <span className="tabular-nums" style={{ color }}>{id === 'posts' ? String(value) : formatYAxisValue(value)}</span>
                        </p>
                      );
                    })}
                    {showPostsInTooltip && !activePayloads.some((p) => p.dataKey === 'posts') && (
                      <p className="mt-0.5 text-sm text-neutral-600">
                        <span className="text-neutral-500">Posts: </span>
                        <span className="tabular-nums text-neutral-800">{postsThatDay}</span>
                      </p>
                    )}
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
                    <Area type="monotone" dataKey={id} fill={areaGrad} stroke="none" yAxisId={yAxisId} isAnimationActive animationDuration={500} animationEasing="ease-out" />
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
                    animationDuration={500}
                    animationEasing="ease-out"
                  />
                </React.Fragment>
              );
            })}
            {hasPosts && (
              <Bar dataKey="posts" yAxisId="left" fill="url(#growthContentBarGrad)" radius={[4, 4, 0, 0]} barSize={14} maxBarSize={22} isAnimationActive animationDuration={400} animationEasing="ease-out">
                {chartData.map((entry, index) => {
                  const isHovered = entry.date === hoveredDate;
                  const isPrimary = primaryFocus === 'posts';
                  const fill = isHovered || isPrimary ? 'url(#growthContentBarGradPrimary)' : 'url(#growthContentBarGrad)';
                  const fillOpacity = isPrimary ? 0.9 : 0.45;
                  return (
                    <Cell
                      key={entry.date + index}
                      fill={fill}
                      fillOpacity={fillOpacity}
                      stroke={isHovered || isPrimary ? PURPLE.primary : undefined}
                      strokeWidth={isHovered || isPrimary ? 1.5 : 0}
                    />
                  );
                })}
              </Bar>
            )}
          </ComposedChart>
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
  const hasEnoughData = useMemo(() => {
    const totalP = data.reduce((s, d) => s + (d.posts ?? 0), 0);
    return data.length >= 2 && totalP > 0;
  }, [data]);

  return (
    <div className={`rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200 ${!hasEnoughData ? 'opacity-90' : ''}`}>
      <h3 className="text-sm font-semibold text-neutral-700">Content activity</h3>
      {!hasEnoughData && (
        <p className="text-xs text-neutral-400 mt-0.5 mb-2">Start posting to see activity.</p>
      )}
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
              <ReferenceLine x={hoveredDate} stroke={PURPLE.primary} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#525252' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#525252' }}
              axisLine={false}
              tickLine={false}
              width={24}
              allowDecimals={false}
              tickCount={4}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !labelStr) return null;
                const point = data.find((d) => d.date === labelStr);
                const postsVal = (payload?.[0]?.value as number) ?? point?.posts ?? 0;
                const followersVal = point?.followers ?? 0;
                return (
                  <div className="rounded-lg bg-white text-neutral-900 px-3 py-2 shadow-lg border border-neutral-200/60 text-left min-w-[140px]">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="mt-0.5 text-sm">
                      <span className="text-neutral-500">Posts: </span>
                      <span className="font-semibold text-violet-600 tabular-nums">{postsVal}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      <span className="text-neutral-500">Followers: </span>
                      <span className="tabular-nums">{followersVal}</span>
                    </p>
                  </div>
                );
              }}
              cursor={{ stroke: PURPLE.muted, strokeWidth: 1, strokeDasharray: '4 2' }}
            />
            <Bar dataKey="posts" fill="url(#contentBarGrad)" radius={[6, 6, 0, 0]} barSize={17} maxBarSize={32} isAnimationActive animationDuration={400} animationEasing="ease-out">
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

// —— Balance of Followers chart (gained / lost per day) ——
function BalanceOfFollowersChart({
  growthTimeSeries,
  hoveredDate,
  onDateHover,
}: {
  growthTimeSeries: Array<{ date: string; gained: number; lost: number; net?: number }>;
  hoveredDate: string | null;
  onDateHover: (date: string | null) => void;
}) {
  const hasData = growthTimeSeries.length >= 1;
  const netTotal = growthTimeSeries.reduce((s, d) => s + (d.net ?? d.gained - d.lost), 0);
  const chartData = useMemo(
    () =>
      growthTimeSeries.map((d) => ({
        date: d.date,
        gained: d.gained,
        lost: -Math.abs(d.lost || 0),
        net: d.net ?? d.gained - d.lost,
      })),
    [growthTimeSeries]
  );

  return (
    <div className={`rounded-[22px] bg-white border border-neutral-100 shadow-sm p-6 hover:shadow-md hover:border-neutral-200/80 transition-all duration-200 ${!hasData ? 'opacity-90' : ''}`}>
      <div className="flex items-center justify-between gap-4 mb-3">
        <h3 className="text-sm font-semibold text-neutral-800">Balance of Followers</h3>
        <p className="text-sm font-medium tabular-nums text-neutral-600">
          Net: {netTotal >= 0 ? `+${netTotal}` : netTotal}
        </p>
      </div>
      {!hasData && (
        <p className="text-xs text-neutral-400 mb-2">No follower changes in this period.</p>
      )}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 12, right: 12, left: 12, bottom: 4 }}
            onMouseMove={(e) => {
              const payload = (e as unknown as { activePayload?: Array<{ payload?: { date?: string } }> }).activePayload;
              const date = payload?.[0]?.payload?.date;
              onDateHover(date ?? null);
            }}
            onMouseLeave={() => onDateHover(null)}
            barGap={2}
            barCategoryGap="12%"
          >
            <CartesianGrid strokeDasharray="3 3" stroke={PURPLE.grid} vertical={false} />
            <ReferenceLine y={0} stroke="#a3a3a3" strokeWidth={1} />
            {hoveredDate && (
              <ReferenceLine x={hoveredDate} stroke={PURPLE.primary} strokeOpacity={0.35} strokeWidth={1.5} strokeDasharray="4 3" />
            )}
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#525252' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatDateShort}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#525252' }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(v) => (v >= 0 ? `+${v}` : String(v))}
              domain={['auto', 'auto']}
            />
            <Tooltip
              content={({ active, payload, label }) => {
                const labelStr = label != null ? String(label) : '';
                if (!active || !labelStr) return null;
                const point = chartData.find((d) => d.date === labelStr);
                if (!point) return null;
                return (
                  <div className="rounded-lg bg-white text-neutral-900 px-3 py-2 shadow-lg border border-neutral-200/60 text-left min-w-[140px]">
                    <p className="text-neutral-500 text-xs font-medium">{formatDate(labelStr)}</p>
                    <p className="mt-0.5 text-sm text-emerald-600">
                      <span className="text-neutral-500">Gained: </span>
                      <span className="tabular-nums font-medium">+{point.gained}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-rose-500">
                      <span className="text-neutral-500">Lost: </span>
                      <span className="tabular-nums font-medium">-{Math.abs(point.lost)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-700">
                      <span className="text-neutral-500">Net: </span>
                      <span className="tabular-nums font-medium">{point.net >= 0 ? `+${point.net}` : point.net}</span>
                    </p>
                  </div>
                );
              }}
              cursor={{ stroke: PURPLE.muted, strokeWidth: 1, strokeDasharray: '4 2' }}
            />
            <Bar dataKey="gained" name="Gained" fill="#10b981" radius={[4, 4, 0, 0]} barSize={14} isAnimationActive animationDuration={400} />
            <Bar dataKey="lost" name="Lost" fill="#f43f5e" radius={[0, 0, 4, 4]} barSize={14} isAnimationActive animationDuration={400} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// —— OverviewGrowthSection ——
export interface OverviewGrowthSectionProps {
  data?: GrowthDataPoint[];
  growthTimeSeries?: Array<{ date: string; gained: number; lost: number; net?: number }>;
  dateRange?: { start: string; end: string };
  onDateRangeChange?: (range: { start: string; end: string }) => void;
  onExport?: () => void;
}

export function OverviewGrowthSection({
  data = SAMPLE_GROWTH_DATA,
  growthTimeSeries,
  dateRange,
  onDateRangeChange,
  onExport,
}: OverviewGrowthSectionProps) {
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [activeMetrics, setActiveMetrics] = useState<Set<ChartMetricId>>(() => new Set(['followers', 'posts']));
  const [primaryFocus, setPrimaryFocus] = useState<ChartMetricId>('followers');
  const [showActivityOnGrowth, setShowActivityOnGrowth] = useState(true);

  const handleFocusMetric = useCallback((id: ChartMetricId) => {
    setActiveMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
        setPrimaryFocus((p) => (p === id ? CHART_METRIC_IDS.find((m) => next.has(m)) ?? p : p));
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
      postsSpark: data.map((d) => d.posts),
    };
  }, [data]);

  return (
    <section className="rounded-[24px] bg-white border border-neutral-100 shadow-sm overflow-hidden">
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
                className="inline-flex items-center gap-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 px-3 py-2 rounded-lg border border-neutral-200 bg-white hover:bg-neutral-50 hover:border-neutral-300 transition-all duration-200"
              >
                <Download size={16} className="text-neutral-500" />
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
          <KpiCard
            label="Total content"
            value={stats.totalContent}
            tint="slate"
            sparkData={stats.postsSpark}
            metricId="posts"
            isActive={activeMetrics.has('posts')}
            isPrimary={primaryFocus === 'posts'}
            onFocusMetric={handleFocusMetric}
          />
        </div>

        {/* Chart 1: Audience growth over time (followers line + posts bars) */}
        <FollowersGrowthChart
          data={data}
          hoveredDate={hoveredDate}
          onDateHover={setHoveredDate}
          activeMetrics={activeMetrics}
          primaryFocus={primaryFocus}
          showActivityOnGrowth={showActivityOnGrowth}
          onShowActivityChange={setShowActivityOnGrowth}
        />

        {/* Chart 2: Balance of Followers (gained / lost per day) */}
        {growthTimeSeries && growthTimeSeries.length > 0 ? (
          <BalanceOfFollowersChart
            growthTimeSeries={growthTimeSeries}
            hoveredDate={hoveredDate}
            onDateHover={setHoveredDate}
          />
        ) : null}

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
