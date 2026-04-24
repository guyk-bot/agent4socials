'use client';

import React, { useEffect, useState, useRef } from 'react';
import { LogoLoadingAnimation } from '@/components/LogoLoadingAnimation';

/** Show loader immediately when loading starts so the default spinner is not shown. */
const DELAY_MS = 0;

type Props = {
  /** When true, we consider "loading". After loading has been true for DELAY_MS, the video overlay is shown. */
  loading: boolean;
  /**
   * When true, overlay is `absolute` within the nearest `relative` parent instead of `fixed` to the viewport.
   * Use on wide dashboard pages so the shell header/sidebar stay clickable and nothing competes with portaled z-9999 layers.
   */
  contained?: boolean;
};

/**
 * Shows the logo loading animation when loading starts (after a short delay if DELAY_MS > 0).
 * If loading finishes before the delay (e.g. cached data), the overlay never appears.
 */
export default function LoadingVideoOverlay({ loading, contained = false }: Props) {
  const [showLoader, setShowLoader] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (loading) {
      if (DELAY_MS <= 0) {
        setShowLoader(true);
      } else {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setShowLoader(true);
        }, DELAY_MS);
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowLoader(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading]);

  if (!showLoader) return null;

  const positionClass = contained
    ? 'absolute inset-0 z-20'
    : 'fixed inset-0 md:top-14 md:left-64 md:right-0 md:bottom-0 z-[300]';

  return (
    <div
      className={`${positionClass} bg-white flex items-center justify-center`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <LogoLoadingAnimation className="w-[min(92vw,680px)] max-w-[min(88vh,520px)]" />
    </div>
  );
}
