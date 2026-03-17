'use client';

import React from 'react';
import { AnalyticsCard } from './AnalyticsCard';

export interface VisibilityMetricRow {
  label: string;
  value: string | number;
  /** 0-100 for mini bar width */
  percent?: number;
}

export interface VisibilityMetricsCardProps {
  title: string;
  metrics: VisibilityMetricRow[];
}

export function VisibilityMetricsCard({ title, metrics }: VisibilityMetricsCardProps) {
  const maxVal = Math.max(...metrics.map((m) => (typeof m.value === 'number' ? m.value : 0)), 1);

  return (
    <AnalyticsCard>
      <p className="text-sm font-semibold text-[#111827] mb-4">{title}</p>
      <div className="space-y-4">
        {metrics.map((m, i) => (
          <div key={i}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-[#6b7280]">{m.label}</span>
              <span className="font-semibold text-[#111827] tabular-nums">
                {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#5ff6fd] transition-all duration-300"
                style={{ width: `${m.percent ?? (typeof m.value === 'number' ? Math.min(100, (m.value / maxVal) * 100) : 0)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}
