'use client';

import React from 'react';

/** Half dark / half light circle for auto (sunset) theme mode. */
export function ThemeAutoIcon({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-current overflow-hidden"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="h-full w-1/2 bg-neutral-900 dark:bg-neutral-950" />
      <span className="h-full w-1/2 bg-white" />
    </span>
  );
}
