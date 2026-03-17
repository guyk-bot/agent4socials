'use client';

import React, { useEffect, useState, useRef } from 'react';

const LOADING_VIDEO_PATH = '/loading-transition.mp4';
/** Show video immediately when loading starts so the default spinner is not shown. */
const DELAY_MS = 0;

type Props = {
  /** When true, we consider "loading". After loading has been true for DELAY_MS, the video overlay is shown. */
  loading: boolean;
};

/**
 * Shows the logo loading video when loading starts (after a short delay if DELAY_MS > 0).
 * If loading finishes before the delay (e.g. cached data), the video never appears.
 */
export default function LoadingVideoOverlay({ loading }: Props) {
  const [showVideo, setShowVideo] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (loading) {
      if (DELAY_MS <= 0) {
        setShowVideo(true);
      } else {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setShowVideo(true);
        }, DELAY_MS);
      }
    } else {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowVideo(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loading]);

  if (!showVideo) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-neutral-900"
      role="status"
      aria-live="polite"
      aria-label="Loading"
    >
      <video
        ref={videoRef}
        src={LOADING_VIDEO_PATH}
        className="max-w-full max-h-full w-auto h-auto object-contain"
        autoPlay
        muted
        playsInline
        loop
        onEnded={() => {
          if (!loading) return;
          videoRef.current?.play().catch(() => {});
        }}
      />
    </div>
  );
}
