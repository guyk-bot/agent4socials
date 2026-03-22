'use client';

import Image from 'next/image';

/** Full-viewport loading state: app logo + light ring (not a generic platform-colored spinner). */
export function BrandedPageLoader({ message }: { message: string }) {
  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 px-4">
      <div className="relative flex h-[4.5rem] w-[4.5rem] items-center justify-center" aria-busy="true" aria-live="polite">
        <span
          className="absolute inset-0 rounded-full border-2 border-neutral-200 border-t-violet-600 animate-spin opacity-70"
          aria-hidden
        />
        <Image
          src="/logo.svg"
          alt="Agent4Socials"
          width={48}
          height={48}
          className="relative h-12 w-12 object-contain [background:transparent]"
          priority
        />
      </div>
      <p className="text-neutral-600 text-sm">{message}</p>
    </div>
  );
}
