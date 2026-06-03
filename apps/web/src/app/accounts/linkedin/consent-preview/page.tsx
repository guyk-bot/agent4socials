'use client';

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { LinkedInOAuthConsentScreen } from '@/components/dashboard/LinkedInOAuthConsentScreen';
import { useAuth } from '@/context/AuthContext';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

function ConsentPreviewContent() {
  const searchParams = useSearchParams();
  const method = (searchParams.get('method') === 'personal' ? 'personal' : 'page') as LinkedInConnectMethod;
  const { user } = useAuth();
  const [allowing, setAllowing] = useState(false);

  return (
    <LinkedInOAuthConsentScreen
      method={method}
      userDisplayName={user?.name ?? user?.email}
      userAvatarUrl={user?.avatarUrl}
      allowing={allowing}
      onCancel={() => {
        window.history.back();
      }}
      onAllow={() => {
        setAllowing(true);
        window.setTimeout(() => setAllowing(false), 1200);
      }}
    />
  );
}

/** Standalone LinkedIn-style consent preview for app review screen recordings. */
export default function LinkedInConsentPreviewPage() {
  return (
    <div>
      <div className="fixed top-3 left-3 z-50 rounded-lg bg-neutral-800/90 px-3 py-2 text-xs text-neutral-200 border border-neutral-600">
        <Link href="/dashboard?connect=LINKEDIN" className="text-[#70b5f9] hover:underline">
          Back to Connect LinkedIn
        </Link>
        <span className="mx-2 text-neutral-500">|</span>
        <Link href="/accounts/linkedin/consent-preview?method=page" className="hover:underline">
          Page
        </Link>
        <span className="mx-1">·</span>
        <Link href="/accounts/linkedin/consent-preview?method=personal" className="hover:underline">
          Personal
        </Link>
      </div>
      <Suspense fallback={<div className="min-h-screen bg-black" />}>
        <ConsentPreviewContent />
      </Suspense>
    </div>
  );
}
