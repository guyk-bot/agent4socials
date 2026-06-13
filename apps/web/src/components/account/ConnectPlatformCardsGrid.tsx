'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  FacebookIcon,
  InstagramIcon,
  TikTokIcon,
  YoutubeIcon,
  XTwitterIcon,
  LinkedinIcon,
  PinterestIcon,
  ThreadsIcon,
} from '@/components/SocialPlatformIcons';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import {
  CONNECT_CARD_CLASS,
  CONNECT_PLATFORM_CARDS,
  readFunnelPreferredPlatformIds,
  sortConnectPlatformCards,
} from '@/lib/connect-platform-cards';

export type ConnectGridAccount = {
  id: string;
  platform: string;
  username?: string | null;
  profilePicture?: string | null;
  linkedinConnectionKind?: string;
  tiktokConnectionKind?: string;
  linkedinPublishReady?: boolean;
  linkedinReconnectHint?: string | null;
};

const CONNECT_GRID_ICON: Record<string, React.ReactNode> = {
  FACEBOOK: <FacebookIcon size={26} />,
  INSTAGRAM: <InstagramIcon size={26} />,
  TIKTOK: <TikTokIcon size={26} />,
  YOUTUBE: <YoutubeIcon size={26} />,
  TWITTER: <XTwitterIcon size={26} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={26} />,
  PINTEREST: <PinterestIcon size={26} />,
  THREADS: <ThreadsIcon size={26} />,
};

const CONNECT_LABEL_ICON: Record<string, React.ReactNode> = {
  FACEBOOK: <FacebookIcon size={14} />,
  INSTAGRAM: <InstagramIcon size={14} />,
  TIKTOK: <TikTokIcon size={14} />,
  YOUTUBE: <YoutubeIcon size={14} />,
  TWITTER: <XTwitterIcon size={14} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={14} />,
  PINTEREST: <PinterestIcon size={14} />,
  THREADS: <ThreadsIcon size={14} />,
};

type ConnectPlatformCardsGridProps = {
  accounts: ConnectGridAccount[];
  preferredPlatformIds?: string[];
  connectHrefPrefix?: string;
  reconnectingId?: string | null;
  disconnectingId?: string | null;
  onReconnect?: (account: ConnectGridAccount) => void;
  onDisconnect?: (account: ConnectGridAccount) => void;
};

export function ConnectPlatformCardsGrid({
  accounts,
  preferredPlatformIds,
  connectHrefPrefix = '/dashboard/connect',
  reconnectingId = null,
  disconnectingId = null,
  onReconnect,
  onDisconnect,
}: ConnectPlatformCardsGridProps) {
  const accountByPlatform = useMemo(
    () =>
      accounts.reduce<Record<string, ConnectGridAccount>>((map, acc) => {
        map[acc.platform] = acc;
        return map;
      }, {}),
    [accounts]
  );

  const orderedCards = useMemo(() => {
    const preferred = preferredPlatformIds ?? readFunnelPreferredPlatformIds();
    return sortConnectPlatformCards([...CONNECT_PLATFORM_CARDS], preferred);
  }, [preferredPlatformIds]);

  return (
    <div className="account-connect-frame rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {orderedCards.map(({ id, name, slug }) => {
          const acc = accountByPlatform[id];
          if (acc) {
            const isDisconnecting = disconnectingId === acc.id;
            return (
              <div
                key={acc.id}
                className={`account-connect-card relative rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 text-center transition-opacity ${isDisconnecting ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {isDisconnecting && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/90 dark:bg-neutral-900/90">
                    <Loader2 size={22} className="animate-spin text-red-600" aria-hidden />
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
                      Disconnecting...
                    </span>
                  </div>
                )}
                <div className="flex justify-center">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-100 flex items-center justify-center">
                    {(() => {
                      const src = avatarDisplayUrl(acc.platform, acc.profilePicture);
                      if (src) {
                        return <img src={src} alt="" className="h-full w-full object-cover" />;
                      }
                      return (
                        <span className="w-9 h-9 flex items-center justify-center">
                          {CONNECT_GRID_ICON[acc.platform] ?? <FacebookIcon size={24} />}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <div className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-800">
                  <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                    {CONNECT_LABEL_ICON[acc.platform] ?? <FacebookIcon size={14} />}
                  </span>
                  <span>
                    {acc.platform === 'TWITTER'
                      ? 'Twitter/X'
                      : acc.platform.charAt(0) + acc.platform.slice(1).toLowerCase()}
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-neutral-500 truncate">
                  {(acc.username || '').replace(/^@/, '') || 'Connected'}
                </div>
                {acc.platform === 'LINKEDIN' && acc.linkedinConnectionKind === 'organization_page' ? (
                  <p className="mt-1 text-[10px] font-medium text-blue-700">Company Page</p>
                ) : acc.platform === 'LINKEDIN' ? (
                  <p className="mt-1 text-[10px] font-medium text-blue-700">Personal profile</p>
                ) : acc.platform === 'TIKTOK' && acc.tiktokConnectionKind === 'business' ? (
                  <p className="mt-1 text-[10px] font-medium text-neutral-800">Business account</p>
                ) : acc.platform === 'TIKTOK' && acc.tiktokConnectionKind === 'personal' ? (
                  <p className="mt-1 text-[10px] font-medium text-neutral-800">Personal account</p>
                ) : null}
                {acc.platform === 'LINKEDIN' &&
                acc.linkedinPublishReady === false &&
                typeof acc.linkedinReconnectHint === 'string' &&
                acc.linkedinReconnectHint.trim() ? (
                  <p className="mt-2 text-left text-[10px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                    {acc.linkedinReconnectHint}
                  </p>
                ) : null}
                {onReconnect && onDisconnect ? (
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onReconnect(acc)}
                      disabled={reconnectingId === acc.id || isDisconnecting}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] sm:text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {reconnectingId === acc.id ? <RefreshCw size={12} className="animate-spin" /> : null}
                      Reconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => onDisconnect(acc)}
                      disabled={Boolean(disconnectingId) || reconnectingId === acc.id}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] sm:text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {isDisconnecting ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                      Disconnect
                    </button>
                  </div>
                ) : null}
              </div>
            );
          }
          return (
            <Link
              key={id}
              href={`${connectHrefPrefix}?connect=${slug}`}
              className={CONNECT_CARD_CLASS}
              onClick={() => {
                try {
                  sessionStorage.setItem('a4s_connect_from_account', '1');
                } catch {
                  /* ignore */
                }
              }}
            >
              <div className="w-9 h-9 flex items-center justify-center shrink-0">{CONNECT_GRID_ICON[id]}</div>
              <span className="text-xs sm:text-sm font-semibold text-neutral-800">{name}</span>
              <span className="text-[10px] sm:text-xs text-neutral-500 group-hover:text-neutral-700">Connect</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
