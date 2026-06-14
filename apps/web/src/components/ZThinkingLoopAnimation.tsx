'use client';

import { useTheme } from '@/context/ThemeContext';
import {
  IZOP_THINKING_DARK_MASK_SRC,
  IZOP_THINKING_LIGHT_SRC,
} from '@/lib/site-brand-assets';

type ZThinkingLoopAnimationProps = {
  /** Logical size in px (default 40 for chat). */
  size?: number;
  className?: string;
  'aria-label'?: string;
};

/**
 * iZop thinking mark with a pulsing lime dot on the top-left.
 * Light mode: black Z + green dot asset on white backgrounds.
 * Dark mode: white Z mask with animated lime dot overlay.
 */
export function ZThinkingLoopAnimation({
  size = 40,
  className,
  'aria-label': ariaLabel = 'Loading',
}: ZThinkingLoopAnimationProps) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <div
      className={`izop-thinking-mark ${isDark ? 'izop-thinking-mark--dark' : 'izop-thinking-mark--light'} ${className ?? ''}`}
      style={{ '--izop-thinking-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={ariaLabel}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={isDark ? IZOP_THINKING_DARK_MASK_SRC : IZOP_THINKING_LIGHT_SRC}
        alt=""
        className="izop-thinking-mark__logo"
        draggable={false}
      />
      <span className="izop-thinking-mark__dot" aria-hidden />
    </div>
  );
}
