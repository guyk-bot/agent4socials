'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AuthenticatedShell from '@/components/AuthenticatedShell';

function ComposerRouteFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
      <p className="text-sm font-medium text-neutral-600">Loading composer…</p>
      <p className="text-xs text-neutral-400">Preparing your workspace</p>
    </div>
  );
}

function ComposerLayoutInner({ children }: { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === '1';

  if (isEmbed) {
    return (
      <div className="composer-embed-shell min-h-0 bg-[var(--background)] text-[var(--foreground)]">
        <Suspense fallback={<ComposerRouteFallback />}>{children}</Suspense>
      </div>
    );
  }

  return (
    <AuthenticatedShell>
      <Suspense fallback={<ComposerRouteFallback />}>{children}</Suspense>
    </AuthenticatedShell>
  );
}

export default function ComposerLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<ComposerRouteFallback />}>
      <ComposerLayoutInner>{children}</ComposerLayoutInner>
    </Suspense>
  );
}
