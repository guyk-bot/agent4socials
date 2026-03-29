'use client';

import React from 'react';

export interface AnalyticsCardProps {
  children: React.ReactNode;
  className?: string;
  /** Optional: no hover lift (e.g. for inner cards) */
  noHover?: boolean;
}

/** Global card style: white bg, 16px radius, 24px padding, border, shadow, hover lift. */
export function AnalyticsCard({ children, className = '', noHover }: AnalyticsCardProps) {
  return (
    <div
      className={`
        bg-white rounded-2xl p-6 border border-[rgba(0,0,0,0.06)]
        shadow-[0_4px_16px_rgba(0,0,0,0.04)]
        ${noHover ? '' : 'hover:translate-y-[-2px] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)]'}
        transition-all duration-150 ${className}
      `}
    >
      {children}
    </div>
  );
}
