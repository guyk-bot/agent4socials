'use client';

import React from 'react';

export interface AnalyticsWatermarkedChartProps {
  children: React.ReactNode;
  title?: string;
  height?: number;
  className?: string;
  /** When false, the Agent4Socials watermark is hidden (e.g. for upgraded users or ranges ≤30 days). */
  showWatermark?: boolean;
}

/** Wraps a chart with a subtle Agent4Socials watermark in the background. */
export function AnalyticsWatermarkedChart({
  children,
  title,
  height = 280,
  className = '',
  showWatermark = true,
}: AnalyticsWatermarkedChartProps) {
  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border border-[rgba(0,0,0,0.06)] shadow-[0_4px_16px_rgba(0,0,0,0.04)]
        hover:translate-y-[-2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-150
        overflow-hidden relative ${className}
      `}
    >
      {title && (
        <div className="pb-2">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
        </div>
      )}
      <div className="relative" style={{ minHeight: height }}>
        {showWatermark && (
          <div
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none select-none"
            style={{ opacity: 0.04 }}
            aria-hidden
          >
            <span className="text-[#111827] font-semibold text-2xl tracking-tight">Agent4Socials</span>
          </div>
        )}
        <div className="relative z-10" style={{ height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
