'use client';

import React from 'react';
import { Lock } from 'lucide-react';

export interface AnalyticsUpgradeCardProps {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  className?: string;
}

export function AnalyticsUpgradeCard({
  title,
  description = 'Upgrade your plan to access full analytics history and clean report exports.',
  ctaLabel = 'Upgrade plan',
  onCta,
  className = '',
}: AnalyticsUpgradeCardProps) {
  return (
    <div
      className={`
        rounded-xl border border-dashed border-[rgba(0,0,0,0.1)] bg-[#fafafa] p-5 ${className}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-full bg-neutral-200/80 flex items-center justify-center">
          <Lock size={20} className="text-neutral-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#111827]">{title}</p>
          {description && <p className="text-[13px] text-[#6b7280] mt-1">{description}</p>}
          {ctaLabel && onCta && (
            <button
              type="button"
              onClick={onCta}
              className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-[#5ff6fd] to-[#df44dc] text-neutral-900 font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
