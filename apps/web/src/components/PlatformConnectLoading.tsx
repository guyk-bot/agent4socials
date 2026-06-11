'use client';

import { IzopGlassLogo } from '@/components/IzopGlassLogo';

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

/** Logo animation + "Connecting {platform}..." while OAuth is in progress. */
export function PlatformConnectLoading({
  platformLabel,
  subtitle,
  variant = 'full',
}: Props) {
  if (variant === 'compact') {
    return (
      <div className="platform-connect-loading platform-connect-loading--compact">
        <IzopGlassLogo alt="" size="sm" animated className="shrink-0" />
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
      <div className="platform-connect-loading__logo-ring">
        <IzopGlassLogo alt="" size="md" animated />
      </div>
      <p className="platform-connect-loading__text">
        Connecting {platformLabel}
        <AnimatedDots />
      </p>
      {subtitle ? <p className="platform-connect-loading__subtitle">{subtitle}</p> : null}
    </div>
  );
}
