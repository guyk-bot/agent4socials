'use client';

import { useId } from 'react';

type LogoLoadingAnimationProps = {
  className?: string;
  'aria-label'?: string;
};

/**
 * Inline SVG logo loop used for full-page and overlay loading states.
 * Animation CSS lives in `globals.css` under `.a4s-logo-loading`.
 */
export function LogoLoadingAnimation({ className, 'aria-label': ariaLabel }: LogoLoadingAnimationProps) {
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `a4s-sparkle-grad-${rawId}`;

  return (
    <div className={`a4s-logo-loading__stage ${className ?? ''}`}>
      <svg className="a4s-logo-loading__svg" viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg" aria-label={ariaLabel ?? 'Loading'} role="img">
        <defs>
          <radialGradient id={gradId} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ff7a3a" />
            <stop offset="45%" stopColor="#ff3d00" />
            <stop offset="100%" stopColor="#b22200" />
          </radialGradient>
        </defs>

        <path
          className="a4s-logo-loading__a-side a4s-logo-loading__a-left"
          d="M 250,15 L 284,74 L 103,390 L 170,390 L 250,251 L 284,310 L 205,448 L 2,448 Z"
        />

        <path
          className="a4s-logo-loading__a-side a4s-logo-loading__a-right"
          d="M 386,276 L 498,470 L 430,470 L 352,335 Z"
        />

        <g className="a4s-logo-loading__sparkle" transform="translate(317 196)">
          <g className="a4s-logo-loading__sparkle-inner">
            <path
              d="M 0,-80 C 8,-40 40,-8 80,0 C 40,8 8,40 0,80 C -8,40 -40,8 -80,0 C -40,-8 -8,-40 0,-80 Z"
              fill={`url(#${gradId})`}
            />
          </g>
        </g>
      </svg>
    </div>
  );
}
