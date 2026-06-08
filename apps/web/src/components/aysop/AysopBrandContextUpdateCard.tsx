'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

type Artifact = Extract<AysopArtifact, { type: 'brand_context_update' }>;

type DiffSeg = { type: 'same' | 'add' | 'del'; text: string };

function tokenize(s: string): string[] {
  return s.match(/\s+|\S+/g) ?? [];
}

/** Word-level diff so only what actually changed is highlighted (not the whole field). */
function diffTokens(oldStr: string, newStr: string): DiffSeg[] {
  const a = tokenize(oldStr);
  const b = tokenize(newStr);
  const n = a.length;
  const m = b.length;

  // Guard against pathological sizes; fall back to whole-value replace.
  if (n * m > 400_000) {
    const segs: DiffSeg[] = [];
    if (oldStr) segs.push({ type: 'del', text: oldStr });
    if (newStr) segs.push({ type: 'add', text: newStr });
    return segs;
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }

  const segs: DiffSeg[] = [];
  const push = (type: DiffSeg['type'], text: string) => {
    const last = segs[segs.length - 1];
    if (last && last.type === type) last.text += text;
    else segs.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', a[i]!);
      i++;
    } else {
      push('add', b[j]!);
      j++;
    }
  }
  while (i < n) push('del', a[i++]!);
  while (j < m) push('add', b[j++]!);
  return segs;
}

function DiffPreview({ current, proposed }: { current: string; proposed: string }) {
  const segs = diffTokens(current, proposed);
  const changed = segs.some((s) => s.type !== 'same');
  return (
    <div className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
      {!changed && !current ? <span className="italic text-neutral-400">Currently empty</span> : null}
      {segs.map((seg, k) => {
        if (seg.type === 'same') return <span key={k}>{seg.text}</span>;
        if (seg.type === 'del') {
          return (
            <span
              key={k}
              className="rounded bg-red-100 text-red-700 line-through decoration-red-400 dark:bg-red-950/40 dark:text-red-300"
            >
              {seg.text}
            </span>
          );
        }
        return (
          <span key={k} className="rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
            {seg.text}
          </span>
        );
      })}
    </div>
  );
}

export function AysopBrandContextUpdateCard({ artifact }: { artifact: Artifact }) {
  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of artifact.changes) map[c.field] = c.proposed;
    return map;
  }, [artifact.changes]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error' | 'dismissed'>('idle');
  const [error, setError] = useState<string | null>(null);

  const approve = async () => {
    setStatus('saving');
    setError(null);
    try {
      const payload: Record<string, string> = {};
      for (const c of artifact.changes) {
        payload[c.field] = values[c.field] ?? c.proposed;
      }
      await api.put('/ai/brand-context', payload);
      setStatus('saved');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not save brand context. Try again.';
      setError(msg);
      setStatus('error');
    }
  };

  if (status === 'dismissed') return null;

  if (status === 'saved') {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-3 text-sm text-emerald-900 dark:text-emerald-200">
        <p className="flex items-center gap-1.5 font-medium">
          <Check size={15} /> Brand context updated
        </p>
        <p className="mt-1 text-xs text-emerald-800/80 dark:text-emerald-300/80">
          Your new brand details now power AI captions, replies, and outreach across the app.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-white dark:bg-neutral-900 p-3 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-neutral-900 dark:text-neutral-100">
        <Sparkles size={15} className="text-[var(--primary)]" /> Update brand context?
      </p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        Review the changes below. Edit anything, then Approve to save. Nothing changes until you approve.
      </p>

      <div className="mt-3 space-y-3">
        {artifact.changes.map((c) => (
          <div key={c.field}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {c.label}
            </p>
            <DiffPreview current={c.current} proposed={values[c.field] ?? c.proposed} />
            <textarea
              value={values[c.field] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [c.field]: e.target.value }))}
              rows={Math.min(6, Math.max(2, Math.ceil((values[c.field]?.length ?? 0) / 60)))}
              aria-label={`Edit ${c.label}`}
              className="mt-1.5 w-full resize-y rounded-lg border border-[var(--primary)]/30 bg-[var(--bg-surface,#fff)] dark:bg-neutral-800 px-2.5 py-1.5 text-xs text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
            />
          </div>
        ))}
      </div>

      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => void approve()}
          disabled={status === 'saving'}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {status === 'saving' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {status === 'saving' ? 'Saving…' : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => setStatus('dismissed')}
          disabled={status === 'saving'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
        >
          <X size={13} /> Discard
        </button>
      </div>
    </div>
  );
}
