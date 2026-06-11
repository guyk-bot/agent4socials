'use client';

import { LogoLoadingAnimation } from '@/components/LogoLoadingAnimation';

type Props = {
  platformLabel: string;
  subtitle?: string;
  /** Full card for Connect view; compact for sidebar strip. */
  variant?: 'full' | 'compact';
};

function AnimatedDots() {
  return (
    <span className="platform-connect-loading__dots" aria-hidden>
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  );
}

/** Branded logo animation + "Connecting {platform}..." while OAuth is in progress. */
export function PlatformConnectLoading({
  platformLabel,
  subtitle,
  variant = 'full',
}: Props) {
  if (variant === 'compact') {
    return (
      <div className="platform-connect-loading platform-connect-loading--compact">
        <LogoLoadingAnimation
          className="platform-connect-loading__logo-compact"
          aria-label={`Connecting ${platformLabel}`}
        />
        <span className="platform-connect-loading__text platform-connect-loading__text--compact">
          Connecting {platformLabel}
          <AnimatedDots />
        </span>
      </div>
    );
  }

  return (
    <div
      className="platform-connect-loading platform-connect-loading--full"
      role="status"
      aria-live="polite"
      aria-label={`Connecting ${platformLabel}`}
    >
      <LogoLoadingAnimation
        className="platform-connect-loading__logo-full"
        aria-label={`Connecting ${platformLabel}`}
      />
      <p className="platform-connect-loading__text">
        Connecting {platformLabel}
        <AnimatedDots />
      </p>
      {subtitle ? <p className="platform-connect-loading__subtitle">{subtitle}</p> : null}
    </div>
  );
}
