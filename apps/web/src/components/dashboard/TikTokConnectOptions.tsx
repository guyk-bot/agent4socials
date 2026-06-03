'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Star, Loader2, BookOpen } from 'lucide-react';
import { TikTokIcon } from '@/components/SocialPlatformIcons';
import { TIKTOK_CONNECT_OPTIONS, type TikTokConnectMethod } from '@/lib/tiktok/connect-options';

type Props = {
  connecting: boolean;
  connectingMethod?: string;
  connectError?: string | null;
  onConnect: (platform: string, method?: string) => void;
};

export default function TikTokConnectOptions({
  connecting,
  connectingMethod,
  connectError,
  onConnect,
}: Props) {
  const personal = TIKTOK_CONNECT_OPTIONS.personal;
  const business = TIKTOK_CONNECT_OPTIONS.business;

  const renderCard = (
    method: TikTokConnectMethod,
    copy: typeof personal,
    options?: { recommended?: boolean }
  ) => (
    <button
      type="button"
      onClick={() => onConnect('tiktok', method)}
      disabled={connecting}
      className={`connect-option text-left p-5 rounded-2xl border-2 transition-all flex flex-col bg-white ${
        options?.recommended
          ? 'border-neutral-400 hover:border-neutral-600 hover:bg-neutral-50/60 relative'
          : 'border-neutral-300 hover:border-neutral-500 hover:bg-neutral-50/40'
      }`}
    >
      {options?.recommended ? (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full mb-2 w-fit whitespace-nowrap">
          <Star size={10} className="shrink-0" /> Recommended for brands
        </span>
      ) : (
        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{copy.badge}</span>
      )}
      <span className="font-semibold text-neutral-900 mt-1">{copy.title}</span>
      <p className="text-xs text-neutral-500 mt-0.5 mb-3">{copy.subtitle}</p>
      <p className="text-xs font-semibold text-neutral-700 mb-1.5">Included in Agent4Socials</p>
      <ul className="space-y-1.5 text-sm flex-1">
        {copy.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-neutral-600">
            <Check size={13} className="text-green-500 shrink-0 mt-0.5" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs font-semibold text-neutral-500 mt-3 mb-1.5">Limitations</p>
      <ul className="space-y-1 text-xs text-neutral-500 mb-1">
        {copy.limitations.map((line) => (
          <li key={line} className="flex items-start gap-2">
            <span className="text-neutral-400 shrink-0 mt-0.5" aria-hidden>
              ·
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 w-full py-2.5 rounded-xl text-sm font-semibold text-center text-white bg-gradient-to-r from-black to-neutral-900 flex items-center justify-center gap-2">
        {connecting && connectingMethod === method ? <Loader2 size={15} className="animate-spin" /> : null}
        Connect {copy.title}
      </div>
    </button>
  );

  return (
    <div className="connect-view-scope min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
      <div className="max-w-2xl mx-auto px-4 w-full">
        <div className="connect-surface rounded-2xl border-2 border-neutral-300 bg-gradient-to-b from-white to-neutral-100/80 p-6 sm:p-8 shadow-sm mb-6">
          <div className="text-center pt-2 pb-4">
            <div className="inline-flex mb-3">
              <TikTokIcon size={40} />
            </div>
            <h1 className="text-2xl font-bold text-neutral-900">Connect TikTok</h1>
            <p className="text-neutral-500 mt-1 max-w-md mx-auto text-sm">
              Choose the account type you will sign in with on TikTok. Both use the same Agent4Socials features; pick
              the card that matches how you use TikTok today.
            </p>
          </div>
          {connectError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-2">
              {connectError}
            </div>
          ) : null}
          <div className="pt-2 text-center">
            <Link
              href="/help#tiktok"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
            >
              <BookOpen size={16} />
              Learn more about TikTok capabilities
              <span className="ml-0.5">→</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {renderCard('personal', personal)}
          {renderCard('business', business, { recommended: true })}
        </div>
      </div>
    </div>
  );
}
