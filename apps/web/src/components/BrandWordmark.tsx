'use client';

/** Marketing / funnel header only (e.g. `SiteHeader`). Dashboard uses plain text in `AppHeader`. */
import { Bebas_Neue } from 'next/font/google';

const brandXFont = Bebas_Neue({ weight: '400', subsets: ['latin'] });

const xSpanClass = `${brandXFont.className} text-red-500 uppercase inline-block align-middle mx-[0.04em] text-[1.22em] leading-none translate-y-[0.06em]`;

type BrandWordmarkProps = {
  /** Display name; default Agent4Socials is split as Agent4 + X + Socials. */
  name: string;
  className?: string;
};

/**
 * Header wordmark: red capital X in Bebas Neue, rest inherits parent typography.
 */
export function BrandWordmark({ name, className }: BrandWordmarkProps) {
  const n = name.trim();
  const isDefault = !n || n.toLowerCase() === 'agent4socials';

  if (isDefault) {
    return (
      <span className={className}>
        Agent4<span className={xSpanClass}>X</span>Socials
      </span>
    );
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
