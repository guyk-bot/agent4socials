'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Lock } from 'lucide-react';

export type KpiAccent = 'visibility' | 'audience' | 'engagement' | 'content' | 'muted';

const ACCENT_STYLES: Record<KpiAccent, { border: string; trendPositive: string; trendNegative: string }> = {
  visibility: { border: 'border-l-neutral-400', trendPositive: 'text-neutral-600', trendNegative: 'text-red-500' },
  audience: { border: 'border-l-neutral-400', trendPositive: 'text-neutral-600', trendNegative: 'text-red-500' },
  engagement: { border: 'border-l-[#ea580c]', trendPositive: 'text-[#ea580c]', trendNegative: 'text-red-500' },
  content: { border: 'border-l-[#ea580c]', trendPositive: 'text-[#ea580c]', trendNegative: 'text-red-500' },
  muted: { border: 'border-l-neutral-200', trendPositive: 'text-neutral-500', trendNegative: 'text-neutral-500' },
};

export interface AnalyticsKpiCardProps {
  label: string;
  value: string | number | null;
  trend?: { direction: 'up' | 'down'; value: string };
  subtitle?: string;
  accent?: KpiAccent;
  locked?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export function AnalyticsKpiCard({
  label,
  value,
  trend,
  subtitle,
  accent = 'visibility',
  locked,
  icon,
  className = '',
}: AnalyticsKpiCardProps) {
  const styles = ACCENT_STYLES[accent];
  const displayValue = value === null || value === undefined ? '—' : typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border border-[rgba(0,0,0,0.06)] shadow-[0_2px_10px_rgba(0,0,0,0.04)]
        hover:shadow-[0_4px_14px_rgba(0,0,0,0.06)] hover:-translate-y-px transition-all duration-150
        border-l-4 ${styles.border} ${locked ? 'opacity-75' : ''} ${className}
      `}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-[#6b7280] uppercase tracking-[0.03em]">{label}</p>
          <p className="text-[32px] font-semibold text-[#111827] tabular-nums mt-1 leading-tight">
            {locked ? (
              <span className="inline-flex items-center gap-1.5">
                <Lock size={16} className="text-neutral-400" />
                {displayValue}
              </span>
            ) : (
              displayValue
            )}
          </p>
          {trend && (
            <p className={`text-[13px] mt-1 flex items-center gap-1 ${trend.direction === 'up' ? styles.trendPositive : styles.trendNegative}`}>
              {trend.direction === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {trend.value}
            </p>
          )}
          {subtitle && !trend && <p className="text-[13px] text-[#6b7280] mt-1">{subtitle}</p>}
        </div>
        {icon && <div className="shrink-0 text-[#6b7280] opacity-80">{icon}</div>}
      </div>
    </div>
  );
}
