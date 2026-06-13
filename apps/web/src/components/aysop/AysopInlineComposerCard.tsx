'use client';

import React, { useEffect, useRef } from 'react';
import { PenSquare } from 'lucide-react';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { ComposerOpenLink } from '@/components/aysop/ComposerOpenLink';
import { stageAysopComposerDraft } from '@/lib/composer/aysop-composer-draft-bridge';

type Draft = Extract<AysopArtifact, { type: 'composer_session_draft' }>;

const EMBED_COMPOSER_SRC = '/composer?aysopDraft=1&embed=1';

/** Embedded Composer inside iZop AI chat (same flow as full Composer, staged via sessionStorage). */
export function AysopInlineComposerCard({ draft }: { draft: Draft }) {
  const stagedRef = useRef<string | null>(null);

  useEffect(() => {
    const key = JSON.stringify(draft.draft);
    if (stagedRef.current === key) return;
    stagedRef.current = key;
    stageAysopComposerDraft(draft.draft);
  }, [draft.draft]);

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-white dark:bg-neutral-900 overflow-hidden text-sm shadow-sm">
      <div className="px-3 py-2 flex items-center justify-between gap-2 border-b border-[var(--primary)]/20 bg-[#E8F4FF]/50 dark:bg-[var(--primary)]/10">
        <div className="flex items-center gap-2 min-w-0">
          <PenSquare size={16} className="text-[var(--primary)] shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
              Composer
            </p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
              {draft.platformLabels.join(', ')}
            </p>
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
        title="Composer"
        src={EMBED_COMPOSER_SRC}
        className="w-full border-0 bg-[var(--background)]"
        style={{ height: 'min(72vh, 720px)' }}
        allow="clipboard-write"
      />
      <p className="px-3 py-2 text-[11px] text-neutral-500 dark:text-neutral-400 border-t border-neutral-100 dark:border-neutral-800">
        Same options as full Composer: platforms, caption, media, schedule, and publish.
      </p>
    </div>
  );
}
