'use client';

import React from 'react';
import { Check, Minus, Star, Loader2 } from 'lucide-react';
import { InstagramIcon, FacebookIcon, YoutubeIcon, LinkedinIcon, TikTokIcon, XTwitterIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_INFO: Record<string, {
  name: string;
  description: string;
  headerIcon: React.ReactNode;
  buttonGradient: string;
  buttonHover: string;
  accentBorder: string;
  accentHover: string;
}> = {
  INSTAGRAM: {
    name: 'Instagram',
    description: 'Connect a Business or Creator account to access analytics, posts, messages, and comments.',
    headerIcon: <InstagramIcon size={40} />,
    buttonGradient: 'from-pink-500 to-purple-600',
    buttonHover: 'hover:from-pink-600 hover:to-purple-700',
    accentBorder: 'border-pink-200',
    accentHover: 'hover:border-pink-400 hover:bg-pink-50/40',
  },
  FACEBOOK: {
    name: 'Facebook',
    description: 'Connect the Facebook account that manages your Page to get posts, insights and inbox.',
    headerIcon: <FacebookIcon size={40} />,
    buttonGradient: 'from-blue-500 to-blue-700',
    buttonHover: 'hover:from-blue-600 hover:to-blue-800',
    accentBorder: 'border-blue-200',
    accentHover: 'hover:border-blue-400 hover:bg-blue-50/40',
  },
  TIKTOK: {
    name: 'TikTok',
    description: 'Pull analytics and video stats from your TikTok account to improve your strategy.',
    headerIcon: <TikTokIcon size={40} />,
    buttonGradient: 'from-neutral-800 to-neutral-900',
    buttonHover: 'hover:from-neutral-900 hover:to-black',
    accentBorder: 'border-neutral-300',
    accentHover: 'hover:border-neutral-500 hover:bg-neutral-100/40',
  },
  YOUTUBE: {
    name: 'YouTube',
    description: 'Connect with the Google account that owns your channel to get views, subscribers and video analytics.',
    headerIcon: <YoutubeIcon size={40} />,
    buttonGradient: 'from-red-500 to-red-700',
    buttonHover: 'hover:from-red-600 hover:to-red-800',
    accentBorder: 'border-red-200',
    accentHover: 'hover:border-red-400 hover:bg-red-50/40',
  },
  TWITTER: {
    name: 'X (Twitter)',
    description: 'Authorize with the X account you want to publish from and track impressions.',
    headerIcon: <XTwitterIcon size={40} className="text-neutral-900" />,
    buttonGradient: 'from-sky-400 to-sky-600',
    buttonHover: 'hover:from-sky-500 hover:to-sky-700',
    accentBorder: 'border-sky-200',
    accentHover: 'hover:border-sky-400 hover:bg-sky-50/40',
  },
  LINKEDIN: {
    name: 'LinkedIn',
    description: 'Sign in with the LinkedIn account you want to publish from and view professional analytics.',
    headerIcon: <LinkedinIcon size={40} />,
    buttonGradient: 'from-blue-600 to-blue-800',
    buttonHover: 'hover:from-blue-700 hover:to-blue-900',
    accentBorder: 'border-blue-200',
    accentHover: 'hover:border-blue-400 hover:bg-blue-50/40',
  },
};

type ConnectViewProps = {
  platform: string;
  onConnect: (platform: string, method?: string) => void;
  connecting: boolean;
  connectingMethod?: string;
  oauthRedirectUrl?: string | null;
  connectError?: string | null;
};

export default function ConnectView({ platform, onConnect, connecting, connectingMethod, oauthRedirectUrl, connectError }: ConnectViewProps) {
  const info = PLATFORM_INFO[platform];
  if (!info) return null;

  const platformLower = platform.toLowerCase();

  // ── INSTAGRAM (two options: IG-only vs Facebook) ──────────────────────────
  if (platform === 'INSTAGRAM') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 px-4">
        {/* Header — icon only, no background */}
        <div className="text-center pt-2">
          <div className="inline-flex mb-3">{info.headerIcon}</div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect Instagram</h1>
          <p className="text-neutral-500 mt-1 max-w-sm mx-auto text-sm">{info.description}</p>
        </div>

        {connectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{connectError}</div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Instagram-only */}
          <button
            type="button"
            onClick={() => onConnect('instagram', 'instagram')}
            disabled={connecting}
            className={`text-left p-5 rounded-2xl border-2 ${info.accentBorder} ${info.accentHover} transition-all flex flex-col bg-white`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-neutral-400 bg-neutral-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Limited</span>
            </div>
            <span className="font-semibold text-neutral-900 mb-0.5">Instagram Login only</span>
            <p className="text-xs text-neutral-400 mb-4">No Facebook Page required</p>
            <ul className="space-y-1.5 text-sm text-neutral-600 flex-1">
              <li className="flex items-center gap-2"><Check size={13} className="text-green-500 shrink-0" /> Posts &amp; analytics</li>
              <li className="flex items-center gap-2"><Check size={13} className="text-green-500 shrink-0" /> Comments &amp; messages</li>
              <li className="flex items-center gap-2"><Minus size={13} className="text-neutral-300 shrink-0" /> No competitor analysis</li>
            </ul>
            <div className={`mt-5 flex justify-center items-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${info.buttonGradient} ${info.buttonHover} transition-all`}>
              {connecting && connectingMethod === 'instagram' ? <Loader2 size={15} className="animate-spin" /> : 'Connect'}
            </div>
          </button>

          {/* Facebook + Instagram */}
          <button
            type="button"
            onClick={() => onConnect('instagram')}
            disabled={connecting}
            className="text-left p-5 rounded-2xl border-2 border-blue-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col bg-white relative"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                <Star size={10} /> Recommended
              </span>
              <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full uppercase tracking-wide">Full access</span>
            </div>
            <span className="font-semibold text-neutral-900 mb-0.5">Connect via Facebook</span>
            <p className="text-xs text-neutral-400 mb-4">Links your Instagram to a Facebook Page</p>
            <ul className="space-y-1.5 text-sm text-neutral-600 flex-1">
              <li className="flex items-center gap-2"><Check size={13} className="text-green-500 shrink-0" /> Full analytics &amp; insights</li>
              <li className="flex items-center gap-2"><Check size={13} className="text-green-500 shrink-0" /> Messages &amp; comments</li>
              <li className="flex items-center gap-2"><Check size={13} className="text-green-500 shrink-0" /> All Instagram features</li>
            </ul>
            <div className="mt-5 flex justify-center items-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800 transition-all">
              {connecting && !connectingMethod ? <Loader2 size={15} className="animate-spin" /> : 'Connect with Facebook'}
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── TIKTOK (two account type buttons) ─────────────────────────────────────
  if (platform === 'TIKTOK') {
    return (
      <div className="max-w-sm mx-auto space-y-6 px-4">
        <div className="text-center pt-2">
          <div className="inline-flex mb-3">{info.headerIcon}</div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect TikTok</h1>
          <p className="text-neutral-500 mt-1 text-sm">{info.description}</p>
        </div>
        {connectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{connectError}</div>
        )}
        <div className="space-y-3">
          {[
            { method: 'personal', label: 'Personal account' },
            { method: 'business', label: 'Business account' },
          ].map(({ method, label }) => (
            <button
              key={method}
              type="button"
              onClick={() => onConnect('tiktok', method)}
              disabled={connecting}
              className={`w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl border-2 ${info.accentBorder} ${info.accentHover} transition-all font-semibold text-sm text-neutral-900 bg-white`}
            >
              {connecting && connectingMethod === method ? <Loader2 size={18} className="animate-spin" /> : null}
              Connect {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── GENERIC (Facebook, YouTube, Twitter, LinkedIn) ────────────────────────
  return (
    <div className="max-w-sm mx-auto space-y-6 px-4">
      <div className="text-center pt-2">
        <div className="inline-flex mb-3">{info.headerIcon}</div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect {info.name}</h1>
        <p className="text-neutral-500 mt-1 text-sm max-w-xs mx-auto">{info.description}</p>
      </div>

      {connectError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{connectError}</div>
      )}

      <button
        type="button"
        onClick={() => onConnect(platformLower)}
        disabled={connecting}
        className={`w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${info.buttonGradient} ${info.buttonHover} transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        {connecting ? <Loader2 size={18} className="animate-spin" /> : null}
        Connect {info.name}
      </button>
    </div>
  );
}
