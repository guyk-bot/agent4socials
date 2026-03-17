'use client';

import React, { useCallback, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  TooltipProps,
} from 'recharts';

export type TimeSeriesPoint = { date: string; value: number };

type SeriesConfig = { dataKey: string; label: string; color: string };

type GrowthLineChartProps = {
  /** Sorted by date. Each point can have audience, reach, engagement, posts. */
  data: Array<{ date: string; audience?: number; reach?: number; engagement?: number; posts?: number }>;
  /** Which metric to show */
  metric: 'audience' | 'reach' | 'engagement' | 'posts';
  height?: number;
  className?: string;
};

const METRIC_CONFIG: Record<string, SeriesConfig> = {
  audience: { dataKey: 'audience', label: 'Audience', color: '#5ff6fd' },
  reach: { dataKey: 'reach', label: 'Reach', color: '#df44dc' },
  engagement: { dataKey: 'engagement', label: 'Engagement', color: '#5ff6fd' },
  posts: { dataKey: 'posts', label: 'Posts', color: '#df44dc' },
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function GrowthLineChart({ data, metric, height = 320, className = '' }: GrowthLineChartProps) {
  const config = METRIC_CONFIG[metric];
  const chartData = useMemo(() => {
    return data.map((d) => ({
      date: d.date,
      [config.dataKey]: d[metric] ?? 0,
    }));
  }, [data, metric, config.dataKey]);

  const CustomTooltip = useCallback(
    (props: TooltipProps<number, string>) => {
      const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }>; label?: string };
      if (!active || !payload?.length || !label) return null;
      const value = payload[0]?.value;
      return (
        <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-xl">
          <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">{formatDate(label)}</p>
          <p className="text-sm font-bold" style={{ color: config.color }}>
            {config.label}: {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
        </div>
      );
    },
    [config]
  );

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center text-slate-400 text-sm ${className}`} style={{ height }}>
        No data for this period
      </div>
    );
  }

  return (
    <div className={className} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id={`growth-grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={config.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={config.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              try {
                return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              } catch {
                return v;
              }
            }}
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#64748b' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }} />
          <Area
            type="monotone"
            dataKey={config.dataKey}
            name={config.label}
            stroke={config.color}
            strokeWidth={2}
            fill={`url(#growth-grad-${metric})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
