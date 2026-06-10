'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';

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
  titleIcon: TitleIcon,
  progress = 1,
  staticMode = false,
}: {
  children: React.ReactNode;
  visible: boolean;
  entering?: boolean;
  title: string;
  titleIcon?: LucideIcon;
  progress?: number;
  staticMode?: boolean;
}) {
  const titleReady = staticMode || (visible && (entering || progress > 0.02));
  const contentVisible = staticMode || progress > 0.22;

  return (
    <div
      className={`funnel-demo-card pointer-events-auto flex h-full min-h-0 w-full max-w-[var(--funnel-side-w,538px)] 2xl:max-w-[var(--funnel-side-w-2xl,600px)] flex-col overflow-hidden rounded-xl border-2 border-neutral-200 bg-[var(--bg-primary)] shadow-md dark:border-neutral-700 ${
        staticMode ? 'funnel-demo-card--static' : ''
      } ${visible || staticMode ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${
        !staticMode && entering && visible ? 'funnel-demo-card-enter' : ''
      }`}
      aria-hidden={!visible && !staticMode}
    >
      <div className="shrink-0 px-3.5 pt-3.5 pb-2.5">
        <span
          className={`flex items-start gap-2.5 text-lg font-black leading-snug tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-xl ${
            titleReady ? 'funnel-demo-title-pop' : 'opacity-0'
          }`}
        >
          {TitleIcon ? (
            <span
              className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-md bg-[#7C3AED]/10 p-1.5 text-[#7C3AED] dark:bg-[#7C3AED]/20 dark:text-[#A78BFA]"
              aria-hidden
            >
              <TitleIcon size={22} strokeWidth={2.25} />
            </span>
          ) : null}
          <span className="min-w-0 flex-1 break-words">{title}</span>
        </span>
      </div>
      <div className="funnel-demo-card-body-scroll min-h-0 flex-1 px-3 pb-3 bg-[var(--bg-primary)]">
        <div
          className={`flex min-h-0 flex-col gap-2.5 transition-opacity duration-300 ${
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
          visual ? 'p-2 text-[17px] sm:text-[18px]' : 'px-3.5 py-3 text-[17px] sm:text-[18px]'
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
  allowOverflow,
}: {
  children: React.ReactNode;
  show: boolean;
  visual?: boolean;
  wide?: boolean;
  contained?: boolean;
  /** Let hover popups (charts) extend outside the bubble without clipping. */
  allowOverflow?: boolean;
}) {
  if (!show) return null;
  const overflowClass = allowOverflow ? 'overflow-visible' : 'overflow-hidden';
  return (
    <div className="flex min-h-0 shrink justify-start funnel-demo-message-in">
      <div
        className={`${wide ? 'max-w-[98%]' : 'max-w-[96%]'} min-w-0 rounded-2xl rounded-bl-md leading-snug aysop-bubble-assistant shadow-sm ${
          visual ? 'p-2.5 text-[17px] sm:text-[18px]' : 'px-3.5 py-3 text-[17px] sm:text-[18px]'
        } ${contained ? `max-h-[min(100%,475px)] ${overflowClass} flex flex-col min-h-0` : ''}`}
      >
        <div className={contained ? `min-h-0 flex-1 flex flex-col ${overflowClass}` : undefined}>
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
