'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';

export function FunnelDemoFrame({
  children,
  visible,
  entering,
}: {
  children: React.ReactNode;
  visible: boolean;
  entering?: boolean;
}) {
  if (!visible) return null;

  return (
    <div
      className={`funnel-demo-card w-[248px] rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-primary)] shadow-lg overflow-hidden ${
        entering ? 'funnel-demo-card-enter' : ''
      }`}
    >
      <div className="flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-[var(--bg-surface)] px-2.5 py-1.5">
        <Sparkles size={12} className="text-[var(--primary)] shrink-0" />
        <span className="text-[10px] font-semibold text-neutral-800 dark:text-neutral-100 truncate">
          {BRAND_NAME} AI
        </span>
      </div>
      <div className="px-2 py-2 space-y-2 max-h-[220px] overflow-hidden bg-[var(--bg-primary)]">{children}</div>
    </div>
  );
}

export function FunnelDemoUserBubble({
  children,
  show,
}: {
  children: React.ReactNode;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex justify-end funnel-demo-message-in">
      <div className="max-w-[92%] rounded-2xl rounded-br-md px-2.5 py-1.5 text-[10px] leading-snug aysop-bubble-user whitespace-pre-wrap">
        {children}
      </div>
    </div>
  );
}

export function FunnelDemoAssistantBubble({
  children,
  show,
}: {
  children: React.ReactNode;
  show: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex justify-start funnel-demo-message-in">
      <div className="max-w-[96%] rounded-2xl rounded-bl-md px-2.5 py-1.5 text-[10px] leading-snug aysop-bubble-assistant shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function typewriterSlice(text: string, progress: number, start = 0, end = 1): string {
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return text.slice(0, Math.ceil(text.length * t));
}
