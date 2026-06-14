'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { GlassButton } from '@/components/ui/GlassButton';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

type ResumeIntent = NonNullable<
  Extract<AysopArtifact, { type: 'brand_context_update' }>['resumeIntent']
>;

type Props = {
  isSetup?: boolean;
  resumeIntent?: ResumeIntent | null;
  resumeDismissed?: boolean;
  onResume?: () => void;
  onCancelResume?: () => void;
  quickReplyDisabled?: boolean;
};

export function BrandContextSavedCelebration({
  isSetup,
  resumeIntent,
  resumeDismissed,
  onResume,
  onCancelResume,
  quickReplyDisabled,
}: Props) {
  const showResume = Boolean(resumeIntent && !resumeDismissed);

  return (
    <div className="brand-context-saved-celebration relative overflow-hidden rounded-xl border border-emerald-200/80 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 via-white to-violet-50/50 dark:from-emerald-950/50 dark:via-neutral-900 dark:to-violet-950/20 p-4 text-sm text-neutral-800 dark:text-neutral-100">
      <div className="relative z-10 flex items-start gap-3">
        <div className="brand-context-saved-check-wrap shrink-0">
          <Check size={20} className="brand-context-saved-check-icon" strokeWidth={2.75} />
        </div>
        <div className="min-w-0 space-y-2">
          <p className="font-semibold text-emerald-900 dark:text-emerald-100">
            {isSetup ? 'Brand context saved' : 'Brand context updated'}
          </p>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            Thank you for submitting your brand context. Now I can help you with AI captions, replies,
            outreach, brainstorm ideas, and anything else you need for your socials.
          </p>
          <p className="text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            You can always edit your brand context by asking me to change things, or manually on the{' '}
            <span className="font-medium text-neutral-600 dark:text-neutral-300">Brand</span> page. We
            will pick up right where you left off.
          </p>

          {showResume ? (
            <div className="pt-2 space-y-3">
              <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Do you want me to generate captions and upload your last post to{' '}
                {resumeIntent!.platformLabel} as you asked?
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <GlassButton
                  variant="primary"
                  size="md"
                  disabled={quickReplyDisabled || !onResume}
                  onClick={onResume}
                >
                  Let&apos;s upload
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  size="md"
                  disabled={quickReplyDisabled || !onCancelResume}
                  onClick={onCancelResume}
                >
                  Cancel
                </GlassButton>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
