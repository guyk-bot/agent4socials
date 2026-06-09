'use client';

import React from 'react';
import { Play } from 'lucide-react';

/** Portrait post frame (3:4). */
export const PORTRAIT_POST_ASPECT = 'aspect-[3/4]';

/** Vertical Shorts / Reels frame (1080×1920, 9:16). */
export const SHORTS_POST_ASPECT = 'aspect-[9/16]';

export type PlatformPostPreview = {
  platformLabel: string;
  accentClass: string;
  caption: string;
  imageSrc?: string;
  imageAlt?: string;
  /** Profile photo shown above the post media, like a live platform feed preview. */
  profileAvatarSrc?: string;
  profileName?: string;
  profileHandle?: string;
  /** Vertical 9:16 Shorts/Reels vs default portrait post. */
  mediaFormat?: 'portrait' | 'shorts';
  /** Hide caption under preview (schedule demo cards). */
  hideCaption?: boolean;
};

function ReelPlayButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'md' ? 'h-10 w-10' : 'h-6 w-6';
  const icon = size === 'md' ? 18 : 11;
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className={`flex ${dim} items-center justify-center rounded-full border border-white/35 bg-black/45 shadow-md backdrop-blur-[2px]`}
      >
        <Play size={icon} className="ml-0.5 fill-white text-white" />
      </span>
    </div>
  );
}

function PlatformPostPreviewProfileRow({ preview }: { preview: PlatformPostPreview }) {
  if (!preview.profileAvatarSrc && !preview.profileName) return null;

  const displayName = preview.profileName ?? preview.platformLabel;
  const handle = preview.profileHandle?.replace(/^@/, '');

  return (
    <div className="flex items-center gap-1.5 border-b border-neutral-100 px-2 py-1.5 dark:border-neutral-800">
      <div className="h-[18px] w-[18px] shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800">
        {preview.profileAvatarSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={preview.profileAvatarSrc}
            alt=""
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-[8px] font-bold text-neutral-500">
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 leading-none">
        <p className="truncate text-[9px] font-semibold text-neutral-900 dark:text-neutral-100">{displayName}</p>
        {handle ? (
          <p className="truncate text-[8px] text-neutral-500 dark:text-neutral-400">@{handle}</p>
        ) : null}
      </div>
    </div>
  );
}

export function PlatformPostPreviewSquare({
  preview,
  compact = false,
}: {
  preview: PlatformPostPreview;
  compact?: boolean;
}) {
  const isShorts = preview.mediaFormat === 'shorts';

  const mediaFrameClass = (() => {
    if (isShorts) {
      return compact
        ? 'relative mx-auto w-full max-w-[54px] aspect-[9/16] overflow-hidden bg-neutral-100 dark:bg-neutral-900'
        : `relative ${SHORTS_POST_ASPECT} w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900`;
    }
    if (compact) {
      return 'relative h-[58px] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900';
    }
    return `relative ${PORTRAIT_POST_ASPECT} w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900`;
  })();

  const emptyFrameClass = (() => {
    if (isShorts) {
      return compact
        ? 'mx-auto w-full max-w-[54px] aspect-[9/16] bg-neutral-50 dark:bg-neutral-900'
        : `${SHORTS_POST_ASPECT} w-full bg-neutral-50 dark:bg-neutral-900`;
    }
    if (compact) {
      return 'h-[58px] w-full bg-neutral-50 dark:bg-neutral-900';
    }
    return `${PORTRAIT_POST_ASPECT} w-full bg-neutral-50 dark:bg-neutral-900`;
  })();

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      <div className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white ${preview.accentClass}`}>
        {preview.platformLabel}
      </div>
      <PlatformPostPreviewProfileRow preview={preview} />
      {preview.imageSrc ? (
        <div className={mediaFrameClass}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageSrc}
            alt={preview.imageAlt ?? preview.platformLabel}
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
          {isShorts ? <ReelPlayButton size={compact ? 'sm' : 'md'} /> : null}
        </div>
      ) : (
        <div className={emptyFrameClass} />
      )}
      {!preview.hideCaption ? (
        <p
          className={`px-2 py-1.5 text-neutral-700 dark:text-neutral-300 break-words ${
            compact
              ? 'line-clamp-3 text-[9px] leading-[1.35] sm:text-[10px] [overflow-wrap:anywhere]'
              : 'line-clamp-3 py-2 text-[11px] leading-snug sm:text-[12px]'
          }`}
          title={preview.caption}
        >
          {preview.caption}
        </p>
      ) : null}
    </div>
  );
}

export function PlatformPostPreviewGrid({
  previews,
  compact = false,
  hideCaptions = false,
}: {
  previews: PlatformPostPreview[];
  compact?: boolean;
  hideCaptions?: boolean;
}) {
  const cols = previews.length >= 3 ? 3 : previews.length;
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {previews.map((preview) => (
        <PlatformPostPreviewSquare
          key={preview.platformLabel}
          preview={{ ...preview, hideCaption: hideCaptions || preview.hideCaption }}
          compact={compact}
        />
      ))}
    </div>
  );
}
