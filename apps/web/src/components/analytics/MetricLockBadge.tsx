'use client';

import React from 'react';
import { Lock } from 'lucide-react';

export interface MetricLockBadgeProps {
  label?: string;
  className?: string;
}

export function MetricLockBadge({ label = 'Locked', className = '' }: MetricLockBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-neutral-500 bg-neutral-100 ${className}`}
      title={label}
    >
      <Lock size={10} />
      {label}
    </span>
  );
}
