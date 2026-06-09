'use client';

import React from 'react';

/** Portrait post frame used across funnel schedule previews (3:4). */
export const PORTRAIT_POST_ASPECT = 'aspect-[3/4]';

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
};

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

export function PlatformPostPreviewSquare({ preview }: { preview: PlatformPostPreview }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      <div className={`px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide text-white ${preview.accentClass}`}>
        {preview.platformLabel}
      </div>
      <PlatformPostPreviewProfileRow preview={preview} />
      {preview.imageSrc ? (
        <div className={`${PORTRAIT_POST_ASPECT} w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageSrc}
            alt={preview.imageAlt ?? preview.platformLabel}
            className="h-full w-full object-cover object-center"
            draggable={false}
          />
        </div>
      ) : (
        <div className={`${PORTRAIT_POST_ASPECT} w-full bg-neutral-50 dark:bg-neutral-900`} />
      )}
      <p className="px-2 py-2 text-[11px] leading-snug text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap sm:text-[12px]">
        {preview.caption}
      </p>
    </div>
  );
}

export function PlatformPostPreviewGrid({ previews }: { previews: PlatformPostPreview[] }) {
  const cols = previews.length >= 3 ? 3 : previews.length;
  return (
    <div
      className="grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {previews.map((preview) => (
        <PlatformPostPreviewSquare key={preview.platformLabel} preview={preview} />
      ))}
    </div>
  );
}
