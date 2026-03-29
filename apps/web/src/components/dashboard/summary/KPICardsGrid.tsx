'use client';

import React from 'react';
import type { SummaryKPIs } from './types';

type KPICardProps = {
  label: string;
  value: string | number;
  change?: number;
  accentColor: string;
  borderColor: string;
  icon: string;
  delay: number;
};

function KPICard({ label, value, change, accentColor, borderColor, icon, delay }: KPICardProps) {
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
      accentColor: '#5ff6fd',
      borderColor: '#5ff6fd',
      icon: '👥',
      delay: 0,
    },
    {
      label: 'Total Reach',
      value: kpis.totalReach.toLocaleString(),
      change: kpis.totalReachChange,
      accentColor: '#b030ad',
      borderColor: '#b030ad',
      icon: '📡',
      delay: 60,
    },
    {
      label: 'Engagement Rate',
      value: `${kpis.engagementRate.toFixed(2)}%`,
      change: kpis.engagementRateChange,
      accentColor: '#5ff6fd',
      borderColor: '#5ff6fd',
      icon: '💬',
      delay: 120,
    },
    {
      label: 'Content Published',
      value: kpis.contentPublished.toLocaleString(),
      change: kpis.contentPublishedChange,
      accentColor: '#b030ad',
      borderColor: '#b030ad',
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
