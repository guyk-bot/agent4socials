'use client';

import React from 'react';
import { CalendarClock, CheckCircle2, RefreshCw } from 'lucide-react';

export function FunnelDemoAllowBar({
  message,
  hint = 'Click Allow or type allow in chat',
  approved = false,
  approvedLabel = 'Allowed',
  showRegenerate = true,
  compact = false,
  prominent = false,
  primaryLabel = 'Allow',
}: {
  message: string;
  hint?: string;
  approved?: boolean;
  approvedLabel?: string;
  showRegenerate?: boolean;
  compact?: boolean;
  prominent?: boolean;
  primaryLabel?: string;
}) {
  if (approved) {
    return (
      <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 size={12} />
        {approvedLabel}
      </p>
    );
  }

  return (
    <div
      className={`space-y-1.5 rounded-lg border border-[#7C3AED]/25 bg-[#7C3AED]/5 dark:border-[#7C3AED]/35 dark:bg-[#7C3AED]/10 ${
        compact ? 'mt-1 px-2 py-1.5' : 'mt-2 px-2 py-2'
      }`}
    >
      <p
        className={`leading-snug text-neutral-800 dark:text-neutral-200 ${
          prominent ? 'text-[13px]' : 'text-[12px]'
        }`}
      >
        {message}
      </p>
      {!compact ? <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn-glass btn-glass-primary inline-flex items-center font-bold ${
            prominent ? 'px-4 py-2 text-[14px]' : 'px-3 py-1.5 text-[12px] font-semibold shadow-sm'
          }`}
        >
          {primaryLabel}
        </button>
        {showRegenerate ? (
          <button
            type="button"
            className={`btn-funnel-lime-cta inline-flex items-center gap-1 rounded-lg font-bold ${
              prominent ? 'px-4 py-2 text-[14px]' : 'px-3 py-1.5 text-[12px] font-semibold'
            }`}
          >
            <RefreshCw size={prominent ? 13 : 11} />
            Regenerate
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FunnelDemoScheduledChip({
  timeLabel,
  platforms,
  calendarHint = 'Preview on Calendar or History anytime.',
}: {
  timeLabel: string;
  platforms: string;
  calendarHint?: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-2 py-1.5 dark:border-emerald-800/50 dark:bg-emerald-950/30">
      <p className="inline-flex items-center gap-1 text-[12px] font-semibold text-emerald-800 dark:text-emerald-200">
        <CalendarClock size={11} />
        Scheduled for {timeLabel} on {platforms}
      </p>
      {calendarHint ? (
        <p className="mt-0.5 text-[11px] text-emerald-700/90 dark:text-emerald-300/90">{calendarHint}</p>
      ) : null}
    </div>
  );
}
