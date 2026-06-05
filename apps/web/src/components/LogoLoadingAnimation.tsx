'use client';

import { SITE_LOGO_SRC } from '@/lib/site-brand-assets';

type LogoLoadingAnimationProps = {
  className?: string;
  'aria-label'?: string;
};

/**
 * Inline branded logo loop used for full-page and overlay loading states.
 * Animation CSS lives in `globals.css` under `.a4s-logo-loading`.
 */
export function LogoLoadingAnimation({ className, 'aria-label': ariaLabel }: LogoLoadingAnimationProps) {
  return (
    <div className={`a4s-logo-loading__stage ${className ?? ''}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SITE_LOGO_SRC}
        alt={ariaLabel ?? 'Loading'}
        className="a4s-logo-loading__mark"
        draggable={false}
      />
    </div>
  );
}
