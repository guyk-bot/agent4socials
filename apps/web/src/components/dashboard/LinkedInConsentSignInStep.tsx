'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import { startLinkedInOAuth } from '@/lib/linkedin/start-oauth';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

type Props = {
  method: LinkedInConnectMethod;
  returnTo: string;
  onCancel: () => void;
};

/** Step 1: sign in with LinkedIn so the consent screen can show the member photo and name. */
export function LinkedInConsentSignInStep({ method, returnTo, onCancel }: Props) {
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setError(null);
    setSigningIn(true);
    const result = await startLinkedInOAuth(method);
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setSigningIn(false);
    setError(result.message);
  };

  return (
    <div className="linkedin-oauth-consent-scope min-h-dvh w-full flex flex-col items-center px-4 py-8 sm:py-12">
      <div className="w-full max-w-[480px]">
        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}
        <div className="linkedin-oauth-consent-card w-full rounded-lg p-6 sm:p-8 text-center">
          <LinkedinIcon size={34} className="mx-auto" />
          <h1 className="linkedin-oauth-consent-title mt-4 text-lg font-semibold">
            Sign in with LinkedIn
          </h1>
          <p className="linkedin-oauth-consent-muted mt-2 text-sm leading-relaxed">
            Sign in once at LinkedIn. You will return here to review permissions, then connect the
            account to iZop.
          </p>
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={signingIn}
            className="linkedin-oauth-consent-allow mt-6 w-full rounded-full py-3 text-sm font-bold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-60"
          >
            {signingIn ? <Loader2 size={18} className="animate-spin" /> : null}
            Continue with LinkedIn
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={signingIn}
            className="linkedin-oauth-consent-cancel mt-3 w-full rounded-full py-3 text-sm font-semibold disabled:opacity-60"
          >
            Cancel
          </button>
          <p className="mt-4 text-xs">
            <Link href="/help#linkedin" className="linkedin-oauth-consent-link hover:underline">
              Learn more about LinkedIn connect
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
