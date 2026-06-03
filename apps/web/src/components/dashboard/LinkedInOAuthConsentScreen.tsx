'use client';

import React, { useMemo } from 'react';
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
}: {
  src?: string | null;
  alt: string;
  fallbackLetter: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="relative shrink-0">
      <div className="h-16 w-16 rounded-full border-2 border-white bg-neutral-200 overflow-hidden shadow-sm flex items-center justify-center">
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
 * In-app consent screen styled like LinkedIn's OAuth permission dialog (for app review recordings).
 * Shown immediately before redirecting to linkedin.com/oauth/v2/authorization.
 */
export function LinkedInOAuthConsentScreen({
  method,
  userDisplayName,
  userAvatarUrl,
  onCancel,
  onAllow,
  allowing = false,
}: Props) {
  const permissions = LINKEDIN_OAUTH_CONSENT_PERMISSIONS[method];
  const redirectUrl = useMemo(() => linkedInOAuthRedirectDisplayUrl(), []);
  const memberLabel = userDisplayName?.trim() || 'You';

  return (
    <div className="linkedin-oauth-consent-scope min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center bg-black px-4 py-10">
      <div className="w-full max-w-[440px] rounded-lg bg-white shadow-2xl overflow-hidden">
        <div className="px-8 pt-8 pb-2 flex flex-col items-center">
          <LinkedinIcon size={34} />
          <div className="mt-6 flex items-center justify-center gap-3 w-full">
            <AvatarBubble
              src={userAvatarUrl}
              alt={memberLabel}
              fallbackLetter={memberLabel.charAt(0).toUpperCase()}
              badge={<LinkedinIcon size={14} />}
            />
            <div className="flex-1 max-w-[72px] h-px border-t-2 border-dashed border-neutral-300" aria-hidden />
            <AvatarBubble
              src="/logo-48.png"
              alt={LINKEDIN_OAUTH_APP_NAME}
              fallbackLetter="A"
            />
          </div>
        </div>

        <div className="px-8 pb-6 text-left">
          <h2 className="text-lg font-semibold text-neutral-900 text-center leading-snug">
            {LINKEDIN_OAUTH_APP_NAME} would like to:
          </h2>
          <ul className="mt-4 space-y-2.5 list-disc pl-5 text-sm text-neutral-600 leading-relaxed">
            {permissions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-5 text-xs text-neutral-500 leading-relaxed">
            You can stop this sync in your LinkedIn settings. {LINKEDIN_OAUTH_APP_NAME} terms apply.{' '}
            <Link href="/help#linkedin" className="text-[#0a66c2] hover:underline">
              Learn more
            </Link>
          </p>
          <p className="mt-3 text-center">
            <button
              type="button"
              className="text-sm text-[#0a66c2] hover:underline"
              onClick={onCancel}
            >
              Not you?
            </button>
          </p>
        </div>

        <div className="px-8 pb-8 space-y-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={allowing}
            className="w-full rounded-full border border-neutral-400 bg-white py-2.5 text-sm font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onAllow}
            disabled={allowing}
            className="w-full rounded-full bg-[#0a66c2] py-2.5 text-sm font-bold text-white hover:bg-[#004182] disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {allowing ? <Loader2 size={18} className="animate-spin" /> : null}
            Allow
          </button>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-neutral-400 max-w-md">
        You will be redirected to{' '}
        <span className="text-neutral-300 break-all">{redirectUrl}</span>
      </p>
      <p className="mt-3 text-center text-xs text-neutral-500">
        <Link href="/privacy" className="text-[#70b5f9] hover:underline">
          Privacy Policy
        </Link>
        <span className="mx-2 text-neutral-600">|</span>
        <Link href="/terms" className="text-[#70b5f9] hover:underline">
          User Agreement
        </Link>
      </p>
    </div>
  );
}
