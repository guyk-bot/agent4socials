'use client';

import React from 'react';

const SPAN_CLASS: Record<number, string> = {
  1: 'md:col-span-1',
  2: 'md:col-span-2',
  3: 'md:col-span-3',
  4: 'md:col-span-4',
  5: 'md:col-span-5',
  6: 'md:col-span-6',
  7: 'md:col-span-7',
  8: 'md:col-span-8',
  9: 'md:col-span-9',
  10: 'md:col-span-10',
  11: 'md:col-span-11',
  12: 'md:col-span-12',
};

export interface AnalyticsGridProps {
  children: React.ReactNode;
  className?: string;
}

/** Responsive 12-column grid, 24px gap. On mobile: single column. */
export function AnalyticsGrid({ children, className = '' }: AnalyticsGridProps) {
  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-12 ${className}`}
      style={{ gap: 24 }}
    >
      {children}
    </div>
  );
}

export interface AnalyticsGridItemProps {
  children: React.ReactNode;
  /** Desktop span 1-12. Mobile always full width. */
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  className?: string;
}

export function AnalyticsGridItem({ children, span = 12, className = '' }: AnalyticsGridItemProps) {
  return (
    <div className={span ? `${SPAN_CLASS[span] ?? 'md:col-span-12'} ${className}` : className}>
      {children}
    </div>
  );
}
