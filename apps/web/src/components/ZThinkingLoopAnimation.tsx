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
 * iZop thinking mark with lime glow centered on the green dot.
 * Light mode: black Z + baked-in dot asset.
 * Dark mode: white Z mask + rendered dot + same glow.
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
      <span className="izop-thinking-mark__dot-wrap" aria-hidden>
        <span className="izop-thinking-mark__glow izop-thinking-mark__glow--outer" />
        <span className="izop-thinking-mark__glow izop-thinking-mark__glow--inner" />
        <span className="izop-thinking-mark__dot-core" />
      </span>
    </div>
  );
}
