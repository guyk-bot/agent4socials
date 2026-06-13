'use client';

import {
  IZOP_AI_MARK_MASK_CHAT_SRC,
  IZOP_AI_MARK_MASK_SRC,
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
  /** outline only: light = dark mark, dark = light mark */
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

  if (variant === 'outline') {
    const maskSrc = IZOP_AI_MARK_MASK_CHAT_SRC;
    return (
      <span
        className={`izop-ai-outline-mark ${tone === 'dark' ? 'izop-ai-outline-mark--dark' : ''} ${className}`.trim()}
        style={{ WebkitMaskImage: `url(${maskSrc})`, maskImage: `url(${maskSrc})` }}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt}
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
