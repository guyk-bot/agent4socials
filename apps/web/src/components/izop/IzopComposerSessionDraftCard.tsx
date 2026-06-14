'use client';

import React from 'react';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import { IzopInlineComposerCard } from '@/components/izop/IzopInlineComposerCard';

type Draft = Extract<IzopArtifact, { type: 'composer_session_draft' }>;

export function IzopComposerSessionDraftCard({ draft }: { draft: Draft }) {
  return <IzopInlineComposerCard draft={draft} />;
}
