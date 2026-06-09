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
};

export function PlatformPostPreviewSquare({ preview }: { preview: PlatformPostPreview }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-950">
      <div className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-white ${preview.accentClass}`}>
        {preview.platformLabel}
      </div>
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
