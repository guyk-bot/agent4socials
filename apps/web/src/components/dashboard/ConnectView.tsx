'use client';

import React from 'react';
import { Check, Minus, Star, Loader2 } from 'lucide-react';
import { InstagramIcon, FacebookIcon, YoutubeIcon, LinkedinIcon, TikTokIcon, XTwitterIcon } from '@/components/SocialPlatformIcons';
import { PLATFORM_THEMES } from '@/lib/platform-theme';

/** Per-platform visual config for the connect screen */
const PLATFORM_INFO: Record<string, {
  name: string;
  description: string;
  icon: React.ReactNode;
  bgGradient: string;    // gradient for the icon halo
  buttonGradient: string; // gradient for primary button
  buttonHover: string;
  accentBorder: string;
  accentHover: string;
}> = {
  INSTAGRAM: {
    name: 'Instagram',
    description: 'Connect a Business or Creator account to access analytics, posts, messages, and comments.',
    icon: <InstagramIcon size={44} />,
    bgGradient: 'from-pink-400 via-fuchsia-500 to-purple-600',
    buttonGradient: 'from-pink-500 to-purple-600',
    buttonHover: 'hover:from-pink-600 hover:to-purple-700',
    accentBorder: 'border-pink-300',
    accentHover: 'hover:border-pink-400 hover:bg-pink-50/50',
  },
  FACEBOOK: {
    name: 'Facebook',
    description: 'Connect the Facebook account that manages your Page to get posts, insights and inbox.',
    icon: <FacebookIcon size={44} />,
    bgGradient: 'from-blue-500 to-blue-700',
    buttonGradient: 'from-blue-500 to-blue-700',
    buttonHover: 'hover:from-blue-600 hover:to-blue-800',
    accentBorder: 'border-blue-300',
    accentHover: 'hover:border-blue-400 hover:bg-blue-50/50',
  },
  TIKTOK: {
    name: 'TikTok',
    description: 'Pull analytics and video stats from your TikTok account to improve your strategy.',
    icon: <TikTokIcon size={44} />,
    bgGradient: 'from-neutral-900 to-neutral-700',
    buttonGradient: 'from-neutral-800 to-neutral-900',
    buttonHover: 'hover:from-neutral-900 hover:to-black',
    accentBorder: 'border-neutral-400',
    accentHover: 'hover:border-neutral-500 hover:bg-neutral-100/50',
  },
  YOUTUBE: {
    name: 'YouTube',
    description: 'Connect with the Google account that owns your channel to get views, subscribers and video analytics.',
    icon: <YoutubeIcon size={44} />,
    bgGradient: 'from-red-500 to-red-700',
    buttonGradient: 'from-red-500 to-red-700',
    buttonHover: 'hover:from-red-600 hover:to-red-800',
    accentBorder: 'border-red-300',
    accentHover: 'hover:border-red-400 hover:bg-red-50/50',
  },
  TWITTER: {
    name: 'X (Twitter)',
    description: 'Authorize with the X account you want to publish from and track impressions.',
    icon: <XTwitterIcon size={44} className="text-white" />,
    bgGradient: 'from-sky-400 to-sky-600',
    buttonGradient: 'from-sky-400 to-sky-600',
    buttonHover: 'hover:from-sky-500 hover:to-sky-700',
    accentBorder: 'border-sky-300',
    accentHover: 'hover:border-sky-400 hover:bg-sky-50/50',
  },
  LINKEDIN: {
    name: 'LinkedIn',
    description: 'Sign in with the LinkedIn account you want to publish from and view professional analytics.',
    icon: <LinkedinIcon size={44} />,
    bgGradient: 'from-blue-600 to-blue-800',
    buttonGradient: 'from-blue-600 to-blue-800',
    buttonHover: 'hover:from-blue-700 hover:to-blue-900',
    accentBorder: 'border-blue-400',
    accentHover: 'hover:border-blue-500 hover:bg-blue-50/50',
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

function GradientButton({
  children,
  onClick,
  disabled,
  gradient,
  hover,
  className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  gradient: string;
  hover: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${gradient} ${hover} shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}

export default function ConnectView({ platform, onConnect, connecting, connectingMethod, oauthRedirectUrl, connectError }: ConnectViewProps) {
  const info = PLATFORM_INFO[platform];
  if (!info) return null;

  const theme = PLATFORM_THEMES[platform] ?? PLATFORM_THEMES.DEFAULT;
  const platformLower = platform.toLowerCase();

  if (platform === 'INSTAGRAM') {
    const isRedirecting = connecting && oauthRedirectUrl && !connectingMethod;
    return (
      <div className="max-w-3xl mx-auto space-y-8 px-4">
        {/* Header */}
        <div className="text-center">
          <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${info.bgGradient} shadow-lg mb-5`}>
            <InstagramIcon size={48} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect Instagram</h1>
          <p className="text-neutral-500 mt-1 max-w-md mx-auto">{info.description}</p>
        </div>

        {connectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {connectError}
          </div>
        )}

        {isRedirecting && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 text-center">
            <Loader2 size={28} className="animate-spin text-blue-600 mx-auto mb-2" />
            <p className="font-medium text-neutral-900">Redirecting to Facebook…</p>
            <p className="text-sm text-neutral-600 mt-1">If nothing happened, tap the link below.</p>
            {oauthRedirectUrl && (
              <a href={oauthRedirectUrl} className="mt-3 inline-block text-blue-600 font-medium hover:underline" target="_blank" rel="noopener noreferrer">
                Open Facebook to connect →
              </a>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Instagram-only card */}
          <button
            type="button"
            onClick={() => onConnect('instagram', 'instagram')}
            disabled={connecting}
            className={`text-left p-6 rounded-2xl border-2 ${info.accentBorder} ${info.accentHover} transition-all flex flex-col bg-white shadow-sm`}
          >
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 rounded-xl bg-gradient-to-br ${info.bgGradient}`}>
                <InstagramIcon size={22} className="text-white" />
              </div>
              <span className="text-xs font-semibold text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full uppercase">Limited</span>
            </div>
            <span className="font-bold text-neutral-900 text-base">Instagram Login only</span>
            <p className="text-xs text-neutral-500 mt-0.5 mb-4">No Facebook Page required</p>
            <ul className="space-y-2 text-sm text-neutral-600 flex-1">
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> Posts &amp; analytics</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> Comments &amp; messages</li>
              <li className="flex items-center gap-2"><Minus size={14} className="text-neutral-400 shrink-0" /> No competitor analysis</li>
            </ul>
            <div className={`mt-5 inline-flex justify-center items-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${info.buttonGradient} ${info.buttonHover}`}>
              {connecting && connectingMethod === 'instagram' ? <Loader2 size={16} className="animate-spin" /> : 'Connect'}
            </div>
          </button>

          {/* Facebook + Instagram card */}
          <button
            type="button"
            onClick={() => onConnect('instagram')}
            disabled={connecting}
            className="text-left p-6 rounded-2xl border-2 border-blue-300 hover:border-blue-400 hover:bg-blue-50/30 transition-all flex flex-col bg-white shadow-sm relative"
          >
            <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold">
              <Star size={11} /> Recommended
            </span>
            <div className="flex justify-between items-start mb-4">
              <div className="flex gap-1.5">
                <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700">
                  <FacebookIcon size={18} className="text-white" />
                </div>
                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${info.bgGradient}`}>
                  <InstagramIcon size={18} className="text-white" />
                </div>
              </div>
              <span className="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full uppercase">Full access</span>
            </div>
            <span className="font-bold text-neutral-900 text-base">Connect via Facebook</span>
            <p className="text-xs text-neutral-500 mt-0.5 mb-4">Links your Instagram to a Facebook Page</p>
            <ul className="space-y-2 text-sm text-neutral-600 flex-1">
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> Full analytics &amp; insights</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> Messages &amp; comments</li>
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> All Instagram features</li>
            </ul>
            <div className="mt-5 inline-flex justify-center items-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-500 to-blue-700 hover:from-blue-600 hover:to-blue-800">
              {connecting && !connectingMethod ? <Loader2 size={16} className="animate-spin" /> : 'Connect with Facebook'}
            </div>
          </button>
        </div>
      </div>
    );
  }

  if (platform === 'TIKTOK') {
    return (
      <div className="max-w-md mx-auto space-y-8 px-4">
        <div className="text-center">
          <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${info.bgGradient} shadow-lg mb-5`}>
            <TikTokIcon size={48} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect TikTok</h1>
          <p className="text-neutral-500 mt-1">{info.description}</p>
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
              className={`w-full flex items-center justify-center gap-3 p-4 rounded-2xl border-2 ${info.accentBorder} ${info.accentHover} transition-all font-semibold text-neutral-900 bg-white shadow-sm`}
            >
              {connecting && connectingMethod === method
                ? <Loader2 size={22} className="animate-spin" />
                : <TikTokIcon size={22} />}
              Connect {label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Generic single-button connect (YouTube, Facebook, Twitter, LinkedIn)
  return (
    <div className="max-w-md mx-auto space-y-8 px-4">
      <div className="text-center">
        <div className={`inline-flex p-3 rounded-2xl bg-gradient-to-br ${info.bgGradient} shadow-lg mb-5`}>
          {info.icon}
        </div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect {info.name}</h1>
        <p className="text-neutral-500 mt-1 max-w-sm mx-auto">{info.description}</p>
      </div>

      {connectError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{connectError}</div>
      )}

      <div className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-sm flex flex-col items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${info.bgGradient} flex items-center justify-center shadow-md`}>
          {React.cloneElement(info.icon as React.ReactElement, { size: 36, className: 'text-white' })}
        </div>
        <div className="text-center">
          <p className="font-semibold text-neutral-900">{info.name}</p>
          <p className="text-xs text-neutral-500 mt-0.5">{theme.label} · {platform === 'YOUTUBE' ? 'Google account' : platform === 'LINKEDIN' ? 'LinkedIn account' : platform === 'TWITTER' ? 'X account' : 'Account'}</p>
        </div>
        <GradientButton
          onClick={() => onConnect(platformLower)}
          disabled={connecting}
          gradient={info.buttonGradient}
          hover={info.buttonHover}
          className="w-full sm:w-auto px-8"
        >
          {connecting ? <Loader2 size={18} className="animate-spin" /> : null}
          Connect {info.name}
        </GradientButton>
      </div>
    </div>
  );
}
