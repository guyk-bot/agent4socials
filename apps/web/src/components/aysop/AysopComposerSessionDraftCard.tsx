'use client';

import React from 'react';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { AysopInlineComposerCard } from '@/components/aysop/AysopInlineComposerCard';

type Draft = Extract<AysopArtifact, { type: 'composer_session_draft' }>;

export function AysopComposerSessionDraftCard({ draft }: { draft: Draft }) {
  return <AysopInlineComposerCard draft={draft} />;
}
