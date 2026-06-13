'use client';

import {
  IZOP_AI_MARK_DARK_SRC,
  IZOP_AI_MARK_WHITE_SRC,
  SITE_HEADER_LOGO_CLASS,
  SITE_LOGO_DARK_SRC,
} from '@/lib/site-brand-assets';

type Props = {
  alt?: string;
  /** sm: header mark. md: slightly larger hero contexts. */
  size?: 'sm' | 'md';
  /** full: main app mark. nav: iZop AI top nav. outline: iZop AI chat empty state. */
  variant?: 'full' | 'nav' | 'outline';
  className?: string;
  /** Pulse animation during OAuth connect. */
  animated?: boolean;
  /** outline only: light = black mark, dark = white mark */
  tone?: 'light' | 'dark';
};

const sizeClass = {
  sm: SITE_HEADER_LOGO_CLASS,
  md: 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain',
} as const;

/** iZop AI nav mark (white outline). Not used for the main app wordmark. */
export function IzopGlassLogo({
  alt = 'iZop',
  size = 'sm',
  variant = 'full',
  className = '',
  animated = false,
  tone = 'light',
}: Props) {
  if (variant === 'nav') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={IZOP_AI_MARK_WHITE_SRC}
        alt={alt}
        className={`izop-glass-logo__mark-nav ${className}`.trim()}
        draggable={false}
      />
    );
  }

  if (variant === 'outline') {
    const src = tone === 'dark' ? IZOP_AI_MARK_WHITE_SRC : IZOP_AI_MARK_DARK_SRC;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`h-8 w-8 object-contain ${tone === 'light' ? 'mix-blend-multiply dark:mix-blend-normal' : ''} ${className}`.trim()}
        draggable={false}
      />
    );
  }

  const boxClass = sizeClass[size];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={SITE_LOGO_DARK_SRC}
      alt={alt}
      className={`${boxClass} ${animated ? 'a4s-logo-mark-pulse' : ''} ${className}`.trim()}
      draggable={false}
    />
  );
}
