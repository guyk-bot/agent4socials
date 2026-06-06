'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import {
  FacebookIcon,
  InstagramIcon,
  LinkedinIcon,
  PinterestIcon,
  ThreadsIcon,
  TikTokIcon,
  XTwitterIcon,
  YoutubeIcon,
} from '@/components/SocialPlatformIcons';
import {
  closeOAuthConnectPopup,
  navigateOAuthConnect,
  prepareOAuthConnectPopup,
} from '@/lib/oauth-connect';

type ConnectArtifact = Extract<AysopArtifact, { type: 'connect_platforms' }>;

const ICONS: Record<string, React.ReactNode> = {
  FACEBOOK: <FacebookIcon size={18} />,
  INSTAGRAM: <InstagramIcon size={18} />,
  TIKTOK: <TikTokIcon size={18} />,
  YOUTUBE: <YoutubeIcon size={18} />,
  TWITTER: <XTwitterIcon size={18} className="text-neutral-800 dark:text-neutral-200" />,
  LINKEDIN: <LinkedinIcon size={18} />,
  PINTEREST: <PinterestIcon size={18} />,
  THREADS: <ThreadsIcon size={18} />,
};

export function AysopInChatConnectCard({ artifact }: { artifact: ConnectArtifact }) {
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (platform: string, slug: string) => {
    if (connecting) return;
    setError(null);
    const oauthPopup = prepareOAuthConnectPopup();
    setConnecting(platform);
    try {
      const res = await api.get<{ url?: string }>(`/social/oauth/${slug}/start`);
      const url = res.data?.url;
      if (!url || typeof url !== 'string') {
        closeOAuthConnectPopup(oauthPopup);
        setError('Could not start sign-in. Try again in a moment.');
        return;
      }
      if (platform === 'TWITTER') {
        closeOAuthConnectPopup(oauthPopup);
        window.location.assign(url);
        return;
      }
      const opened = navigateOAuthConnect(url, oauthPopup);
      if (!opened.opened) {
        setError('Allow pop-ups for agent4socials.com, then tap Connect again.');
      }
    } catch {
      closeOAuthConnectPopup(oauthPopup);
      setError('Connect failed. Try again.');
    } finally {
      setConnecting(null);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
      <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">Connect platforms</p>
      {artifact.connected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {artifact.connected.map((acc) => (
            <span
              key={acc.platform}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
            >
              {ICONS[acc.platform] ?? null}
              {acc.name}
              {acc.username ? ` @${acc.username.replace(/^@/, '')}` : ''}
            </span>
          ))}
        </div>
      ) : null}
      {artifact.missing.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {artifact.missing.map((row) => (
            <button
              key={row.platform}
              type="button"
              disabled={connecting === row.platform}
              onClick={() => void handleConnect(row.platform, row.slug)}
              className="flex flex-col items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-2 py-3 hover:border-[var(--primary)] hover:bg-white dark:hover:bg-neutral-900 transition-colors disabled:opacity-50"
            >
              {connecting === row.platform ? (
                <Loader2 size={18} className="animate-spin text-neutral-500" />
              ) : (
                ICONS[row.platform]
              )}
              <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200">{row.name}</span>
              <span className="text-[10px] text-[var(--primary)] font-semibold">Connect</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">All supported platforms are connected.</p>
      )}
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
