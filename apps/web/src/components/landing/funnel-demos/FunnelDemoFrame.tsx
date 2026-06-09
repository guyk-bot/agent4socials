'use client';

import React from 'react';
import { BRAND_LIME_DOT } from './funnel-demo-assets';

/** Scene progress after headline intro (first ~22% of card timeline). */
export function funnelDemoContentProgress(progress: number): number {
  if (progress <= 0.22) return 0;
  return Math.min(1, (progress - 0.22) / 0.78);
}

export function FunnelDemoFrame({
  children,
  visible,
  entering,
  title,
  progress = 1,
}: {
  children: React.ReactNode;
  visible: boolean;
  entering?: boolean;
  title: string;
  progress?: number;
}) {
  const titleReady = visible && (entering || progress > 0.02);
  const contentVisible = progress > 0.22;

  return (
    <div
      className={`funnel-demo-card pointer-events-auto flex h-full min-h-0 w-full max-w-[400px] 2xl:max-w-[440px] flex-col overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-primary)] shadow-lg transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${entering && visible ? 'funnel-demo-card-enter' : ''}`}
      aria-hidden={!visible}
    >
      <div
        className="flex shrink-0 items-center overflow-hidden border-b-2 border-black/10 px-3 py-3"
        style={{ backgroundColor: BRAND_LIME_DOT }}
      >
        <span
          className={`text-base sm:text-lg font-black tracking-tight leading-snug text-[#0a0a0a] dark:text-[#0a0a0a] ${
            titleReady ? 'funnel-demo-title-pop' : 'opacity-0'
          }`}
        >
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-2.5 py-2.5 bg-[var(--bg-primary)]">
        <div
          className={`flex h-full min-h-0 flex-col gap-2 overflow-y-auto overflow-x-hidden overscroll-contain transition-opacity duration-300 ${
            contentVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function FunnelDemoUserBubble({
  children,
  show,
  visual,
}: {
  children: React.ReactNode;
  show: boolean;
  visual?: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex justify-end funnel-demo-message-in">
      <div
        className={`${visual ? 'max-w-[98%]' : 'max-w-[94%]'} rounded-2xl rounded-br-md leading-snug aysop-bubble-user whitespace-pre-wrap ${
          visual ? 'p-1.5 text-[12px] sm:text-[13px]' : 'px-3 py-2.5 text-[13px] sm:text-[14px]'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function FunnelDemoAssistantBubble({
  children,
  show,
  visual,
  wide,
  contained,
}: {
  children: React.ReactNode;
  show: boolean;
  visual?: boolean;
  wide?: boolean;
  contained?: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex min-h-0 shrink justify-start funnel-demo-message-in">
      <div
        className={`${wide ? 'max-w-[98%]' : 'max-w-[96%]'} min-w-0 rounded-2xl rounded-bl-md leading-snug aysop-bubble-assistant shadow-sm ${
          visual ? 'p-2 text-[12px] sm:text-[13px]' : 'px-3 py-2.5 text-[13px] sm:text-[14px]'
        } ${contained ? 'max-h-[min(100%,240px)] overflow-hidden flex flex-col' : ''}`}
      >
        <div className={contained ? 'min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain' : undefined}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function typewriterSlice(text: string, progress: number, start = 0, end = 1): string {
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return text.slice(0, Math.ceil(text.length * t));
}
