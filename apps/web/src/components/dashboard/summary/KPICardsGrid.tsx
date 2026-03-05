'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
} from 'recharts';
import type { SummaryKPIs } from './types';

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length === 0) return null;
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div style={{ width: 80, height: 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Tooltip
            content={({ active, payload }: TooltipProps<number, string>) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-white border border-neutral-200 rounded-lg px-2 py-1 text-xs shadow">
                  {payload[0]?.value?.toLocaleString()}
                </div>
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace('#', '')})`}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type KPICardProps = {
  label: string;
  value: string | number;
  change?: number;
  sparkline: number[];
  accentColor: string;
  borderColor: string;
  icon: string;
  delay: number;
};

function KPICard({ label, value, change, sparkline, accentColor, borderColor, icon, delay }: KPICardProps) {
  return (
    <div
      className="rounded-2xl bg-white p-5 flex flex-col min-h-[130px] transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
      style={{
        boxShadow: '0 4px 20px rgba(0,0,0,0.04)',
        borderLeft: `4px solid ${borderColor}`,
        animation: `slide-up 0.4s ease-out ${delay}ms both`,
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        <span className="text-base" aria-hidden>{icon}</span>
      </div>
      <div className="flex items-end justify-between gap-3 flex-1">
        <div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums leading-none">{value}</p>
          {change !== undefined && (
            <p className={`text-xs font-medium mt-1.5 ${change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs previous
            </p>
          )}
        </div>
        <Sparkline values={sparkline} color={accentColor} />
      </div>
    </div>
  );
}

type KPICardsGridProps = {
  kpis: SummaryKPIs;
};

export function KPICardsGrid({ kpis }: KPICardsGridProps) {
  const cards = [
    {
      label: 'Total Audience',
      value: kpis.totalAudience.toLocaleString(),
      change: kpis.totalAudienceChange,
      sparkline: kpis.audienceSparkline,
      accentColor: '#22c55e',
      borderColor: '#22c55e',
      icon: '👥',
      delay: 0,
    },
    {
      label: 'Total Reach',
      value: kpis.totalReach.toLocaleString(),
      change: kpis.totalReachChange,
      sparkline: kpis.reachSparkline,
      accentColor: '#6366f1',
      borderColor: '#818cf8',
      icon: '📡',
      delay: 60,
    },
    {
      label: 'Engagement Rate',
      value: `${kpis.engagementRate.toFixed(2)}%`,
      change: kpis.engagementRateChange,
      sparkline: kpis.engagementSparkline,
      accentColor: '#a855f7',
      borderColor: '#c084fc',
      icon: '💬',
      delay: 120,
    },
    {
      label: 'Content Published',
      value: kpis.contentPublished.toLocaleString(),
      change: kpis.contentPublishedChange,
      sparkline: kpis.postsSparkline,
      accentColor: '#0ea5e9',
      borderColor: '#38bdf8',
      icon: '📄',
      delay: 180,
    },
  ];

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-4">Executive Overview</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <KPICard
            key={c.label}
            label={c.label}
            value={c.value}
            change={c.change}
            sparkline={c.sparkline}
            accentColor={c.accentColor}
            borderColor={c.borderColor}
            icon={c.icon}
            delay={c.delay}
          />
        ))}
      </div>
    </section>
  );
}
