'use client';

import { useId } from 'react';

type ZThinkingLoopAnimationProps = {
  /** Logical artboard size in px (default 400, matches source animation). */
  size?: number;
  className?: string;
  'aria-label'?: string;
};

const Z_PATH =
  'M250 110 q60 -10 60 50 q0 40 -50 60 l-120 50 q60 5 60 55 q0 45 -55 45 q-55 0 -55 -50 q0 -40 50 -58 l120 -52 q-58 -6 -58 -55 q0 -45 43 -45 z';

/**
 * Dark-mode "AI thinking" logo loop (breathe + sheen on Z, pulse on lime dot).
 * Light mode uses {@link LogoLoadingAnimation} until a light variant is provided.
 */
export function ZThinkingLoopAnimation({
  size = 400,
  className,
  'aria-label': ariaLabel = 'Loading',
}: ZThinkingLoopAnimationProps) {
  const maskId = useId().replace(/:/g, '');
  const gradientId = `${maskId}-grad`;

  return (
    <div
      className={`izop-z-thinking ${className ?? ''}`}
      style={{ '--izop-z-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={ariaLabel}
    >
      <svg
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
        className="izop-z-thinking__svg"
        aria-hidden
      >
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse">
            <path d={Z_PATH} fill="#ffffff" />
          </mask>
        </defs>
        <rect width="400" height="400" fill="#000000" />
        <g className="izop-z-thinking__z">
          <path className="izop-z-thinking__z-base" d={Z_PATH} fill="#f2f2f2" />
          <g className="izop-z-thinking__z-sheen" mask={`url(#${maskId})`}>
            <rect className="izop-z-thinking__sheen-rect" x="-80" y="-80" width="560" height="560" fill={`url(#${gradientId})`} />
          </g>
        </g>
        <g className="izop-z-thinking__dot-wrap">
          <circle className="izop-z-thinking__glow" cx="122" cy="144" r="64" fill="#AAFF45" />
          <circle className="izop-z-thinking__dot" cx="122" cy="144" r="43" fill="#AAFF45" />
        </g>
        <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="400">
          <stop offset="38%" stopColor="rgba(255,255,255,0)" />
          <stop offset="50%" stopColor="rgba(255,255,255,1)" />
          <stop offset="62%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
      </svg>
    </div>
  );
}
