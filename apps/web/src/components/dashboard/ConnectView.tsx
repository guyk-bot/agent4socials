'use client';

import React from 'react';
import Link from 'next/link';
import { Check, Star, Loader2, BookOpen, Send, Calendar, BarChart2, MessageCircle, TrendingUp } from 'lucide-react';
import { InstagramIcon, FacebookIcon, YoutubeIcon, LinkedinIcon, TikTokIcon, XTwitterIcon } from '@/components/SocialPlatformIcons';

const BULLET_ICONS = [Send, Calendar, BarChart2, MessageCircle, TrendingUp];

const PLATFORM_INFO: Record<string, {
  name: string;
  description: string;
  headerIcon: React.ReactNode;
  buttonGradient: string;
  buttonHover: string;
  accentBorder: string;
  accentHover: string;
  functionalities: string[];
  helpAnchor: string;
  /** Shown on the main connect button when using the generic layout. Defaults to name. */
  buttonLabel?: string;
}> = {
  INSTAGRAM: {
    name: 'Instagram',
    description: 'Connect your Instagram account to schedule posts, track performance, and manage conversations from one place.',
    headerIcon: <InstagramIcon size={40} />,
    buttonGradient: 'from-pink-500 to-purple-600',
    buttonHover: 'hover:from-pink-600 hover:to-purple-700',
    accentBorder: 'border-pink-200',
    accentHover: 'hover:border-pink-400 hover:bg-pink-50/40',
    functionalities: [
      'Publish posts and reels',
      'Schedule content in advance',
      'View engagement analytics',
      'Manage messages and comments from the unified inbox',
      'Track account growth and performance',
    ],
    helpAnchor: 'instagram',
  },
  FACEBOOK: {
    name: 'Facebook Page',
    description: 'Connect your Facebook Page to publish posts, manage conversations, and track performance without leaving Agent4Socials.',
    headerIcon: <FacebookIcon size={40} />,
    buttonGradient: 'from-blue-500 to-blue-700',
    buttonHover: 'hover:from-blue-600 hover:to-blue-800',
    accentBorder: 'border-blue-200',
    accentHover: 'hover:border-blue-400 hover:bg-blue-50/40',
    functionalities: [
      'Publish posts to your Facebook Page',
      'Schedule posts in advance',
      'Manage messages and comments',
      'Track page growth and engagement',
      'View analytics for posts and audience',
    ],
    helpAnchor: 'facebook',
  },
  TIKTOK: {
    name: 'TikTok',
    description: 'Connect your TikTok account to publish videos, track performance, and manage your content strategy directly from Agent4Socials.',
    headerIcon: <TikTokIcon size={40} />,
    buttonGradient: 'from-neutral-800 to-neutral-900',
    buttonHover: 'hover:from-neutral-900 hover:to-black',
    accentBorder: 'border-neutral-300',
    accentHover: 'hover:border-neutral-500 hover:bg-neutral-100/40',
    functionalities: [
      'Publish videos directly to TikTok',
      'Schedule videos in advance',
      'Track follower growth and video performance',
      'View video analytics and engagement metrics',
      'Manage your TikTok content from one dashboard',
    ],
    helpAnchor: 'tiktok',
  },
  YOUTUBE: {
    name: 'YouTube',
    description: 'Connect your YouTube channel to publish videos, track analytics, and manage comments from one dashboard.',
    headerIcon: <YoutubeIcon size={40} />,
    buttonGradient: 'from-red-500 to-red-700',
    buttonHover: 'hover:from-red-600 hover:to-red-800',
    accentBorder: 'border-red-200',
    accentHover: 'hover:border-red-400 hover:bg-red-50/40',
    functionalities: [
      'Upload videos directly',
      'Schedule video publishing',
      'Track video performance and channel growth',
      'View engagement analytics',
      'Manage YouTube comments from the inbox',
    ],
    helpAnchor: 'youtube',
    buttonLabel: 'YouTube Channel',
  },
  TWITTER: {
    name: 'X (Twitter)',
    description: 'Connect your X account to publish posts, schedule content, and monitor performance from Agent4Socials.',
    headerIcon: <XTwitterIcon size={40} className="text-neutral-900" />,
    buttonGradient: 'from-sky-400 to-sky-600',
    buttonHover: 'hover:from-sky-500 hover:to-sky-700',
    accentBorder: 'border-sky-200',
    accentHover: 'hover:border-sky-400 hover:bg-sky-50/40',
    functionalities: [
      'Publish posts directly',
      'Schedule posts in advance',
      'Track engagement and impressions',
      'Monitor performance analytics',
      'Manage replies and conversations',
    ],
    helpAnchor: 'twitter-x',
    buttonLabel: 'X Account',
  },
  LINKEDIN: {
    name: 'LinkedIn',
    description: 'Connect your LinkedIn account to publish content, schedule posts, and track engagement from one dashboard.',
    headerIcon: <LinkedinIcon size={40} />,
    buttonGradient: 'from-blue-600 to-blue-800',
    buttonHover: 'hover:from-blue-700 hover:to-blue-900',
    accentBorder: 'border-blue-200',
    accentHover: 'hover:border-blue-400 hover:bg-blue-50/40',
    functionalities: [
      'Publish posts to LinkedIn',
      'Schedule content in advance',
      'Track engagement and performance',
      'Monitor audience growth',
      'Manage LinkedIn comments',
    ],
    helpAnchor: 'linkedin',
    buttonLabel: 'LinkedIn Account',
  },
};

type ConnectViewProps = {
  platform: string;
  onConnect: (platform: string, method?: string) => void;
  connecting: boolean;
  connectingMethod?: string;
  connectError?: string | null;
};

function ConnectPageSections({
  functionalities,
  helpAnchor,
}: {
  functionalities: string[];
  helpAnchor: string;
}) {
  return (
    <div className="space-y-4 text-left">
      <div>
        <h2 className="text-sm font-semibold text-neutral-700 mb-2">What you can do</h2>
        <ul className="space-y-1.5 text-sm text-neutral-600">
          {functionalities.map((item, i) => {
            const IconComponent = BULLET_ICONS[i % BULLET_ICONS.length];
            return (
              <li key={i} className="flex items-start gap-2">
                <Check size={14} className="text-green-600 shrink-0 mt-0.5" />
                <IconComponent size={14} className="text-neutral-400 shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="pt-1">
        <Link
          href={`/help#${helpAnchor}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
        >
          <BookOpen size={16} />
          Learn more about platform capabilities
          <span className="ml-0.5">→</span>
        </Link>
      </div>
    </div>
  );
}

export default function ConnectView({ platform, onConnect, connecting, connectingMethod, connectError }: ConnectViewProps) {
  const info = PLATFORM_INFO[platform];
  if (!info) return null;

  const platformLower = platform.toLowerCase();

  // ── INSTAGRAM (two options: IG-only vs Facebook) ──────────────────────────
  if (platform === 'INSTAGRAM') {
    return (
      <div className="min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
        <div className="max-w-2xl mx-auto px-4 w-full">
        <div className={`rounded-2xl border-2 p-6 sm:p-8 ${info.accentBorder} bg-gradient-to-b from-white to-pink-50/30 shadow-sm mb-6`}>
          <div className="text-center pt-2 pb-4">
            <div className="inline-flex mb-3">{info.headerIcon}</div>
            <h1 className="text-2xl font-bold text-neutral-900">Connect Instagram</h1>
            <p className="text-neutral-500 mt-1 max-w-sm mx-auto text-sm">{info.description}</p>
          </div>

          <ConnectPageSections
            functionalities={info.functionalities}
            helpAnchor={info.helpAnchor}
          />

          {connectError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-4">{connectError}</div>
          )}
        </div>
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
      </div>
    );
  }

  // ── TIKTOK (two account type buttons) ─────────────────────────────────────
  if (platform === 'TIKTOK') {
    return (
      <div className="min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
        <div className="max-w-lg mx-auto px-4 w-full">
        <div className={`rounded-2xl border-2 p-6 sm:p-8 ${info.accentBorder} bg-gradient-to-b from-white to-neutral-100/80 shadow-sm`}>
          <div className="text-center pt-2 pb-4">
            <div className="inline-flex mb-3">{info.headerIcon}</div>
            <h1 className="text-2xl font-bold text-neutral-900">Connect TikTok</h1>
            <p className="text-neutral-500 mt-1 text-sm">{info.description}</p>
          </div>

          <ConnectPageSections
            functionalities={info.functionalities}
            helpAnchor={info.helpAnchor}
          />

          {connectError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-4">{connectError}</div>
          )}
          <div className="space-y-3 mt-6">
          {[
            { method: 'personal', label: 'Personal Account' },
            { method: 'business', label: 'Business Account' },
          ].map(({ method, label }) => (
            <button
              key={method}
              type="button"
              onClick={() => onConnect('tiktok', method)}
              disabled={connecting}
              className="w-full flex items-center justify-center gap-2.5 py-3 px-5 rounded-xl border-2 border-neutral-900 bg-neutral-900 text-white font-semibold text-sm transition-all hover:bg-neutral-800 hover:border-neutral-800 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {connecting && connectingMethod === method ? <Loader2 size={18} className="animate-spin" /> : null}
              Connect {label}
            </button>
          ))}
        </div>
        </div>
        </div>
      </div>
    );
  }

  // ── GENERIC (Facebook, YouTube, Twitter, LinkedIn) ────────────────────────
  return (
    <div className="min-h-[calc(100vh-6rem)] flex items-start justify-center pt-16 sm:pt-20">
      <div className="max-w-lg mx-auto px-4 w-full">
      <div className={`rounded-2xl border-2 p-6 sm:p-8 ${info.accentBorder} bg-gradient-to-b from-white to-neutral-50/80 shadow-sm`}>
        <div className="text-center pt-2 pb-4">
          <div className="inline-flex mb-3">{info.headerIcon}</div>
          <h1 className="text-2xl font-bold text-neutral-900">Connect {info.name}</h1>
          <p className="text-neutral-500 mt-1 text-sm max-w-xs mx-auto">{info.description}</p>
        </div>

<ConnectPageSections
        functionalities={info.functionalities}
        helpAnchor={info.helpAnchor}
      />

        {connectError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 mt-4">{connectError}</div>
        )}

        <button
          type="button"
          onClick={() => onConnect(platformLower)}
          disabled={connecting}
          className={`mt-6 w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white bg-gradient-to-r ${info.buttonGradient} ${info.buttonHover} transition-all shadow-sm disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {connecting ? <Loader2 size={18} className="animate-spin" /> : null}
          Connect {info.buttonLabel ?? info.name}
        </button>
      </div>
    </div>
  </div>
  );
}
