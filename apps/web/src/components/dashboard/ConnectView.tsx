'use client';

import React from 'react';
import { Instagram, Facebook, Youtube, Linkedin, Check, Minus, Star, Loader2 } from 'lucide-react';

function TikTokIcon({ size = 24, className = '' }: { size?: number; className?: string }) {
  return <span className={`font-bold ${className || 'text-neutral-800'}`} style={{ fontSize: size }}>TT</span>;
}

function TwitterIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-sky-500">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORM_INFO: Record<string, { name: string; description: string; icon: React.ReactNode }> = {
  INSTAGRAM: {
    name: 'Instagram',
    description: 'Use a Business or Creator account to connect.',
    icon: <Instagram size={40} className="text-pink-600" />,
  },
  FACEBOOK: {
    name: 'Facebook',
    description: 'Use the Facebook account that manages your Page. If you have multiple Pages: opt in to "current Pages only" and choose the page you want to connect.',
    icon: <Facebook size={40} className="text-blue-600" />,
  },
  TIKTOK: {
    name: 'TikTok',
    description: 'Extract the analytics related to your TikTok account and improve your strategy based on the data.',
    icon: <TikTokIcon size={40} />,
  },
  YOUTUBE: {
    name: 'YouTube',
    description: 'Connect with the Google account that owns your channel.',
    icon: <Youtube size={40} className="text-red-600" />,
  },
  TWITTER: {
    name: 'X (Twitter)',
    description: 'Authorize with the X account you want to post from.',
    icon: <TwitterIcon size={40} />,
  },
  LINKEDIN: {
    name: 'LinkedIn',
    description: 'Sign in with the LinkedIn account you want to publish from.',
    icon: <Linkedin size={40} className="text-blue-700" />,
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

  if (platform === 'LINKEDIN') {
    return (
      <div className="max-w-xl mx-auto card border-2 border-dashed border-amber-200 bg-amber-50/50 flex flex-col items-center justify-center py-16 text-center">
        <Linkedin size={48} className="text-blue-700 mb-4" />
        <h2 className="text-xl font-semibold text-neutral-900">LinkedIn</h2>
        <p className="text-amber-800 font-medium mt-2">Coming soon</p>
        <p className="text-sm text-neutral-500 mt-1">{info.description}</p>
      </div>
    );
  }

  if (platform === 'INSTAGRAM') {
    const isRedirecting = connecting && oauthRedirectUrl && !connectingMethod;
    return (
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-amber-500 mb-4">
            <Instagram size={48} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect Instagram account</h1>
          <p className="text-neutral-500 mt-1">Select how you would like to connect your account</p>
        </div>
        {connectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {connectError}
          </div>
        )}
        {isRedirecting && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-center">
            <Loader2 size={28} className="animate-spin text-indigo-600 mx-auto mb-2" />
            <p className="font-medium text-neutral-900">Redirecting you to Facebook…</p>
            <p className="text-sm text-neutral-600 mt-1">If nothing happened, click the link below.</p>
            {oauthRedirectUrl && (
              <a href={oauthRedirectUrl} className="mt-3 inline-block text-indigo-600 font-medium hover:underline" target="_blank" rel="noopener noreferrer">
                Open Facebook to connect →
              </a>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <button
            type="button"
            onClick={() => onConnect('instagram', 'instagram')}
            disabled={connecting}
            className="text-left p-6 rounded-xl border-2 border-neutral-200 hover:border-pink-300 hover:bg-pink-50/50 transition-all flex flex-col card"
          >
            <div className="flex justify-between items-start mb-3">
              <Instagram size={24} className="text-pink-600" />
              <span className="text-xs font-semibold text-neutral-500 uppercase">Limited access</span>
            </div>
            <span className="font-semibold text-neutral-900">Connect via Instagram</span>
            <ul className="mt-3 space-y-2 text-sm text-neutral-600">
              <li className="flex items-center gap-2"><Check size={14} className="text-green-600 shrink-0" /> Only basic metrics</li>
              <li className="flex items-center gap-2"><Minus size={14} className="text-neutral-400 shrink-0" /> Access to inbox</li>
              <li className="flex items-center gap-2"><Minus size={14} className="text-neutral-400 shrink-0" /> Competitor analysis</li>
              <li className="flex items-center gap-2"><Minus size={14} className="text-neutral-400 shrink-0" /> Tag products</li>
            </ul>
            <span className="mt-4 btn-primary inline-flex justify-center gap-2 py-2.5 text-sm w-full">
              {connecting && connectingMethod === 'instagram' ? <Loader2 size={18} className="animate-spin" /> : 'Connect'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onConnect('instagram')}
            disabled={connecting}
            className="text-left p-6 rounded-xl border-2 border-indigo-200 bg-indigo-50/30 hover:border-indigo-400 hover:bg-indigo-50/50 transition-all flex flex-col card relative"
          >
            <span className="absolute top-4 right-4 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              <Star size={12} /> Recommended
            </span>
            <div className="flex justify-between items-start mb-3">
              <div className="flex gap-1">
                <Facebook size={24} className="text-blue-600" />
                <Instagram size={24} className="text-pink-600" />
              </div>
              <span className="text-xs font-semibold text-green-600 uppercase">Full access</span>
            </div>
            <span className="font-semibold text-neutral-900">Connect via Facebook</span>
            <p className="mt-3 text-sm text-neutral-600 flex items-start gap-2">
              <Check size={14} className="text-green-600 shrink-0 mt-0.5" />
              You have access to all Instagram features we offer
            </p>
            <p className="text-sm text-neutral-500 mt-1">You need to link your Instagram to a Facebook page.</p>
            <span className="mt-4 btn-primary inline-flex justify-center gap-2 py-2.5 text-sm w-full">
              {connecting && !connectingMethod ? <Loader2 size={18} className="animate-spin" /> : 'Connect'}
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (platform === 'TIKTOK') {
    return (
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <div className="inline-flex p-4 rounded-full bg-neutral-900 mb-4 text-white">
            <TikTokIcon size={48} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect your TikTok and extract all the analytics</h1>
          <p className="text-neutral-500 mt-1">{info.description}</p>
        </div>
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => onConnect('tiktok')}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition-all font-medium text-neutral-900 card"
          >
            {connecting ? <Loader2 size={24} className="animate-spin" /> : <TikTokIcon size={24} />}
            Connect a TikTok personal account
          </button>
          <button
            type="button"
            onClick={() => onConnect('tiktok')}
            disabled={connecting}
            className="w-full flex items-center justify-center gap-3 p-4 rounded-xl border-2 border-neutral-200 hover:border-neutral-400 hover:bg-neutral-50 transition-all font-medium text-neutral-900 card"
          >
            {connecting ? <Loader2 size={24} className="animate-spin" /> : <TikTokIcon size={24} />}
            Connect a TikTok business account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-8">
      <div className="text-center">
        <div className="inline-flex p-4 rounded-full bg-neutral-100 mb-4">{info.icon}</div>
        <h1 className="text-2xl font-bold text-neutral-900">Connect {info.name}</h1>
        <p className="text-neutral-500 mt-1">{info.description}</p>
      </div>
      <div className="card p-6 flex flex-col items-center">
        <button
          type="button"
          onClick={() => onConnect(platformLower)}
          disabled={connecting}
          className="btn-primary inline-flex items-center justify-center gap-2 py-3 px-6 w-full sm:w-auto"
        >
          {connecting ? <Loader2 size={20} className="animate-spin" /> : null}
          Connect {info.name}
        </button>
      </div>
    </div>
  );
}
