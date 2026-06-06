'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Play } from 'lucide-react';

function chatMediaDisplayUrl(url: string): string {
  if (typeof url !== 'string' || !url.startsWith('http')) return url;
  if (url.includes('r2.dev') || url.includes('cloudflarestorage.com')) {
    return `/api/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
}

function fitVideoBox(aspectRatio: number, maxHeight: number, maxWidth: number) {
  const ratio = aspectRatio > 0 ? aspectRatio : 16 / 9;
  if (ratio >= 1) {
    let width = maxWidth;
    let height = width / ratio;
    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }
    return { width: Math.round(width), height: Math.round(height) };
  }
  let height = maxHeight;
  let width = height * ratio;
  if (width > maxWidth) {
    width = maxWidth;
    height = width / ratio;
  }
  return { width: Math.round(width), height: Math.round(height) };
}

type Props = {
  src: string;
  fileName: string;
  className?: string;
  compact?: boolean;
  /** User bubble (primary) vs assistant bubble */
  onDarkBubble?: boolean;
};

export function AysopChatVideoPreview({
  src,
  fileName,
  className = '',
  compact = false,
  onDarkBubble = false,
}: Props) {
  const displaySrc = useMemo(() => chatMediaDisplayUrl(src), [src]);
  const [playing, setPlaying] = useState(false);
  const [aspectRatio, setAspectRatio] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const maxHeight = compact ? 88 : 360;
  const maxWidth = compact ? 72 : 300;

  const box = fitVideoBox(aspectRatio ?? 9 / 16, maxHeight, maxWidth);

  const onLoadedMetadata = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    if (v.videoWidth > 0 && v.videoHeight > 0) {
      setAspectRatio(v.videoWidth / v.videoHeight);
    }
  }, []);

  const frameClass = [
    'relative overflow-hidden rounded-lg bg-black',
    onDarkBubble ? 'border border-white/30' : 'border border-neutral-300 dark:border-neutral-600',
    className,
  ].join(' ');

  const videoClass = 'h-full w-full object-contain bg-black';

  if (playing) {
    return (
      <div className={frameClass} style={{ width: box.width, height: box.height }}>
        <video
          ref={videoRef}
          src={displaySrc}
          controls
          autoPlay
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoadedMetadata}
          className={videoClass}
          aria-label={fileName}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className={`group block shrink-0 ${frameClass}`}
      style={{ width: box.width, height: box.height }}
      aria-label={`Play ${fileName}`}
    >
      <video
        src={displaySrc}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={onLoadedMetadata}
        className={`${videoClass} pointer-events-none`}
        aria-hidden
      />
      <span className="absolute inset-0 flex items-center justify-center bg-black/45 group-hover:bg-black/55 transition-colors">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-neutral-900 shadow-[0_4px_20px_rgba(0,0,0,0.55)] ring-2 ring-white/90 group-hover:scale-105 transition-transform">
          <Play size={20} className="ml-0.5 fill-current" aria-hidden />
        </span>
      </span>
    </button>
  );
}
