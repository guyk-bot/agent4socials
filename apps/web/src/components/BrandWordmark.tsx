'use client';

/** Marketing / funnel header only (e.g. `SiteHeader`). Dashboard uses plain text in `AppHeader`. */
import { Archivo_Black, Bebas_Neue } from 'next/font/google';

const brandXFont = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const xSpanClass = `${brandXFont.className} text-red-500 uppercase inline-block align-middle mx-[0.04em] text-[1.22em] leading-none translate-y-[0.06em]`;

const heroMultiplierDisplay = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
});

/** Red capital X: chunky geometric sans (Archivo Black), distinct from the gradient headline face. */
const heroHeadlineXClass = `${heroMultiplierDisplay.className} text-red-500 inline-block align-baseline text-[0.92em] sm:text-[0.96em] md:text-[1em] leading-none tracking-tight pr-[0.22em] sm:pr-[0.28em] translate-y-[0.02em]`;

type BrandWordmarkProps = {
  /** Display name; default is plain Agent4Socials (no Twitter X in the logo). */
  name: string;
  className?: string;
};

/**
 * Optional inline stylized X (e.g. custom wordmarks that include "X"). Not used in hero body copy; use plain "Twitter/X" there.
 */
export function BrandMarkX({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) {
  return (
    <span className={className ? `${xSpanClass} ${className}` : xSpanClass} aria-label={ariaLabel ?? 'X (Twitter)'}>
      X
    </span>
  );
}

/**
 * Hero H1 only: "2-7" + this + "Your Content Potential" (padding-right adds space after X).
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
