'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import {
  LINKEDIN_OAUTH_APP_NAME,
  LINKEDIN_OAUTH_CONSENT_PERMISSIONS,
  linkedInOAuthRedirectDisplayUrl,
} from '@/lib/linkedin/oauth-consent-copy';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

type Props = {
  method: LinkedInConnectMethod;
  userDisplayName?: string;
  userAvatarUrl?: string | null;
  onCancel: () => void;
  onAllow: () => void;
  allowing?: boolean;
};

function AvatarBubble({
  src,
  alt,
  fallbackLetter,
  badge,
  square,
}: {
  src?: string | null;
  alt: string;
  fallbackLetter: string;
  badge?: React.ReactNode;
  square?: boolean;
}) {
  return (
    <div className="relative shrink-0">
      <div
        className={`h-16 w-16 border-2 border-white overflow-hidden shadow-sm flex items-center justify-center ${
          square ? 'rounded-md bg-[#e8f4fc]' : 'rounded-full bg-neutral-200'
        }`}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <span className="text-xl font-semibold text-neutral-600">{fallbackLetter}</span>
        )}
      </div>
      {badge ? (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

/**
 * LinkedIn-style OAuth permission dialog (Cancel / Allow). Used for personal and Company Page connect.
 */
export function LinkedInOAuthConsentScreen({
  method,
  userDisplayName,
  userAvatarUrl,
  onCancel,
  onAllow,
  allowing = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const permissions = LINKEDIN_OAUTH_CONSENT_PERMISSIONS[method];
  const redirectUrl = useMemo(() => linkedInOAuthRedirectDisplayUrl(), []);
  const memberLabel = userDisplayName?.trim() || 'You';

  useEffect(() => {
    setMounted(true);
  }, []);

  const content = (
    <div className="linkedin-oauth-consent-scope fixed inset-0 z-[200] flex flex-col items-center justify-center px-4 py-10 overflow-y-auto">
      <div className="linkedin-oauth-consent-card w-full max-w-[440px] rounded-lg overflow-hidden">
        <div className="px-8 pt-8 pb-2 flex flex-col items-center">
          <LinkedinIcon size={34} />
          <div className="mt-6 flex items-center justify-center gap-3 w-full">
            <AvatarBubble
              src={userAvatarUrl}
              alt={memberLabel}
              fallbackLetter={memberLabel.charAt(0).toUpperCase()}
              badge={<LinkedinIcon size={14} />}
            />
            <div
              className="flex-1 max-w-[72px] h-px border-t-2 border-dashed border-neutral-300"
              aria-hidden
            />
            <AvatarBubble
              src="/logo-48.png"
              alt={LINKEDIN_OAUTH_APP_NAME}
              fallbackLetter="A"
              square
            />
          </div>
        </div>

        <div className="px-8 pb-6 text-left">
          <h2 className="linkedin-oauth-consent-title text-lg font-semibold text-center leading-snug">
            {LINKEDIN_OAUTH_APP_NAME} would like to:
          </h2>
          <ul className="linkedin-oauth-consent-list mt-4 space-y-2.5 list-disc pl-5 text-sm leading-relaxed">
            {permissions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="linkedin-oauth-consent-muted mt-5 text-xs leading-relaxed">
            You can stop this sync in your LinkedIn settings. {LINKEDIN_OAUTH_APP_NAME} terms apply.{' '}
            <Link href="/help#linkedin" className="linkedin-oauth-consent-link hover:underline">
              Learn more
            </Link>
          </p>
          <p className="mt-3 text-center">
            <button type="button" className="linkedin-oauth-consent-link text-sm hover:underline" onClick={onCancel}>
              Not you?
            </button>
          </p>
        </div>

        <div className="px-8 pb-8 space-y-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={allowing}
            className="linkedin-oauth-consent-cancel w-full rounded-full py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAllow}
            disabled={allowing}
            className="linkedin-oauth-consent-allow w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {allowing ? <Loader2 size={18} className="animate-spin" /> : null}
            Allow
          </button>
        </div>
      </div>

      <p className="linkedin-oauth-consent-footer mt-6 text-center text-xs max-w-md">
        You will be redirected to <span className="break-all">{redirectUrl}</span>
      </p>
      <p className="linkedin-oauth-consent-footer mt-3 text-center text-xs">
        <Link href="/privacy" className="linkedin-oauth-consent-footer-link hover:underline">
          Privacy Policy
        </Link>
        <span className="mx-2">|</span>
        <Link href="/terms" className="linkedin-oauth-consent-footer-link hover:underline">
          User Agreement
        </Link>
      </p>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
