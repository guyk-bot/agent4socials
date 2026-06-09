'use client';

import React from 'react';

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
  return (
    <div
      className={`funnel-demo-card pointer-events-auto flex h-full min-h-0 w-full max-w-[400px] 2xl:max-w-[440px] flex-col rounded-xl border border-neutral-200 dark:border-neutral-800 bg-[var(--bg-primary)] shadow-lg transition-opacity duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      } ${entering && visible ? 'funnel-demo-card-enter' : ''}`}
      aria-hidden={!visible}
    >
      <div className="flex shrink-0 items-center border-b border-neutral-200 dark:border-neutral-800 bg-[var(--bg-surface)] px-3 py-2.5">
        <span className="text-sm sm:text-base font-bold text-neutral-800 dark:text-neutral-100 leading-snug">
          {title}
        </span>
      </div>
      <div className="min-h-0 flex-1 px-2.5 py-2.5 space-y-2 bg-[var(--bg-primary)]">
        {children}
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
        className={`max-w-[94%] rounded-2xl rounded-br-md leading-snug aysop-bubble-user whitespace-pre-wrap ${
          visual ? 'p-2 text-[12px] sm:text-[13px]' : 'px-3 py-2.5 text-[13px] sm:text-[14px]'
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
}: {
  children: React.ReactNode;
  show: boolean;
  visual?: boolean;
  wide?: boolean;
}) {
  if (!show) return null;
  return (
    <div className="flex justify-start funnel-demo-message-in">
      <div
        className={`${wide ? 'max-w-[98%]' : 'max-w-[96%]'} rounded-2xl rounded-bl-md leading-snug aysop-bubble-assistant shadow-sm ${
          visual ? 'p-2 text-[12px] sm:text-[13px]' : 'px-3 py-2.5 text-[13px] sm:text-[14px]'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function typewriterSlice(text: string, progress: number, start = 0, end = 1): string {
  const t = Math.max(0, Math.min(1, (progress - start) / (end - start)));
  return text.slice(0, Math.ceil(text.length * t));
}
