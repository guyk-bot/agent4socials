'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { PenSquare } from 'lucide-react';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import { ComposerOpenLink } from '@/components/izop/ComposerOpenLink';
import { stageIzopComposerDraft } from '@/lib/composer/izop-composer-draft-bridge';
import { useTheme } from '@/context/ThemeContext';

type Draft = Extract<IzopArtifact, { type: 'composer_session_draft' }>;

/** Embedded Composer inside iZop AI chat (same flow as full Composer, staged via sessionStorage). */
export function IzopInlineComposerCard({ draft }: { draft: Draft }) {
  const stagedRef = useRef<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { theme } = useTheme();

  const embedSrc = useMemo(
    () => `/composer?izopDraft=1&embed=1&theme=${theme}`,
    [theme]
  );

  useEffect(() => {
    const key = JSON.stringify(draft.draft);
    if (stagedRef.current === key) return;
    stagedRef.current = key;
    stageIzopComposerDraft(draft.draft);
  }, [draft.draft]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'izop-theme', theme }, window.location.origin);
  }, [theme, embedSrc]);

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-[var(--card-bg)] overflow-hidden text-sm shadow-sm">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-[var(--primary)]/20 bg-[var(--surface-soft)]">
        <div className="flex items-center gap-2 min-w-0">
          <PenSquare size={16} className="text-[var(--primary)] shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-[var(--foreground)] truncate">Composer</p>
            <p className="text-[11px] text-[var(--muted)] truncate">{draft.platformLabels.join(', ')}</p>
          </div>
        </div>
        <ComposerOpenLink
          href={draft.composerUrl}
          draft={draft.draft}
          label="Full page"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline shrink-0"
        />
      </div>
      <iframe
        ref={iframeRef}
        title="Composer"
        src={embedSrc}
        className="w-full border-0 bg-[var(--background)]"
        style={{ height: 'min(72vh, 720px)' }}
        allow="clipboard-write"
      />
      <p className="px-3 py-2 text-[11px] text-[var(--muted)] border-t border-[var(--border)]">
        Same options as full Composer: platforms, caption, media, schedule, and publish.
      </p>
    </div>
  );
}
