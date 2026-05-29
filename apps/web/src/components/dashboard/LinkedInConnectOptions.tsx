'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2, Star } from 'lucide-react';
import { LinkedinIcon } from '@/components/SocialPlatformIcons';
import {
  LINKEDIN_CONNECT_OPTIONS,
  type LinkedInConsentItem,
} from '@/lib/linkedin/connect-consent';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

type Props = {
  connecting: boolean;
  connectingMethod?: string;
  connectError?: string | null;
  onConnect: (platform: string, method: LinkedInConnectMethod) => void;
};

function ConsentPanel({
  method,
  items,
  title,
  intro,
  scopesSummary,
  dataUseNote,
  onBack,
  onContinue,
  continuing,
}: {
  method: LinkedInConnectMethod;
  items: LinkedInConsentItem[];
  title: string;
  intro: string;
  scopesSummary: string;
  dataUseNote: string;
  onBack: () => void;
  onContinue: () => void;
  continuing: boolean;
}) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const allChecked = useMemo(() => items.every((i) => checked[i.id]), [items, checked]);

  return (
    <div className="mt-4 rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-4 sm:p-5 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
        {method === 'page' ? 'Company Page consent' : 'Personal profile consent'}
      </p>
      <h3 className="mt-1 text-base font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1 text-sm text-neutral-600">{intro}</p>
      <p className="mt-3 text-xs text-neutral-500 rounded-lg border border-blue-100 bg-white/80 px-3 py-2">
        {scopesSummary}
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex items-start gap-2.5 cursor-pointer text-sm text-neutral-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                checked={!!checked[item.id]}
                onChange={(e) => setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))}
              />
              <span>{item.label}</span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">{dataUseNote}</p>
      <p className="mt-2 text-xs text-neutral-500">
        <Link href="/terms" className="text-blue-700 underline hover:text-blue-900">
          Terms
        </Link>
        {' · '}
        <Link href="/privacy" className="text-blue-700 underline hover:text-blue-900">
          Privacy
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={continuing}
          className="rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={!allChecked || continuing}
          className="inline-flex flex-1 min-w-[200px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-800 px-4 py-2.5 text-sm font-semibold text-white hover:from-blue-700 hover:to-blue-900 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {continuing ? <Loader2 size={16} className="animate-spin" /> : null}
          Continue to LinkedIn sign-in
        </button>
      </div>
    </div>
  );
}

export default function LinkedInConnectOptions({ connecting, connectingMethod, connectError, onConnect }: Props) {
  const [pendingMethod, setPendingMethod] = useState<LinkedInConnectMethod | null>(null);
  const personal = LINKEDIN_CONNECT_OPTIONS.personal;
  const page = LINKEDIN_CONNECT_OPTIONS.page;

  if (pendingMethod) {
    const copy = LINKEDIN_CONNECT_OPTIONS[pendingMethod];
    return (
      <div className="connect-view-scope min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
        <div className="max-w-2xl mx-auto px-4 w-full">
          <div className="connect-surface rounded-2xl border-2 border-blue-200 bg-gradient-to-b from-white to-blue-50/30 p-6 sm:p-8 shadow-sm">
            <div className="text-center pb-2">
              <div className="inline-flex mb-3">
                <LinkedinIcon size={40} />
              </div>
              <h1 className="text-2xl font-bold text-neutral-900">Connect LinkedIn</h1>
            </div>
            {connectError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mb-4">
                {connectError}
              </div>
            ) : null}
            <ConsentPanel
              method={pendingMethod}
              items={copy.items}
              title={copy.consentTitle}
              intro={copy.consentIntro}
              scopesSummary={copy.scopesSummary}
              dataUseNote={copy.dataUseNote}
              onBack={() => setPendingMethod(null)}
              onContinue={() => onConnect('linkedin', pendingMethod)}
              continuing={connecting && connectingMethod === pendingMethod}
            />
          </div>
        </div>
      </div>
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
              Choose how you want to use LinkedIn. We show our permission summary first, then LinkedIn&apos;s official
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
            <ul className="space-y-1.5 text-sm text-neutral-600 flex-1">
              {personal.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check size={13} className="text-green-500 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-blue-600 to-blue-800">
              Review permissions
            </div>
          </button>

          <button
            type="button"
            onClick={() => setPendingMethod('page')}
            disabled={connecting}
            className="connect-option text-left p-5 rounded-2xl border-2 border-blue-300 hover:border-blue-500 hover:bg-blue-50/40 transition-all flex flex-col bg-white relative"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">
                <Star size={10} /> For Page admins
              </span>
              {page.badge ? (
                <span className="text-[10px] font-semibold text-blue-800 bg-blue-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {page.badge}
                </span>
              ) : null}
            </div>
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
              Review permissions
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
