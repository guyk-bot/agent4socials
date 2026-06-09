'use client';

import React from 'react';

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
  featured = false,
}: {
  children: React.ReactNode;
  visible: boolean;
  entering?: boolean;
  title: string;
  progress?: number;
  featured?: boolean;
}) {
  const titleReady = visible && (entering || progress > 0.02);
  const contentVisible = progress > 0.22;

  return (
    <div
      className={`funnel-demo-card funnel-demo-card--hero pointer-events-auto flex h-full min-h-0 w-full max-w-[400px] 2xl:max-w-[440px] flex-col overflow-hidden transition-opacity duration-300 ${
        featured ? 'funnel-demo-card--featured' : ''
      } ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${
        entering && visible ? 'funnel-demo-card-enter' : ''
      }`}
      aria-hidden={!visible}
    >
      <div className="funnel-demo-card__header shrink-0">
        <span className="funnel-demo-card__label">Feature</span>
        <span className={`funnel-demo-card__title ${titleReady ? 'funnel-demo-title-pop' : 'opacity-0'}`}>
          {title}
        </span>
      </div>
      <div className="funnel-demo-card__body min-h-0 flex-1 overflow-hidden">
        <div
          className={`flex min-h-0 flex-col gap-2 overflow-hidden transition-opacity duration-300 ${
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
