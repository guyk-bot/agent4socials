'use client';

/** White Z silhouette only (no lime dot), from the standalone thinking-loop spec. */
const Z_WHITE_MASK_SRC = '/logo-z-white-mask.png';

type ZThinkingLoopAnimationProps = {
  /** Logical artboard size in px (default 400, matches source animation). */
  size?: number;
  className?: string;
  'aria-label'?: string;
};

/**
 * Dark-mode "AI thinking" logo loop — matches the standalone HTML spec:
 * white Z image + sheen, lime dot pulse + glow (400px artboard).
 */
export function ZThinkingLoopAnimation({
  size = 400,
  className,
  'aria-label': ariaLabel = 'Loading',
}: ZThinkingLoopAnimationProps) {
  return (
    <div
      className={`izop-z-thinking ${className ?? ''}`}
      style={{ '--izop-z-size': `${size}px` } as React.CSSProperties}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="izop-z-thinking__art">
        <div className="izop-z-thinking__z">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={Z_WHITE_MASK_SRC}
            alt=""
            className="izop-z-thinking__z-img"
            draggable={false}
          />
          <div className="izop-z-thinking__z-sheen" aria-hidden />
        </div>
        <div className="izop-z-thinking__dot-wrap" aria-hidden>
          <div className="izop-z-thinking__glow" />
          <div className="izop-z-thinking__dot" />
        </div>
      </div>
    </div>
  );
}
