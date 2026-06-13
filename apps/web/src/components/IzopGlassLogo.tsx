'use client';

import {
  IZOP_AI_MARK_DARK_SRC,
  IZOP_AI_MARK_MASK_SRC,
  IZOP_AI_MARK_WHITE_SRC,
  SITE_HEADER_LOGO_CLASS,
  SITE_LOGO_DARK_SRC,
} from '@/lib/site-brand-assets';

type Props = {
  alt?: string;
  /** sm: header mark. md: slightly larger hero contexts. */
  size?: 'sm' | 'md';
  /** full: main app mark. nav: iZop AI top nav. square: filled mark + title area in chat. */
  variant?: 'full' | 'nav' | 'square';
  className?: string;
  /** Pulse animation during OAuth connect. */
  animated?: boolean;
  /** square only: light = black mark on white tile, dark = white mark on black tile */
  tone?: 'light' | 'dark';
};

const sizeClass = {
  sm: SITE_HEADER_LOGO_CLASS,
  md: 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain',
} as const;

/** iZop AI nav mark (mask, inherits header link color). Not used for the main app wordmark. */
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
      <span
        className={`izop-ai-nav-mark ${className}`.trim()}
        style={{ WebkitMaskImage: `url(${IZOP_AI_MARK_MASK_SRC})`, maskImage: `url(${IZOP_AI_MARK_MASK_SRC})` }}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt}
      />
    );
  }

  if (variant === 'square') {
    const src = tone === 'dark' ? IZOP_AI_MARK_WHITE_SRC : IZOP_AI_MARK_DARK_SRC;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`izop-ai-square-mark ${className}`.trim()}
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
