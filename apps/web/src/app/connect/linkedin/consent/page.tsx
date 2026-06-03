'use client';

import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LinkedInOAuthConsentScreen } from '@/components/dashboard/LinkedInOAuthConsentScreen';
import { startLinkedInOAuth } from '@/lib/linkedin/start-oauth';
import { useLinkedInConsentMemberAvatar } from '@/lib/linkedin/consent-member-avatar';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

function LinkedInConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const method = (
    searchParams.get('method') === 'personal' ? 'personal' : 'page'
  ) as LinkedInConnectMethod;
  const returnTo = searchParams.get('returnTo') ?? '/dashboard?connect=LINKEDIN';
  const [allowing, setAllowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberAvatarUrl = useLinkedInConsentMemberAvatar(method);

  const goBack = () => {
    router.push(returnTo);
  };

  const handleAllow = async () => {
    setError(null);
    setAllowing(true);
    const result = await startLinkedInOAuth(method);
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setAllowing(false);
    setError(result.message);
  };

  return (
    <LinkedInOAuthConsentScreen
      method={method}
      memberAvatarUrl={memberAvatarUrl}
      allowing={allowing}
      errorMessage={error}
      onCancel={goBack}
      onAllow={() => void handleAllow()}
    />
  );
}

export default function LinkedInConsentPage() {
  return (
    <Suspense
      fallback={
        <div className="linkedin-oauth-consent-scope min-h-dvh w-full bg-[#f3f2ef]" aria-busy="true" />
      }
    >
      <LinkedInConsentContent />
    </Suspense>
  );
}
