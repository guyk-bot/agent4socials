'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, User } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import {
  LINKEDIN_OAUTH_APP_LOGO_URL,
  LINKEDIN_OAUTH_APP_NAME,
  LINKEDIN_OAUTH_CONSENT_PERMISSIONS,
  LINKEDIN_OAUTH_MEMBER_AVATAR_URL,
  LINKEDIN_OAUTH_REDIRECT_DISPLAY_URL,
} from '@/lib/linkedin/oauth-consent-copy';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

type Props = {
  method: LinkedInConnectMethod;
  memberAvatarUrl?: string;
  memberName?: string | null;
  /** Footer line: where the user goes after Allow (default: iZop). */
  redirectDisplayUrl?: string;
  onCancel: () => void;
  onAllow: () => void;
  onNotYou?: () => void;
  allowing?: boolean;
  errorMessage?: string | null;
};

/**
 * Full-page LinkedIn-style OAuth permission dialog (Cancel / Allow).
 */
export function LinkedInOAuthConsentScreen({
  method,
  memberAvatarUrl,
  memberName,
  redirectDisplayUrl = LINKEDIN_OAUTH_REDIRECT_DISPLAY_URL,
  onCancel,
  onAllow,
  onNotYou,
  allowing = false,
  errorMessage,
}: Props) {
  const permissions = LINKEDIN_OAUTH_CONSENT_PERMISSIONS[method];
  const [avatarBroken, setAvatarBroken] = useState(false);
  const resolvedAvatar =
    !avatarBroken && memberAvatarUrl && memberAvatarUrl !== LINKEDIN_OAUTH_MEMBER_AVATAR_URL
      ? memberAvatarUrl
      : null;

  useEffect(() => {
    setAvatarBroken(false);
  }, [memberAvatarUrl]);

  return (
    <div className="linkedin-oauth-consent-scope min-h-dvh w-full flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[480px] flex flex-col items-center">
        {errorMessage ? (
          <div className="w-full mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {errorMessage}
          </div>
        ) : null}

        <div className="linkedin-oauth-consent-card w-full rounded-lg">
          <div className="px-6 sm:px-8 pt-7 sm:pt-8 pb-2 flex flex-col items-center">
            <LinkedinIcon size={34} />
            <div className="mt-5 flex items-center justify-center gap-3 w-full">
              <div
                className="linkedin-oauth-app-icon h-16 w-16 shrink-0 rounded-full bg-black overflow-hidden flex items-center justify-center shadow-sm"
                aria-hidden
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={LINKEDIN_OAUTH_APP_LOGO_URL}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div
                className="flex-1 max-w-[64px] h-px border-t-2 border-dashed border-neutral-300"
                aria-hidden
              />
              <div className="relative shrink-0">
                <div className="h-16 w-16 rounded-full bg-neutral-200 overflow-hidden border-2 border-white shadow-sm flex items-center justify-center">
                  {resolvedAvatar ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={resolvedAvatar}
                      alt="Your LinkedIn profile"
                      width={64}
                      height={64}
                      className="h-full w-full object-cover"
                      onError={() => setAvatarBroken(true)}
                    />
                  ) : (
                    <User className="h-8 w-8 text-neutral-400" aria-hidden />
                  )}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-white shadow">
                  <LinkedinIcon size={14} />
                </span>
              </div>
            </div>
            {memberName ? (
              <p className="mt-3 text-center text-sm font-medium text-neutral-800">
                Signed in as {memberName}
              </p>
            ) : null}
          </div>

          <div className="px-6 sm:px-8 pb-4 text-left">
            <h1 className="linkedin-oauth-consent-title text-base sm:text-lg font-semibold text-center leading-snug">
              {LINKEDIN_OAUTH_APP_NAME} would like to:
            </h1>
            <ul className="linkedin-oauth-consent-list mt-4 max-h-[min(42vh,320px)] overflow-y-auto space-y-2 list-disc pl-5 text-sm leading-relaxed pr-1">
              {permissions.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="linkedin-oauth-consent-muted mt-4 text-xs leading-relaxed">
              You can stop this sync in your LinkedIn settings. {LINKEDIN_OAUTH_APP_NAME} terms apply.{' '}
              <Link href="/help#linkedin" className="linkedin-oauth-consent-link hover:underline">
                Learn more
              </Link>
            </p>
            <p className="mt-2 text-center">
              <button
                type="button"
                className="linkedin-oauth-consent-link text-sm hover:underline"
                onClick={onNotYou ?? onCancel}
              >
                Not you?
              </button>
            </p>
          </div>

          <div className="linkedin-oauth-consent-actions px-6 sm:px-8 pt-2 pb-6 sm:pb-8 space-y-2 border-t border-neutral-200">
            <button
              type="button"
              onClick={onCancel}
              disabled={allowing}
              className="linkedin-oauth-consent-cancel w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onAllow}
              disabled={allowing}
              className="linkedin-oauth-consent-allow w-full rounded-full py-3 text-sm font-bold disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
            >
              {allowing ? <Loader2 size={18} className="animate-spin" /> : null}
              Allow
            </button>
          </div>

          <div className="linkedin-oauth-consent-footer px-6 sm:px-8 pb-6 text-center text-xs leading-relaxed border-t border-neutral-100">
            <p>
              You will be redirected to{' '}
              <span className="break-all">{redirectDisplayUrl}</span>
            </p>
            <p className="mt-2">
              <Link href="/privacy" className="linkedin-oauth-consent-footer-link hover:underline">
                Privacy Policy
              </Link>
              <span className="mx-2 text-neutral-400">|</span>
              <Link href="/terms" className="linkedin-oauth-consent-footer-link hover:underline">
                User Agreement
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
