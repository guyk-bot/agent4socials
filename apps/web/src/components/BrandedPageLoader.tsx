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
      <LogoLoadingAnimation className="w-[min(40vw,200px)] max-w-[200px] sm:w-[min(32vw,220px)] sm:max-w-[220px]" />
      <p className="text-neutral-600 text-sm">{message}</p>
    </div>
  );
}
