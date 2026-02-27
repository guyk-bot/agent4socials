'use client';

import React from 'react';
import type { SummaryKPIs } from './types';

function MiniSparkline({ values, color = '#22FF88' }: { values: number[]; color?: string }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const w = 64;
  const h = 24;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1 || 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0 opacity-80">
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

type KPICardProps = {
  label: string;
  value: string | number;
  change?: number;
  sparkline: number[];
  accentColor: string;
  borderColor: string;
};

function KPICard({ label, value, change, sparkline, accentColor, borderColor }: KPICardProps) {
  return (
    <div
      className="rounded-[20px] bg-white p-5 flex flex-col min-h-[120px]"
      style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.04)', borderLeft: `4px solid ${borderColor}` }}
    >
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-1">{label}</p>
      <div className="flex items-end justify-between gap-3 flex-1">
        <div>
          <p className="text-2xl sm:text-3xl font-bold text-slate-900 tabular-nums">{value}</p>
          {change !== undefined && (
            <p className={`text-sm font-medium mt-0.5 ${change >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
              {change >= 0 ? '+' : ''}{change}% vs previous
            </p>
          )}
        </div>
        <MiniSparkline values={sparkline} color={accentColor} />
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
      accentColor: '#22FF88',
      borderColor: '#22FF88',
    },
    {
      label: 'Total Reach',
      value: kpis.totalReach.toLocaleString(),
      change: kpis.totalReachChange,
      sparkline: kpis.reachSparkline,
      accentColor: '#6366f1',
      borderColor: '#818cf8',
    },
    {
      label: 'Engagement Rate',
      value: `${kpis.engagementRate.toFixed(2)}%`,
      change: kpis.engagementRateChange,
      sparkline: kpis.engagementSparkline,
      accentColor: '#c084fc',
      borderColor: '#c084fc',
    },
    {
      label: 'Content Published',
      value: kpis.contentPublished.toLocaleString(),
      change: kpis.contentPublishedChange,
      sparkline: kpis.postsSparkline,
      accentColor: '#38bdf8',
      borderColor: '#38bdf8',
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
          />
        ))}
      </div>
    </section>
  );
}
