'use client';

import React, { useState } from 'react';
import { Check, Star, Loader2 } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import { LINKEDIN_CONNECT_OPTIONS } from '@/lib/linkedin/connect-consent';
import { startLinkedInOAuth } from '@/lib/linkedin/start-oauth';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

type Props = {
  connecting: boolean;
  connectError?: string | null;
};

export default function LinkedInConnectOptions({ connecting, connectError }: Props) {
  const personal = LINKEDIN_CONNECT_OPTIONS.personal;
  const page = LINKEDIN_CONNECT_OPTIONS.page;
  const [busyMethod, setBusyMethod] = useState<LinkedInConnectMethod | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const startConnect = async (method: LinkedInConnectMethod) => {
    setLocalError(null);
    setBusyMethod(method);
    const result = await startLinkedInOAuth(method, { step: 'consent' });
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setBusyMethod(null);
    setLocalError(result.message);
  };

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
              Choose personal profile or Company Page. You will sign in at LinkedIn first, review
              permissions here, then finish connecting in Izop.
            </p>
          </div>
          {connectError || localError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-2">
              {localError ?? connectError}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => void startConnect('personal')}
            disabled={connecting || Boolean(busyMethod)}
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
            <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-blue-600 to-blue-800 flex items-center justify-center gap-2 min-h-[40px]">
              {busyMethod === 'personal' ? <Loader2 size={16} className="animate-spin" /> : null}
              Continue
            </div>
          </button>

          <button
            type="button"
            onClick={() => void startConnect('page')}
            disabled={connecting || Boolean(busyMethod)}
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
            <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-blue-700 to-blue-900 flex items-center justify-center gap-2 min-h-[40px]">
              {busyMethod === 'page' ? <Loader2 size={16} className="animate-spin" /> : null}
              Continue
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
