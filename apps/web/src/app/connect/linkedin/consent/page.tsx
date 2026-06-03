'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LinkedInOAuthConsentScreen } from '@/components/dashboard/LinkedInOAuthConsentScreen';
import { LinkedInConsentSignInStep } from '@/components/dashboard/LinkedInConsentSignInStep';
import { startLinkedInConnectAfterConsent } from '@/lib/linkedin/start-oauth';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import api from '@/lib/api';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

function LinkedInConsentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const method = (
    searchParams.get('method') === 'personal' ? 'personal' : 'page'
  ) as LinkedInConnectMethod;
  const returnTo = searchParams.get('returnTo') ?? '/dashboard?connect=LINKEDIN';
  const previewId = searchParams.get('previewId')?.trim() ?? '';
  const [allowing, setAllowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(Boolean(previewId));
  const [memberName, setMemberName] = useState<string | null>(null);
  const [memberAvatarUrl, setMemberAvatarUrl] = useState<string | null>(null);

  const goBack = () => {
    router.push(returnTo);
  };

  useEffect(() => {
    if (!previewId) {
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    void api
      .get<{
        memberName?: string | null;
        memberPicture?: string | null;
      }>(`/social/linkedin/consent-preview?previewId=${encodeURIComponent(previewId)}`)
      .then((res) => {
        if (cancelled) return;
        const name = res.data?.memberName?.trim();
        const pic = res.data?.memberPicture?.trim();
        if (name) setMemberName(name);
        if (pic) setMemberAvatarUrl(avatarDisplayUrl('LINKEDIN', pic) ?? pic);
      })
      .catch(() => {
        if (!cancelled) {
          setError('Session expired. Sign in with LinkedIn again.');
        }
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [previewId]);

  const restartIdentify = () => {
    const returnToEnc = encodeURIComponent(returnTo);
    router.replace(`/connect/linkedin/consent?method=${method}&returnTo=${returnToEnc}`);
  };

  const handleAllow = async () => {
    if (!previewId) return;
    setError(null);
    setAllowing(true);
    const result = await startLinkedInConnectAfterConsent(previewId, returnTo);
    if (result.ok) {
      window.location.assign(result.url);
      return;
    }
    setAllowing(false);
    setError(result.message);
  };

  if (!previewId) {
    return (
      <LinkedInConsentSignInStep method={method} returnTo={returnTo} onCancel={goBack} />
    );
  }

  if (previewLoading) {
    return (
      <div className="linkedin-oauth-consent-scope min-h-dvh w-full bg-[#f3f2ef] flex items-center justify-center">
        <p className="text-sm text-neutral-600">Loading your LinkedIn profile…</p>
      </div>
    );
  }

  return (
    <LinkedInOAuthConsentScreen
      method={method}
      memberAvatarUrl={memberAvatarUrl ?? undefined}
      memberName={memberName}
      allowing={allowing}
      errorMessage={error}
      onCancel={goBack}
      onNotYou={restartIdentify}
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
