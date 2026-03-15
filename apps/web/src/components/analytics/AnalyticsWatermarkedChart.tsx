'use client';

import React from 'react';

export interface AnalyticsWatermarkedChartProps {
  children: React.ReactNode;
  title?: string;
  height?: number;
  className?: string;
}

/** Wraps a chart with a subtle Agent4Socials watermark in the background. */
export function AnalyticsWatermarkedChart({
  children,
  title,
  height = 280,
  className = '',
}: AnalyticsWatermarkedChartProps) {
  return (
    <div
      className={`
        bg-white rounded-2xl border border-[rgba(0,0,0,0.06)] shadow-[0_2px_10px_rgba(0,0,0,0.04)]
        overflow-hidden relative ${className}
      `}
    >
      {title && (
        <div className="px-6 pt-5 pb-1">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
        </div>
      )}
      <div className="px-6 pb-6 pt-2 relative" style={{ minHeight: height }}>
        {/* Watermark: centered, very low opacity, pointer-events none */}
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
          style={{ opacity: 0.04 }}
          aria-hidden
        >
          <span className="text-[#111827] font-semibold text-2xl tracking-tight">Agent4Socials</span>
        </div>
        <div className="relative z-10" style={{ height }}>
          {children}
        </div>
      </div>
    </div>
  );
}
