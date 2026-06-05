'use client';

/** Marketing / funnel header only (e.g. `SiteHeader`). Dashboard uses plain text in `AppHeader`. */
import { Bebas_Neue } from 'next/font/google';
import { BRAND_NAME, isLegacyProductBrandName } from '@/lib/site-brand-assets';

const brandXFont = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const xSpanClass = `${brandXFont.className} text-red-500 uppercase inline-block align-middle mx-[0.04em] text-[1.22em] leading-none translate-y-[0.06em]`;

type BrandWordmarkProps = {
  /** Display name; default is iZop (no Twitter X in the logo). */
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
 * Header wordmark: iZop (no red X in the logo).
 */
export function BrandWordmark({ name, className }: BrandWordmarkProps) {
  const n = name.trim();

  if (!n || isLegacyProductBrandName(n)) {
    return <span className={className}>{BRAND_NAME}</span>;
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
