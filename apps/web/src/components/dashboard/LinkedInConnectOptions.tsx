'use client';

import React, { useState } from 'react';
import { Check, Star } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import { LINKEDIN_CONNECT_OPTIONS } from '@/lib/linkedin/connect-consent';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';
import { LinkedInOAuthConsentScreen } from '@/components/dashboard/LinkedInOAuthConsentScreen';
import { useAuth } from '@/context/AuthContext';

type Props = {
  connecting: boolean;
  connectingMethod?: string;
  connectError?: string | null;
  onConnect: (platform: string, method: LinkedInConnectMethod) => void;
};

export default function LinkedInConnectOptions({
  connecting,
  connectingMethod,
  connectError,
  onConnect,
}: Props) {
  const [pendingMethod, setPendingMethod] = useState<LinkedInConnectMethod | null>(null);
  const { user } = useAuth();
  const personal = LINKEDIN_CONNECT_OPTIONS.personal;
  const page = LINKEDIN_CONNECT_OPTIONS.page;

  if (pendingMethod) {
    return (
      <>
        {connectError ? (
          <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 max-w-md w-[calc(100%-2rem)] rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 shadow-lg">
            {connectError}
          </div>
        ) : null}
        <LinkedInOAuthConsentScreen
          method={pendingMethod}
          userDisplayName={user?.name ?? user?.email}
          userAvatarUrl={user?.avatarUrl}
          allowing={connecting && connectingMethod === pendingMethod}
          onCancel={() => setPendingMethod(null)}
          onAllow={() => onConnect('linkedin', pendingMethod)}
        />
      </>
    );
  }

  return (
    <div className="connect-view-scope min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
      <div className="max-w-2xl mx-auto px-4 w-full">
        <div className="connect-surface rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-white to-blue-50/30 p-6 sm:p-8 shadow-sm mb-6">
          <div className="text-center pt-2 pb-4">
            <div className="inline-flex mb-3">
              <LinkedinIcon size={40} />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">Connect LinkedIn</h1>
            <p className="text-neutral-500 mt-1 max-w-md mx-auto text-sm">
              Connect your personal profile to publish and schedule from Composer, or connect a Company Page for Page
              analytics and inbox. You will see a permission screen like LinkedIn&apos;s official OAuth consent before
              sign-in.
            </p>
          </div>
          {connectError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-2">
              {connectError}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setPendingMethod('personal')}
            disabled={connecting}
            className="connect-option text-left p-5 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col bg-white"
          >
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Personal</span>
            <span className="font-semibold text-neutral-900 mt-1">{personal.title}</span>
            <p className="text-xs text-neutral-500 mt-0.5 mb-3">{personal.subtitle}</p>
            <ul className="space-y-1.5 text-sm flex-1">
              {personal.features.map((f) => (
                <li key={f} className="flex items-start gap-2 text-neutral-600">
                  <Check size={13} className="text-green-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-blue-600 to-blue-800">
              Continue
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPendingMethod('page')}
            disabled={connecting}
            className="connect-option text-left p-5 rounded-2xl border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50/40 transition-all flex flex-col bg-white relative"
          >
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full mb-1 w-fit whitespace-nowrap">
              <Star size={10} className="shrink-0" /> For Page admins
            </span>
            <span className="font-semibold text-neutral-900">{page.title}</span>
            <p className="text-xs text-neutral-500 mt-0.5 mb-3">{page.subtitle}</p>
            <ul className="space-y-1.5 text-sm text-neutral-600 flex-1">
              {page.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={13} className="text-green-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-blue-700 to-blue-900">
              Continue
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
