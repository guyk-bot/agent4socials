'use client';

import React, { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
  type PieLabelRenderProps,
} from 'recharts';
import { ChevronDown } from 'lucide-react';
import { aggregateTopNWithOther, formatBreakdownTotal, resolveSliceColor } from '@/lib/analytics/breakdown-helpers';

export type DonutBreakdownItem = {
  key: string;
  label: string;
  value: number;
  percent: number;
  colorToken?: string;
};

export type DonutBreakdownFilterOption = { value: string; label: string };

const DEFAULT_FILTER_OPTIONS: DonutBreakdownFilterOption[] = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

export type DonutBreakdownCardProps = {
  title: string;
  subtitle?: string;
  totalLabel: string;
  totalValue: string;
  items: DonutBreakdownItem[];
  loading?: boolean;
  error?: string | null;
  emptyState?: React.ReactNode;
  selectedFilter: string;
  onFilterChange: (value: string) => void;
  filterOptions?: DonutBreakdownFilterOption[];
  /** How to format raw values in the legend */
  valueFormat?: 'count' | 'minutes' | 'views';
  /** First column header for the legend table */
  legendLabel?: string;
  className?: string;
};

type ChartRow = DonutBreakdownItem & { fill: string; displayPercent: number };

function formatTooltipMetricLine(
  value: number,
  kind: DonutBreakdownCardProps['valueFormat']
): string {
  if (kind === 'minutes') return formatBreakdownTotal(value, 'minutes');
  if (kind === 'count') return formatBreakdownTotal(value, 'count');
  return `${formatBreakdownTotal(value, 'views')} views`;
}

function CardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="mx-auto h-[220px] w-[220px] shrink-0 rounded-full bg-neutral-100" />
        <div className="min-w-0 flex-1 space-y-2.5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-200" />
              <div className="h-3 flex-1 rounded bg-neutral-100" />
              <div className="h-3 w-14 shrink-0 rounded bg-neutral-100" />
              <div className="h-3 w-10 shrink-0 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DonutBreakdownCard({
  title,
  subtitle,
  totalLabel,
  totalValue,
  items,
  loading,
  error,
  emptyState,
  selectedFilter,
  onFilterChange,
  filterOptions = DEFAULT_FILTER_OPTIONS,
  valueFormat = 'views',
  legendLabel = 'Label',
  className = '',
}: DonutBreakdownCardProps) {
  const TooltipContent = React.useCallback(
    (props: TooltipProps<number, string>) => {
      const { active, payload } = props as TooltipProps<number, string> & {
        payload?: Array<{ payload?: ChartRow }>;
      };
      if (!active || !payload?.length) return null;
      const row = payload[0]?.payload;
      if (!row) return null;
      return (
        <div className="rounded-lg border border-black/[0.06] bg-[#111827] px-3 py-2 text-left text-sm text-white shadow-lg">
          <p className="font-medium">{row.label}</p>
          <p className="text-white/85 tabular-nums">{formatTooltipMetricLine(row.value, valueFormat)}</p>
          <p className="text-white/70 tabular-nums">{row.displayPercent}%</p>
        </div>
      );
    },
    [valueFormat]
  );

  const displayItems = useMemo(() => aggregateTopNWithOther(items, 5), [items]);

  const chartData: ChartRow[] = useMemo(
    () =>
      displayItems.map((d, i) => ({
        ...d,
        fill: resolveSliceColor(i, d.colorToken),
        displayPercent: d.percent,
      })),
    [displayItems]
  );

  const isEmpty = !loading && !error && displayItems.length === 0;

  const legendRows = useMemo(() => {
    return [...displayItems].sort((a, b) => b.value - a.value);
  }, [displayItems]);

  const formatLegendValue = (v: number) => formatBreakdownTotal(v, valueFormat);

  return (
    <section
      className={[
        'rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_2px_10px_rgba(0,0,0,0.04)]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-snug text-[#111827]">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-[#6b7280]">{subtitle}</p>
          ) : null}
        </div>
        <div className="relative shrink-0 self-start sm:self-auto">
          <select
            className="h-9 cursor-pointer appearance-none rounded-lg border border-black/[0.08] bg-white pl-3 pr-9 text-[13px] font-medium text-[#374151] shadow-sm outline-none transition hover:border-black/[0.12] focus-visible:ring-2 focus-visible:ring-neutral-400/50"
            value={selectedFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            aria-label="Date range"
          >
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]"
            aria-hidden
          />
        </div>
      </header>

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-[13px] text-red-800"
        >
          {error}
        </div>
      ) : null}

      {loading ? <CardSkeleton /> : null}

      {!loading && !error && isEmpty ? (
        <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/50 px-4 py-10 text-center text-[13px] text-[#6b7280]">
          {emptyState ?? <p>No data for this range.</p>}
        </div>
      ) : null}

      {!loading && !error && !isEmpty ? (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
          <div className="relative mx-auto w-full max-w-[280px] shrink-0">
            <div className="aspect-square w-full max-h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius="72%"
                    outerRadius="92%"
                    paddingAngle={0}
                    stroke="none"
                    strokeWidth={0}
                    labelLine={false}
                    label={(props: PieLabelRenderProps) => {
                      const cx = Number(props.cx);
                      const cy = Number(props.cy);
                      const midAngle = Number(props.midAngle);
                      const ir = Number(props.innerRadius);
                      const or = Number(props.outerRadius);
                      const percent = Number(props.percent);
                      if (![cx, cy, midAngle, ir, or].every((n) => Number.isFinite(n))) return null;
                      if (!Number.isFinite(percent) || percent < 0.06) return null;
                      const RADIAN = Math.PI / 180;
                      const r = ir + (or - ir) * 0.55;
                      const x = cx + r * Math.cos(-midAngle * RADIAN);
                      const y = cy + r * Math.sin(-midAngle * RADIAN);
                      const p = Math.round(percent * 1000) / 10;
                      return (
                        <text
                          x={x}
                          y={y}
                          fill="#374151"
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="text-[11px] font-semibold"
                        >
                          {`${p}%`}
                        </text>
                      );
                    }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={entry.key} fill={entry.fill} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip content={TooltipContent} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-1">
              <div className="max-w-[46%] text-center">
                <p className="text-[10px] font-medium uppercase tracking-wide text-[#6b7280]">{totalLabel}</p>
                <p className="text-lg font-semibold leading-tight text-[#111827] tabular-nums sm:text-xl">
                  {totalValue}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-xl border border-black/[0.06]">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-black/[0.06] bg-neutral-50/80">
                    <th className="px-3 py-2 font-medium text-[#6b7280]" scope="col">
                      {legendLabel}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {legendRows.map((row, i) => (
                    <tr key={row.key} className="border-b border-black/[0.04] last:border-0">
                      <td className="px-3 py-2.5">
                        <div className="grid w-full min-w-0 grid-cols-[10px_minmax(0,1fr)_auto_auto] items-center gap-x-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 justify-self-start rounded-full"
                            style={{
                              backgroundColor: resolveSliceColor(
                                (() => {
                                  const ci = chartData.findIndex((c) => c.key === row.key);
                                  return ci >= 0 ? ci : i;
                                })(),
                                row.colorToken
                              ),
                            }}
                            aria-hidden
                          />
                          <span className="min-w-0 truncate text-right text-[13px] font-medium text-[#111827]">
                            {row.label}
                          </span>
                          <span className="shrink-0 text-right text-[13px] font-semibold tabular-nums text-[#111827]">
                            {formatLegendValue(row.value)}
                          </span>
                          <span className="shrink-0 text-right text-[13px] tabular-nums text-[#6b7280]">{row.percent}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
