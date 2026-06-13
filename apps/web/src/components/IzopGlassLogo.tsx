'use client';

import { SITE_LOGO_DARK_SRC, SITE_HEADER_LOGO_CLASS } from '@/lib/site-brand-assets';

type Props = {
  alt?: string;
  /** sm: header mark. md: slightly larger hero contexts. */
  size?: 'sm' | 'md';
  /** full: standalone mark. nav: iZop AI top nav with optional sparkle. */
  variant?: 'full' | 'nav';
  className?: string;
  /** Pulse animation during OAuth connect. */
  animated?: boolean;
  /** Nav only: sparkle pinned above the mark (iZop AI feature in AppHeader). */
  showSparkle?: boolean;
};

const sizeClass = {
  sm: SITE_HEADER_LOGO_CLASS,
  md: 'h-8 w-8 sm:h-9 sm:w-9 shrink-0 object-contain',
} as const;

function SparkleIcon() {
  return (
    <svg viewBox="0 0 12 12" fill="none" className="izop-glass-logo__sparkle-svg" aria-hidden>
      <path
        d="M6 0.5L6.65 4.35L10.5 5L6.65 5.65L6 9.5L5.35 5.65L1.5 5L5.35 4.35L6 0.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** iZop AI nav mark (white Z + green dot) with optional sparkle. Not used for the main app wordmark. */
export function IzopGlassLogo({
  alt = 'iZop',
  size = 'sm',
  variant = 'full',
  className = '',
  animated = false,
  showSparkle = false,
}: Props) {
  if (variant === 'nav') {
    return (
      <span
        className={`izop-glass-logo izop-glass-logo--nav-icon ${animated ? 'izop-glass-logo--animated' : ''} ${className}`.trim()}
        aria-hidden={!alt}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SITE_LOGO_DARK_SRC} alt={alt} className="izop-glass-logo__mark-nav" draggable={false} />
        {showSparkle ? (
          <span className="izop-glass-logo__sparkle izop-glass-logo__sparkle--on-mark" aria-hidden>
            <SparkleIcon />
          </span>
        ) : null}
      </span>
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
