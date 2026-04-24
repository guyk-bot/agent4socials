'use client';

import { LogoLoadingAnimation } from '@/components/LogoLoadingAnimation';

/** Full-viewport loading state: branded logo animation + optional status line. */
export function BrandedPageLoader({ message }: { message: string }) {
  return (
    <div
      className="min-h-[80vh] flex flex-col items-center justify-center gap-4 px-4"
      aria-busy="true"
      aria-live="polite"
    >
      <LogoLoadingAnimation className="w-[min(92vw,680px)] max-w-[min(88vh,520px)]" />
      <p className="text-neutral-600 text-sm">{message}</p>
    </div>
  );
}
