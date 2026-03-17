'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
  TooltipProps,
} from 'recharts';

export type TimeSeriesPoint = { date: string; value: number };

/** Multi-series point for Summary-style charts (e.g. Impressions by platform) */
export type MultiSeriesPoint = { date: string; [key: string]: string | number };

type InteractiveLineChartProps = {
  data: TimeSeriesPoint[];
  color?: string;
  height?: number;
  valueLabel?: string;
  secondaryData?: TimeSeriesPoint[];
  secondaryColor?: string;
  secondaryLabel?: string;
  className?: string;
  /** Show vertical crosshair on hover (Metricool-style) */
  crosshair?: boolean;
  /** Use dark tooltip (background #111827, white text, 8px 10px padding, 8px radius) for analytics */
  tooltipStyle?: 'light' | 'dark';
};

const defaultColor = '#5ff6fd';

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function InteractiveLineChart({
  data,
  color = defaultColor,
  height = 200,
  valueLabel = 'Value',
  secondaryData,
  secondaryColor = '#df44dc',
  secondaryLabel,
  className = '',
  crosshair = true,
  tooltipStyle = 'light',
}: InteractiveLineChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const id = useMemo(() => `chart-${Math.random().toString(36).slice(2, 9)}`, []);

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; value: number; value2?: number }>();
    data.forEach((d) => map.set(d.date, { date: d.date, value: d.value }));
    if (secondaryData?.length) {
      secondaryData.forEach((d) => {
        const existing = map.get(d.date);
        if (existing) existing.value2 = d.value;
        else map.set(d.date, { date: d.date, value: 0, value2: d.value });
      });
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data, secondaryData]);

  const CustomTooltip = useCallback(
    (rawProps: TooltipProps<number, string>) => {
      const { active, payload, label } = rawProps as unknown as {
        active?: boolean;
        payload?: Array<{ name?: string; value?: number; color?: string }>;
        label?: string;
      };
      if (!active || !payload?.length || !label) return null;
      const isDark = tooltipStyle === 'dark';
      return (
        <div
          className={isDark ? 'bg-[#111827] text-white px-2.5 py-2 rounded-lg shadow-xl text-xs' : 'rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-xl'}
        >
          <p className={isDark ? 'text-neutral-300 mb-1.5' : 'text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2'}>{formatDate(label)}</p>
          <div className="space-y-1">
            {payload.map((p) => (
              <div key={p.name} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
                <span className={isDark ? 'font-medium' : 'text-sm font-medium text-neutral-800'}>
                  {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    },
    [tooltipStyle]
  );

  if (chartData.length === 0) {
    return (
      <div className={`flex items-center justify-center text-neutral-400 text-sm ${className}`} style={{ height }}>
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
          onMouseMove={(e) => {
            const idx = e?.activeTooltipIndex;
            setHoveredIndex(typeof idx === 'number' ? idx : null);
          }}
          onMouseLeave={() => setHoveredIndex(null)}
        >
          <defs>
            <linearGradient id={`${id}-grad`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
            {secondaryData?.length ? (
              <linearGradient id={`${id}-grad2`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={secondaryColor} stopOpacity={0.25} />
                <stop offset="100%" stopColor={secondaryColor} stopOpacity={0} />
              </linearGradient>
            ) : null}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => {
              try {
                return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              } catch {
                return v;
              }
            }}
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={
              crosshair
                ? {
                    stroke: '#94a3b8',
                    strokeWidth: 1,
                    strokeDasharray: '4 4',
                  }
                : false
            }
          />
          {crosshair && hoveredIndex != null && chartData[hoveredIndex] && (
            <ReferenceLine
              x={chartData[hoveredIndex].date}
              stroke="#64748b"
              strokeDasharray="4 4"
              strokeWidth={1.5}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            name={valueLabel}
            stroke={color}
            strokeWidth={2}
            fill={`url(#${id}-grad)`}
          />
          {secondaryData?.length && secondaryLabel ? (
            <Area
              type="monotone"
              dataKey="value2"
              name={secondaryLabel}
              stroke={secondaryColor}
              strokeWidth={2}
              fill={`url(#${id}-grad2)`}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
