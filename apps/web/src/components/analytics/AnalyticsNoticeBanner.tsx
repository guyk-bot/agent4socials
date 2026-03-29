'use client';

import React from 'react';
import { Info, AlertCircle } from 'lucide-react';

export type NoticeVariant = 'info' | 'permissions' | 'upgrade';

export interface AnalyticsNoticeBannerProps {
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
  variant?: NoticeVariant;
  className?: string;
}

const VARIANT_STYLES: Record<NoticeVariant, { bg: string; border: string; icon: string; title: string }> = {
  info: {
    bg: 'bg-[#f0f9ff]',
    border: 'border-[#bae6fd]',
    icon: 'text-[#0284c7]',
    title: 'text-[#0c4a6e]',
  },
  permissions: {
    bg: 'bg-[#eff6ff]',
    border: 'border-[#93c5fd]',
    icon: 'text-[#2563eb]',
    title: 'text-[#1e40af]',
  },
  upgrade: {
    bg: 'bg-[#fafafa]',
    border: 'border-[rgba(0,0,0,0.1)]',
    icon: 'text-[#6b7280]',
    title: 'text-[#374151]',
  },
};

export function AnalyticsNoticeBanner({
  title,
  description,
  ctaLabel,
  onCta,
  variant = 'info',
  className = '',
}: AnalyticsNoticeBannerProps) {
  const s = VARIANT_STYLES[variant];
  return (
    <div className={`rounded-xl border px-4 py-3 ${s.bg} ${s.border} ${className}`}>
      <div className="flex items-start gap-3">
        <span className={`shrink-0 mt-0.5 ${s.icon}`}>
          {variant === 'upgrade' ? <AlertCircle size={20} /> : <Info size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${s.title}`}>{title}</p>
          {description && <p className="text-[13px] text-[#6b7280] mt-0.5">{description}</p>}
          {ctaLabel && onCta && (
            <button
              type="button"
              onClick={onCta}
              className="mt-3 px-4 py-2 rounded-lg bg-[#111827] text-white text-sm font-medium hover:bg-[#374151] transition-colors"
            >
              {ctaLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
