'use client';

import React from 'react';
import { PenSquare } from 'lucide-react';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { PlatformPostPreviewGrid, type PlatformPostPreview } from '@/components/shared/PlatformPostPreviewSquare';
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

const PLATFORM_ACCENT: Record<string, string> = {
  TWITTER: 'bg-neutral-900',
  FACEBOOK: 'bg-[#1877F2]',
  LINKEDIN: 'bg-[#0A66C2]',
  THREADS: 'bg-neutral-900',
  INSTAGRAM: 'bg-gradient-to-r from-[#E1306C] to-[#FCAF45]',
  TIKTOK: 'bg-neutral-900',
  YOUTUBE: 'bg-[#FF0000]',
  PINTEREST: 'bg-[#E60023]',
};

export function AysopComposerSessionDraftCard({ draft }: { draft: Draft }) {
  const previews: PlatformPostPreview[] = draft.platformLabels.map((label, i) => ({
    platformLabel: label,
    accentClass: PLATFORM_ACCENT[draft.platforms[i]?.toUpperCase() ?? ''] ?? 'bg-[var(--primary)]',
    caption: draft.caption,
  }));

  return (
    <div className="rounded-xl border border-[var(--primary)]/30 bg-[#E8F4FF]/50 dark:bg-[var(--primary)]/10 overflow-hidden text-sm shadow-sm">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--primary)]/20">
        <PenSquare size={16} className="text-[var(--primary)] shrink-0" />
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900 dark:text-neutral-100">Create draft, post / schedule</p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {MEDIA_LABEL[draft.mediaType] ?? draft.mediaType} · {draft.platformLabels.join(', ')}
          </p>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1.5">
            Platform previews
          </p>
          <PlatformPostPreviewGrid previews={previews} />
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1">
            Caption
          </p>
          <p className="text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 p-2.5 text-xs">
            {draft.caption}
          </p>
        </div>

        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Open Composer to upload media, tweak captions, and schedule. Preview scheduled posts on Calendar or History.
        </p>

        <ComposerOpenLink href={draft.composerUrl} draft={draft.draft} label="Open Composer" />
      </div>
    </div>
  );
}
