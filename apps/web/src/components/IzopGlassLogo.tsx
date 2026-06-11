'use client';

import { IZOP_GLASS_MARK_SRC } from '@/lib/site-brand-assets';

type Props = {
  alt?: string;
  /** sm: header mark (24–28px). md: slightly larger hero contexts. */
  size?: 'sm' | 'md';
  className?: string;
  /** Pulse animation during OAuth connect. */
  animated?: boolean;
};

const sizeClass = {
  sm: 'izop-glass-logo--sm',
  md: 'izop-glass-logo--md',
} as const;

/** iZop metaball mark with glass chrome and a subtle sparkle accent. */
export function IzopGlassLogo({
  alt = 'iZop',
  size = 'sm',
  className = '',
  animated = false,
}: Props) {
  return (
    <span
      className={`izop-glass-logo ${sizeClass[size]} ${animated ? 'izop-glass-logo--animated' : ''} ${className}`.trim()}
      aria-hidden={!alt}
    >
      <span className="izop-glass-logo__shell">
        <span className="izop-glass-logo__glass" />
        <img src={IZOP_GLASS_MARK_SRC} alt={alt} className="izop-glass-logo__mark" draggable={false} />
        <span className="izop-glass-logo__shine" />
      </span>
      <span className="izop-glass-logo__sparkle" aria-hidden>
        <svg viewBox="0 0 12 12" fill="none" className="izop-glass-logo__sparkle-svg">
          <path
            d="M6 0.5L6.65 4.35L10.5 5L6.65 5.65L6 9.5L5.35 5.65L1.5 5L5.35 4.35L6 0.5Z"
            fill="currentColor"
          />
        </svg>
      </span>
    </span>
  );
}
