'use client';

import React from 'react';
import { PenSquare } from 'lucide-react';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { ComposerOpenLink } from '@/components/aysop/ComposerOpenLink';

type Draft = Extract<AysopArtifact, { type: 'composer_session_draft' }>;

const MEDIA_LABEL: Record<string, string> = {
  text: 'Text',
  photo: 'Photo',
  video: 'Video',
  reel: 'Reel / Short',
  carousel: 'Carousel',
  story: 'Story',
};

export function AysopComposerSessionDraftCard({ draft }: { draft: Draft }) {
  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-[#E8F4FF]/50 dark:bg-[var(--primary)]/10 overflow-hidden text-sm shadow-sm">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--primary)]/20">
        <PenSquare size={16} className="text-[var(--primary)] shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">Composer draft ready</p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {MEDIA_LABEL[draft.mediaType] ?? draft.mediaType} · {draft.platformLabels.join(', ')}
          </p>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1">
            Platforms selected
          </p>
          <div className="flex flex-wrap gap-1.5">
            {draft.platformLabels.map((label) => (
              <span
                key={label}
                className="text-xs px-2 py-1 rounded-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-300"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1">
            Caption
          </p>
          <p className="text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2.5">
            {draft.caption}
          </p>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Open Composer to upload media, tweak the caption, and publish.
        </p>

        <ComposerOpenLink href={draft.composerUrl} draft={draft.draft} label="Open Composer" />
      </div>
    </div>
  );
}
