'use client';

import React from 'react';
import { Play } from 'lucide-react';

/** Portrait post frame (3:4). */
export const PORTRAIT_POST_ASPECT = 'aspect-[3/4]';

/** Vertical Shorts / Reels frame (1080×1920, 9:16). */
export const SHORTS_POST_ASPECT = 'aspect-[9/16]';

const CAPTION_LINE_HEIGHT_REM = 1.3;

/** Hard-cap caption copy so compact cards never show a 4th line after ellipsis. */
export function truncatePreviewCaption(text: string, maxLines = 3, charsPerLine = 22): string {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (trial.length > charsPerLine && line) {
      lines.push(line);
      line = word;
      if (lines.length >= maxLines) break;
    } else {
      line = trial;
    }
  }

  if (lines.length < maxLines && line) lines.push(line);

  const full = words.join(' ');
  const shown = lines.slice(0, maxLines).join(' ').trim();
  if (shown.length >= full.length) return full;
  return `${shown.replace(/\s+\S*$/, '').trim() || shown}...`;
}

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

function PlatformPostPreviewProfileRow({
  preview,
  scheduleDemo = false,
}: {
  preview: PlatformPostPreview;
  scheduleDemo?: boolean;
}) {
  if (!preview.profileAvatarSrc && !preview.profileName) return null;

  const displayName = preview.profileName ?? preview.platformLabel;
  const handle = preview.profileHandle?.replace(/^@/, '');

  return (
    <div
      className={`flex items-center gap-1.5 border-b border-neutral-100 dark:border-neutral-800 ${
        scheduleDemo ? 'px-2 py-1' : 'px-2 py-1.5'
      }`}
    >
      <div
        className={`shrink-0 overflow-hidden rounded-full border border-neutral-200 bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 ${
          scheduleDemo ? 'h-[20px] w-[20px]' : 'h-[18px] w-[18px]'
        }`}
      >
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
        <p
          className={`truncate font-semibold text-neutral-900 dark:text-neutral-100 ${
            scheduleDemo ? 'text-[10px]' : 'text-[9px]'
          }`}
        >
          {displayName}
        </p>
        {handle ? (
          <p
            className={`truncate text-neutral-500 dark:text-neutral-400 ${
              scheduleDemo ? 'text-[9px]' : 'text-[8px]'
            }`}
          >
            @{handle}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function PlatformPostPreviewSquare({
  preview,
  compact = false,
  scheduleDemo = false,
}: {
  preview: PlatformPostPreview;
  compact?: boolean;
  /** Funnel schedule side panel: taller 9:16 tile + strict 3-line caption. */
  scheduleDemo?: boolean;
}) {
  const isShorts = preview.mediaFormat === 'shorts';
  const captionText =
    compact || scheduleDemo ? truncatePreviewCaption(preview.caption, 3, scheduleDemo ? 20 : 22) : preview.caption;

  const mediaFrameClass = (() => {
    if (isShorts && scheduleDemo) {
      return 'relative mx-auto w-full min-h-[88px] flex-1 aspect-[9/16] overflow-hidden bg-neutral-100 dark:bg-neutral-900';
    }
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
    <div
      className={`flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950 ${
        scheduleDemo ? 'h-full min-h-[148px]' : ''
      }`}
    >
      <div
        className={`px-2 font-bold uppercase tracking-wide text-white ${preview.accentClass} ${
          scheduleDemo ? 'py-1 text-[9px]' : 'py-0.5 text-[8px]'
        }`}
      >
        {preview.platformLabel}
      </div>
      <PlatformPostPreviewProfileRow preview={preview} scheduleDemo={scheduleDemo} />
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
          className={`shrink-0 overflow-hidden px-2 text-neutral-700 dark:text-neutral-300 break-words [overflow-wrap:anywhere] ${
            scheduleDemo
              ? 'py-1 text-[9px] leading-[1.3]'
              : compact
                ? 'line-clamp-3 py-1.5 text-[9px] leading-[1.35] sm:text-[10px]'
                : 'line-clamp-3 py-2 text-[11px] leading-snug sm:text-[12px]'
          }`}
          style={
            scheduleDemo || compact
              ? { maxHeight: `${CAPTION_LINE_HEIGHT_REM * 3}rem` }
              : undefined
          }
          title={preview.caption}
        >
          {captionText}
        </p>
      ) : null}
    </div>
  );
}

export function PlatformPostPreviewGrid({
  previews,
  compact = false,
  scheduleDemo = false,
  hideCaptions = false,
}: {
  previews: PlatformPostPreview[];
  compact?: boolean;
  scheduleDemo?: boolean;
  hideCaptions?: boolean;
}) {
  const cols = previews.length >= 3 ? 3 : previews.length;
  return (
    <div
      className={`grid ${scheduleDemo ? 'gap-1' : 'gap-1.5'}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {previews.map((preview) => (
        <PlatformPostPreviewSquare
          key={preview.platformLabel}
          preview={{ ...preview, hideCaption: hideCaptions || preview.hideCaption }}
          compact={compact}
          scheduleDemo={scheduleDemo}
        />
      ))}
    </div>
  );
}
