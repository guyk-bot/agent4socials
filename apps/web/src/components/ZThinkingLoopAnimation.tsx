'use client';

import { useTheme } from '@/context/ThemeContext';

const Z_MASK_DARK_SRC = '/logo-z-white-mask.png';
const Z_MASK_LIGHT_SRC = '/logo-mark-dark.png';

type ZThinkingLoopAnimationProps = {
  /** Logical size in px (default 40 for chat). */
  size?: number;
  className?: string;
  'aria-label'?: string;
};

/**
 * iZop mark with a pulsing lime dot on the top-left (brand accent position).
 * Works in light and dark mode.
 */
export function ZThinkingLoopAnimation({
  size = 40,
  className,
  'aria-label': ariaLabel = 'Loading',
}: ZThinkingLoopAnimationProps) {
  const { theme } = useTheme();
  const markSrc = theme === 'dark' ? Z_MASK_DARK_SRC : Z_MASK_LIGHT_SRC;

  return (
    <div
      className={`izop-thinking-mark ${className ?? ''}`}
      style={{ '--izop-thinking-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={ariaLabel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={markSrc} alt="" className="izop-thinking-mark__logo" draggable={false} />
      <span className="izop-thinking-mark__dot" aria-hidden />
    </div>
  );
}
