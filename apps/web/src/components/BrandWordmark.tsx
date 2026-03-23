'use client';

/** Marketing / funnel header only (e.g. `SiteHeader`). Dashboard uses plain text in `AppHeader`. */
import { Bebas_Neue } from 'next/font/google';

const brandXFont = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const xSpanClass = `${brandXFont.className} text-red-500 uppercase inline-block align-middle mx-[0.04em] text-[1.22em] leading-none translate-y-[0.06em]`;

/** Red capital X in Bebas Neue for hero headline multiplier (distinct from body font). */
const heroHeadlineXClass = `${brandXFont.className} text-red-500 inline-block align-baseline mx-[0.02em] text-[0.88em] sm:text-[0.9em] leading-none translate-y-[0.04em]`;

type BrandWordmarkProps = {
  /** Display name; default is plain Agent4Socials (no Twitter X in the logo). */
  name: string;
  className?: string;
};

/**
 * Same stylized X as inline platform name copy (e.g. hero subhead listing X next to other networks).
 */
export function BrandMarkX({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) {
  return (
    <span className={className ? `${xSpanClass} ${className}` : xSpanClass} aria-label={ariaLabel ?? 'X (Twitter)'}>
      X
    </span>
  );
}

/**
 * Hero H1 only: "2-7" + this + " Your Content Potential" (red X, Bebas Neue, not the gradient sans).
 */
export function HeroHeadlineMultiplierX({ className }: { className?: string }) {
  return (
    <span className={className ? `${heroHeadlineXClass} ${className}` : heroHeadlineXClass}>X</span>
  );
}

/**
 * Header wordmark: plain Agent4Socials (no red X in the logo).
 */
export function BrandWordmark({ name, className }: BrandWordmarkProps) {
  const n = name.trim();
  const isDefault = !n || n.toLowerCase() === 'agent4socials';

  if (isDefault) {
    return <span className={className}>Agent4Socials</span>;
  }

  const parts = n.split(/(X)/);
  if (parts.length > 1) {
    return (
      <span className={className}>
        {parts.map((part, i) =>
          part === 'X' ? (
            <span key={i} className={xSpanClass}>
              X
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </span>
    );
  }

  return <span className={className}>{n}</span>;
}
