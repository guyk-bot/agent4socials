'use client';

import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

export type OverviewMetricType = 'followers' | 'reach' | 'interactions' | 'posts';

const GRADIENTS: Record<OverviewMetricType, string> = {
  followers: 'linear-gradient(135deg,#EEF2FF,#E0E7FF)',
  reach: 'linear-gradient(135deg,#ECFEFF,#CFFAFE)',
  interactions: 'linear-gradient(135deg,#FFF1F2,#FFE4E6)',
  posts: 'linear-gradient(135deg,#FFF7ED,#FFEDD5)',
};

const ICON_BG: Record<OverviewMetricType, string> = {
  followers: '#EEF2FF',
  reach: '#ECFEFF',
  interactions: '#FFF1F2',
  posts: '#FFF7ED',
};

export interface OverviewMetricCardProps {
  type: OverviewMetricType;
  label: string;
  value: string | number;
  trend?: { direction: 'up' | 'down'; value: string };
  icon: React.ReactNode;
}

export function OverviewMetricCard({ type, label, value, trend, icon }: OverviewMetricCardProps) {
  const displayValue = value === null || value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString() : value;
  const gradient = GRADIENTS[type];
  const iconBg = ICON_BG[type];

  return (
    <div
      className="rounded-2xl p-6 border border-[rgba(0,0,0,0.06)] shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:translate-y-[-2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-150 overflow-hidden"
      style={{ background: gradient }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#6b7280] uppercase tracking-[0.03em]">{label}</p>
          <p className="text-[28px] md:text-[32px] font-semibold text-[#111827] tabular-nums mt-1 leading-tight">
            {displayValue}
          </p>
          {trend && (
            <p className={`text-[13px] mt-1 flex items-center gap-1 ${trend.direction === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {trend.value}
            </p>
          )}
        </div>
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
