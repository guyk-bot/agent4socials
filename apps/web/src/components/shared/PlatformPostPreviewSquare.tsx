'use client';

import React from 'react';

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
        <div className="aspect-square w-full overflow-hidden bg-neutral-100 dark:bg-neutral-900">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview.imageSrc}
            alt={preview.imageAlt ?? preview.platformLabel}
            className="h-full w-full object-cover"
            draggable={false}
          />
        </div>
      ) : (
        <div className="aspect-square w-full bg-neutral-50 dark:bg-neutral-900" />
      )}
      <p className="line-clamp-3 px-2 py-1.5 text-[9px] leading-snug text-neutral-700 dark:text-neutral-300">
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
