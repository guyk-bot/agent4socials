'use client';

import { useEffect, useRef } from 'react';

/** Same asset as `LoadingVideoOverlay` (`apps/web/public/logo-loading-page.mp4`). */
const LOGO_LOADING_VIDEO = '/logo-loading-page.mp4';

/** Full-viewport loading state: branded logo loop video + optional status line. */
export function BrandedPageLoader({ message }: { message: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <div
      className="min-h-[80vh] flex flex-col items-center justify-center gap-4 px-4"
      aria-busy="true"
      aria-live="polite"
    >
      <video
        ref={videoRef}
        src={LOGO_LOADING_VIDEO}
        className="w-[min(92vw,680px)] h-auto max-h-[min(88vh,520px)] object-contain"
        autoPlay
        muted
        playsInline
        loop
        aria-label="Loading"
      />
      <p className="text-neutral-600 text-sm">{message}</p>
    </div>
  );
}
