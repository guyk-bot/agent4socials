'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';

function chatMediaDisplayUrl(url: string): string {
  if (typeof url !== 'string' || !url.startsWith('http')) return url;
  if (url.includes('r2.dev') || url.includes('cloudflarestorage.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

type Props = {
  src: string;
  fileName: string;
  className?: string;
  compact?: boolean;
};

export function AysopChatVideoPreview({ src, fileName, className = '', compact = false }: Props) {
  const displaySrc = useMemo(() => chatMediaDisplayUrl(src), [src]);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const sizeClass = compact
    ? 'h-24 w-24 rounded-lg'
    : 'max-h-56 w-full max-w-sm rounded-lg';

  if (playing) {
    return (
      <video
        ref={videoRef}
        src={displaySrc}
        controls
        autoPlay
        playsInline
        preload="metadata"
        className={`${sizeClass} border border-white/20 bg-black object-contain ${className}`}
        aria-label={fileName}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`group relative block overflow-hidden ${sizeClass} border border-white/20 bg-neutral-900 ${className}`}
      aria-label={`Play ${fileName}`}
    >
      <video
        src={displaySrc}
        muted
        playsInline
        preload="metadata"
        className="h-full w-full object-cover pointer-events-none"
        aria-hidden
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-colors">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/95 text-neutral-900 shadow-lg group-hover:scale-105 transition-transform">
          <Play size={22} className="ml-0.5 fill-current" />
        </span>
      </span>
    </button>
  );
}
