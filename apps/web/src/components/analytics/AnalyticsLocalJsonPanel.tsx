'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { Check, ChevronDown, Copy } from 'lucide-react';

type Props = {
  title: string;
  description?: string;
  data: unknown;
};

/**
 * Collapsible JSON viewer for data already in memory (no extra API call).
 */
export function AnalyticsLocalJsonPanel({ title, description, data }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied */
    }
  }, [text]);

  return (
    <div
      className="rounded-xl border p-4 sm:p-5 space-y-3"
      style={{
        borderColor: 'rgba(99, 102, 241, 0.22)',
        background: 'linear-gradient(180deg, rgba(249,250,255,0.98), rgba(255,255,255,0.96))',
        boxShadow: '0 2px 12px rgba(15,23,42,0.04)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left rounded-xl px-1 py-0.5 -mx-1 hover:bg-indigo-50/70 transition-colors"
      >
        <div className="min-w-0">
          <h4 className="text-base font-semibold text-neutral-900">{title}</h4>
          {description ? (
            <p className="text-xs text-neutral-600 mt-0.5 max-w-[820px]">{description}</p>
          ) : null}
        </div>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-indigo-700 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-50"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre
            className="text-[11px] leading-relaxed overflow-x-auto max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border border-neutral-200 bg-neutral-950 text-emerald-100/95 p-3 sm:p-4 font-mono"
            tabIndex={0}
          >
            {text}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
