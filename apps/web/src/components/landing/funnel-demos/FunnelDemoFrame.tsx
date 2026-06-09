'use client';

import React from 'react';
import { siteLogoSrcForTheme } from '@/lib/site-brand-assets';
import { useTheme } from '@/context/ThemeContext';

export function FunnelDemoFrame({
  children,
  visible,
  entering,
  title,
}: {
  children: React.ReactNode;
  visible: boolean;
  entering?: boolean;
  title: string;
}) {
  const { theme } = useTheme();
  const logoSrc = siteLogoSrcForTheme(theme);

  return (
    <div
      className={`funnel-demo-card pointer-events-auto flex h-[300px] w-[372px] 2xl:h-[320px] 2xl:w-[412px] flex-col rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-primary)] shadow-lg transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${entering && visible ? 'funnel-demo-card-enter' : ''}`}
      aria-hidden={!visible}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 bg-[var(--bg-surface)] px-3 py-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt=""
          className="h-5 w-5 shrink-0 object-contain bg-transparent"
        />
        <span className="text-[11px] sm:text-xs font-semibold text-neutral-800 dark:text-neutral-100 leading-snug">
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-2.5 space-y-2 bg-[var(--bg-primary)]">
        {children}
      </div>
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
      <div className="max-w-[92%] rounded-2xl rounded-br-md px-3 py-2 text-[11px] sm:text-[12px] leading-snug aysop-bubble-user whitespace-pre-wrap">
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
      <div className="max-w-[96%] rounded-2xl rounded-bl-md px-3 py-2 text-[11px] sm:text-[12px] leading-snug aysop-bubble-assistant shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function typewriterSlice(text: string, progress: number, start = 0, end = 1): string {
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return text.slice(0, Math.ceil(text.length * t));
}
