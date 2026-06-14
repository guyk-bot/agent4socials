'use client';

import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { diffBrandContextText } from '@/lib/brand-context-diff';
import { GlassButton } from '@/components/ui/GlassButton';
import { BrandContextSavedCelebration } from '@/components/aysop/BrandContextSavedCelebration';
import { useAuth } from '@/context/AuthContext';
import {
  markBrandContextArtifactApproved,
  readBrandContextArtifactApproved,
} from '@/lib/ai/brand-context-artifact-state';
import {
  markBrandContextSaved,
  parseBrandContextApiPayload,
  readBrandContextCache,
  writeBrandContextCache,
  writeComposerBrandReadyCache,
  hasComposerBrandContext,
  type BrandContextRecord,
} from '@/lib/brand-context-utils';

type Artifact = Extract<AysopArtifact, { type: 'brand_context_update' }>;

const FIELD_MAX: Record<string, number> = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
  inboxReplyExamples: 1000,
  commentReplyExamples: 1000,
};

function truncateField(value: string, field: string): string {
  const max = FIELD_MAX[field] ?? 2000;
  const t = value.trim();
  return t.length > max ? t.slice(0, max) : t;
}

function DiffPreview({ current, proposed }: { current: string; proposed: string }) {
  const segs = diffBrandContextText(current, proposed);
  const changed = segs.some((s) => s.type !== 'same');

  if (!changed && !current) {
    return <p className="mt-0.5 text-xs italic text-neutral-400">Currently empty</p>;
  }

  if (!changed) {
    return <p className="mt-0.5 text-xs text-neutral-500">No visible changes in this field.</p>;
  }

  const nodes: React.ReactNode[] = [];
  let skippedSame = 0;

  const flushSkipped = () => {
    if (skippedSame > 0) {
      nodes.push(
        <p key={`skip-${nodes.length}`} className="text-[10px] italic text-neutral-400 py-0.5">
          … {skippedSame} unchanged line{skippedSame === 1 ? '' : 's'} …
        </p>
      );
      skippedSame = 0;
    }
  };

  for (const seg of segs) {
    if (seg.type === 'same') {
      skippedSame += 1;
      continue;
    }
    flushSkipped();
    if (seg.type === 'del') {
      nodes.push(
        <p
          key={`del-${nodes.length}`}
          className="whitespace-pre-wrap break-words rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-800 line-through decoration-red-400 dark:bg-red-950/40 dark:text-red-300"
        >
          {seg.text}
        </p>
      );
    } else {
      nodes.push(
        <p
          key={`add-${nodes.length}`}
          className="whitespace-pre-wrap break-words rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          {seg.text}
        </p>
      );
    }
  }
  flushSkipped();

  return <div className="mt-0.5 space-y-1">{nodes}</div>;
}

type Props = {
  artifact: Artifact;
  messageId: string;
  artifactIndex: number;
  onArtifactResolved?: (patch: {
    approvedAt?: string;
    dismissedAt?: string;
    resumeDismissedAt?: string;
  }) => void;
  onQuickReply?: (message: string) => void;
  quickReplyDisabled?: boolean;
};

export function AysopBrandContextUpdateCard({
  artifact,
  messageId,
  artifactIndex,
  onArtifactResolved,
  onQuickReply,
  quickReplyDisabled,
}: Props) {
  const { user } = useAuth();
  const initialApprovedAt =
    artifact.approvedAt ?? readBrandContextArtifactApproved(user?.id, messageId, artifactIndex);

  const initial = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of artifact.changes) map[c.field] = c.proposed;
    return map;
  }, [artifact.changes]);

  const [values, setValues] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error' | 'dismissed'>(() =>
    artifact.dismissedAt ? 'dismissed' : initialApprovedAt ? 'saved' : 'idle'
  );
  const [error, setError] = useState<string | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const buildPayload = (): BrandContextRecord => {
    const payload: BrandContextRecord = {};
    for (const c of artifact.changes) {
      const raw = values[c.field] ?? c.proposed;
      const trimmed = truncateField(raw, c.field);
      (payload as Record<string, string | null>)[c.field] = trimmed || null;
    }
    return payload;
  };

  const approve = async () => {
    setError(null);
    setSyncWarning(null);
    markBrandContextSaved();

    const payload = buildPayload();
    const mergedPayload: BrandContextRecord = {
      ...(user?.id ? parseBrandContextApiPayload(readBrandContextCache(user.id) ?? {}) : {}),
      ...payload,
    };
    const approvedAt = markBrandContextArtifactApproved(user?.id, messageId, artifactIndex);
    onArtifactResolved?.({ approvedAt });

    if (user?.id) {
      writeBrandContextCache(mergedPayload, user.id);
      writeComposerBrandReadyCache(hasComposerBrandContext(mergedPayload));
    }
    setStatus('saved');

    const doPut = () => api.put('/ai/brand-context', mergedPayload, { timeout: 30_000 });

    try {
      const res = await doPut();
      markBrandContextSaved();
      if (user?.id) {
        const saved = parseBrandContextApiPayload(res.data);
        writeBrandContextCache(saved, user.id);
        writeComposerBrandReadyCache(hasComposerBrandContext(saved));
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string }; status?: number }; message?: string };
      const statusCode = err.response?.status;
      const msg =
        err.response?.data?.message ??
        (statusCode === 401
          ? 'Please log in again.'
          : 'Could not sync to the server. Your brand context is saved on this device.');

      if (statusCode === 500 || statusCode === undefined) {
        try {
          await new Promise((r) => setTimeout(r, 1500));
          const retry = await doPut();
          markBrandContextSaved();
          if (user?.id) {
            writeBrandContextCache(parseBrandContextApiPayload(retry.data), user.id);
          }
          return;
        } catch {
          /* fall through */
        }
      }

      setSyncWarning(msg);
    }
  };

  if (status === 'dismissed') return null;

  const isSetup = artifact.changes.every((c) => !c.current.trim());

  if (status === 'saved') {
    return (
      <>
        {syncWarning ? (
          <p className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            {syncWarning}
          </p>
        ) : null}
        <BrandContextSavedCelebration
          isSetup={isSetup}
          resumeIntent={artifact.resumeIntent}
          resumeDismissed={Boolean(artifact.resumeDismissedAt)}
          quickReplyDisabled={quickReplyDisabled}
          onResume={
            onQuickReply && artifact.resumeIntent && !artifact.resumeDismissedAt
              ? () => onQuickReply("Let's upload")
              : undefined
          }
          onCancelResume={
            onArtifactResolved && artifact.resumeIntent && !artifact.resumeDismissedAt
              ? () => onArtifactResolved({ resumeDismissedAt: new Date().toISOString() })
              : undefined
          }
        />
      </>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-white dark:bg-neutral-900 p-3 text-sm">
      <p className="font-semibold text-neutral-900 dark:text-neutral-100">
        {isSetup ? 'Set up brand context' : 'Update brand context?'}
      </p>
      <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
        {isSetup
          ? 'Review the draft below, edit if needed, then tap Approve to save.'
          : 'Only the highlighted lines below will change. Edit if needed, then Approve to save.'}
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
        <GlassButton variant="primary" size="sm" onClick={() => void approve()}>
          <Check size={13} /> Approve
        </GlassButton>
        <GlassButton
          variant="secondary"
          size="sm"
          onClick={() => {
            onArtifactResolved?.({ dismissedAt: new Date().toISOString() });
            setStatus('dismissed');
          }}
        >
          <X size={13} /> Discard
        </GlassButton>
      </div>
    </div>
  );
}
