'use client';

import React, { useEffect, useState, useRef } from 'react';
import { LogoLoadingAnimation } from '@/components/LogoLoadingAnimation';
import { ZThinkingLoopAnimation } from '@/components/ZThinkingLoopAnimation';
import { useTheme } from '@/context/ThemeContext';

/** Only show the branded loader if loading lasts longer than this (avoids flash on fast/cached loads). */
const DELAY_MS = 2000;

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
 * Shows the logo loading animation only after loading has lasted DELAY_MS (2s by default).
 * If loading finishes sooner (e.g. cached data), the overlay never appears.
 */
export default function LoadingVideoOverlay({ loading, contained = false }: Props) {
  const { theme } = useTheme();
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

  const isDark = theme === 'dark';

  return (
    <div
      className={`${positionClass} ${isDark ? 'bg-black' : 'bg-white'} flex items-center justify-center`}
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      {isDark ? (
        <ZThinkingLoopAnimation
          size={200}
          className="w-[min(40vw,200px)] max-w-[200px] sm:w-[min(32vw,220px)] sm:max-w-[220px]"
        />
      ) : (
        <LogoLoadingAnimation className="w-[min(40vw,200px)] max-w-[200px] sm:w-[min(32vw,220px)] sm:max-w-[220px]" />
      )}
    </div>
  );
}
