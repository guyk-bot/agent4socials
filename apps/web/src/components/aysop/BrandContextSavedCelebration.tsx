'use client';

import React from 'react';
import { Check, Sparkles } from 'lucide-react';

export function BrandContextSavedCelebration({ isSetup }: { isSetup?: boolean }) {
  return (
    <div className="brand-context-saved-celebration relative overflow-hidden rounded-xl border border-emerald-200/80 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/60 dark:from-emerald-950/50 dark:via-neutral-900 dark:to-emerald-950/30 p-4 text-sm text-emerald-900 dark:text-emerald-100">
      <span className="brand-context-saved-sparkle brand-context-saved-sparkle-1" aria-hidden>
        <Sparkles size={14} />
      </span>
      <span className="brand-context-saved-sparkle brand-context-saved-sparkle-2" aria-hidden>
        <Sparkles size={12} />
      </span>
      <span className="brand-context-saved-sparkle brand-context-saved-sparkle-3" aria-hidden>
        <Sparkles size={10} />
      </span>

      <div className="relative z-10 flex items-start gap-3">
        <div className="brand-context-saved-check-wrap shrink-0">
          <Check size={18} className="brand-context-saved-check-icon" strokeWidth={2.5} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">
            {isSetup ? 'Brand context is live' : 'Brand context updated'}
          </p>
          <p className="mt-1 text-xs text-emerald-800/85 dark:text-emerald-300/85">
            Your brand voice is saved across iZop AI, Composer, and Inbox drafts.
          </p>
        </div>
      </div>
    </div>
  );
}
