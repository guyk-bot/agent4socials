'use client';

import React from 'react';
import { Lightbulb } from 'lucide-react';

/**
 * Brainstorm: capture ideas across sections, added manually or with AI.
 * Full board (sections, AI add) is built in a later phase.
 */
export default function BrainstormPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-[var(--primary)]/10 p-2 text-[var(--primary)]">
          <Lightbulb size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Brainstorm</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            A space for content ideas, hooks, and campaigns. Add them yourself or generate with AI.
          </p>
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
        <p className="text-sm text-[var(--muted)]">
          The brainstorm board is being set up. You will be able to add ideas to sections manually
          or with AI, just like the composer.
        </p>
      </div>
    </div>
  );
}
