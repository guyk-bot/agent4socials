'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData } from '@/context/AppDataContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon, ThreadsIcon } from '@/components/SocialPlatformIcons';
import { Loader2, RefreshCw } from 'lucide-react';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import {
  closeOAuthConnectPopup,
  listenForOAuthComplete,
  navigateOAuthConnect,
  prepareOAuthConnectPopup,
} from '@/lib/oauth-connect';

/** Same connect targets and styling as Summary dashboard empty state (compact grid on Account page). */
const CONNECT_PLATFORM_CARDS: { id: string; name: string; slug: string; border: string; bg: string }[] = [
  { id: 'FACEBOOK', name: 'Facebook', slug: 'facebook', border: 'border-blue-200', bg: 'bg-neutral-100/80' },
  { id: 'INSTAGRAM', name: 'Instagram', slug: 'instagram', border: 'border-pink-200', bg: 'bg-pink-50/50' },
  { id: 'TIKTOK', name: 'TikTok', slug: 'tiktok', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
  { id: 'YOUTUBE', name: 'YouTube', slug: 'youtube', border: 'border-red-200', bg: 'bg-red-50/50' },
  { id: 'TWITTER', name: 'Twitter/X', slug: 'twitter', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
  { id: 'LINKEDIN', name: 'LinkedIn', slug: 'linkedin', border: 'border-blue-200', bg: 'bg-neutral-100/80' },
  { id: 'PINTEREST', name: 'Pinterest', slug: 'pinterest', border: 'border-rose-200', bg: 'bg-rose-50/50' },
  { id: 'THREADS', name: 'Threads', slug: 'threads', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
];

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

/**
 * Connected social accounts management (reconnect, disconnect).
 * Rendered on `/dashboard/account` and legacy `/dashboard/accounts` redirects here.
 */
export function ConnectedAccountsPanel() {
  const {
    cachedAccounts,
    setCachedAccounts,
    removeConnectedAccountFromCache,
    completePendingDisconnect,
    finishPostConnectBrandAssignment,
  } = useAccountsCache() ?? {
    cachedAccounts: [],
    setCachedAccounts: () => {},
    removeConnectedAccountFromCache: () => {},
    completePendingDisconnect: () => {},
    finishPostConnectBrandAssignment: () => 'noop' as const,
  };
  const appData = useAppData();
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount() ?? { selectedAccountId: null, setSelectedAccountId: () => {} };

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);
  const pendingDisconnectRef = useRef<SocialAccount | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const accounts = (cachedAccounts as SocialAccount[]) ?? [];

  useEffect(() => {
    return listenForOAuthComplete(async (payload) => {
      try {
        const res = await api.get(`/social/accounts?_=${Date.now()}`);
        const data = Array.isArray(res.data) ? res.data : [];
        setCachedAccounts(data);
        const { accountId, platform } = payload;
        const connected = accountId ? data.find((a) => a.id === accountId) : undefined;
        if (accountId && finishPostConnectBrandAssignment) {
          const postConnectResult = finishPostConnectBrandAssignment(
            accountId,
            data,
            connected
              ? { platform: connected.platform, username: connected.username }
              : platform
                ? { platform, username: undefined }
                : undefined
          );
          if (postConnectResult === 'prompt') return;
          if (postConnectResult !== 'noop') return;
        }
      } catch {
        /* ignore */
      }
    });
  }, [setCachedAccounts, finishPostConnectBrandAssignment]);

  const handleDisconnectClick = (acc: SocialAccount) => {
    pendingDisconnectRef.current = acc;
    setAccountToDisconnect(acc);
    setDisconnectConfirmOpen(true);
  };

  const handleDisconnectConfirm = () => {
    const acc = pendingDisconnectRef.current ?? accountToDisconnect;
    if (!acc) return;

    const accountIdToRemove = acc.id;
    const disconnectedAccountWasSelected = selectedAccountId === accountIdToRemove;

    removeConnectedAccountFromCache(accountIdToRemove);
    appData?.clearAccountData(accountIdToRemove);
    if (disconnectedAccountWasSelected) {
      setSelectedAccountId(null);
    }
    pendingDisconnectRef.current = null;
    setAccountToDisconnect(null);
    setDisconnectConfirmOpen(false);
    setDisconnectingId(null);

    void (async () => {
      try {
        await api.delete(`/social/accounts/${accountIdToRemove}`);
        completePendingDisconnect(accountIdToRemove);
      } catch (e) {
        completePendingDisconnect(accountIdToRemove);
        const err = e as { response?: { data?: { message?: string }; status?: number } };
        const msg =
          err?.response?.data?.message ??
          (err?.response?.status === 401
            ? 'Session expired. Sign out and sign back in, then try again.'
            : 'Could not disconnect. Try again.');
        setAlertMessage(msg);
        try {
          const res = await api.get(`/social/accounts?_=${Date.now()}`);
          const data = Array.isArray(res.data) ? res.data : [];
          setCachedAccounts(data);
        } catch {
          /* keep optimistic state if refresh fails */
        }
      }
    })();
  };

  // Build a lookup from platform id → connected account
  const accountByPlatform = accounts.reduce<Record<string, SocialAccount>>((map, acc) => {
    map[acc.platform] = acc;
    return map;
  }, {});

  return (
    <div className="space-y-4">
      {alertMessage && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {alertMessage}
        </div>
      )}

      <div className="account-connect-frame rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5">
        {accounts.length === 0 && (
          <p className="text-sm text-neutral-600 text-center mb-4">No accounts connected yet.</p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          {CONNECT_PLATFORM_CARDS.map(({ id, name, slug, border, bg }) => {
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
                      <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">Disconnecting...</span>
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
                          <span className="w-9 h-9 flex items-center justify-center">{CONNECT_GRID_ICON[acc.platform] ?? <FacebookIcon size={24} />}</span>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm font-semibold text-neutral-800">
                    <span className="inline-flex h-4 w-4 items-center justify-center shrink-0">
                      {CONNECT_LABEL_ICON[acc.platform] ?? <FacebookIcon size={14} />}
                    </span>
                    <span>{acc.platform === 'TWITTER' ? 'Twitter/X' : acc.platform.charAt(0) + acc.platform.slice(1).toLowerCase()}</span>
                  </div>
                  <div className="text-[10px] sm:text-xs text-neutral-500 truncate">
                    {(acc.username || '').replace(/^@/, '') || 'Connected'}
                  </div>
                  {acc.platform === 'LINKEDIN' &&
                  (acc as { linkedinConnectionKind?: string }).linkedinConnectionKind === 'organization_page' ? (
                    <p className="mt-1 text-[10px] font-medium text-blue-700">Company Page</p>
                  ) : acc.platform === 'LINKEDIN' ? (
                    <p className="mt-1 text-[10px] font-medium text-blue-700">Personal profile</p>
                  ) : acc.platform === 'TIKTOK' &&
                    (acc as { tiktokConnectionKind?: string }).tiktokConnectionKind === 'business' ? (
                    <p className="mt-1 text-[10px] font-medium text-neutral-800">Business account</p>
                  ) : acc.platform === 'TIKTOK' &&
                    (acc as { tiktokConnectionKind?: string }).tiktokConnectionKind === 'personal' ? (
                    <p className="mt-1 text-[10px] font-medium text-neutral-800">Personal account</p>
                  ) : null}
                  {acc.platform === 'LINKEDIN' &&
                  (acc as { linkedinPublishReady?: boolean }).linkedinPublishReady === false &&
                  typeof acc.linkedinReconnectHint === 'string' &&
                  acc.linkedinReconnectHint.trim() ? (
                    <p className="mt-2 text-left text-[10px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                      {acc.linkedinReconnectHint}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        if (reconnectingId) return;
                        const oauthPopup = prepareOAuthConnectPopup();
                        setReconnectingId(acc.id);
                        try {
                          const liMethod =
                            acc.platform === 'LINKEDIN' &&
                            typeof (acc as { linkedinConnectionKind?: string }).linkedinConnectionKind ===
                              'string' &&
                            (acc as { linkedinConnectionKind?: string }).linkedinConnectionKind ===
                              'organization_page'
                              ? 'page'
                              : acc.platform === 'LINKEDIN'
                                ? 'personal'
                                : undefined;
                          const tiktokMethod =
                            acc.platform === 'TIKTOK' &&
                            (acc as { tiktokConnectionKind?: string }).tiktokConnectionKind === 'business'
                              ? 'business'
                              : acc.platform === 'TIKTOK' &&
                                  (acc as { tiktokConnectionKind?: string }).tiktokConnectionKind === 'personal'
                                ? 'personal'
                                : undefined;
                          const reconnectMethod = liMethod ?? tiktokMethod;
                          const startParams = new URLSearchParams();
                          if (reconnectMethod != null) {
                            startParams.set('method', reconnectMethod);
                          }
                          if (acc.platform === 'LINKEDIN') {
                            startParams.set('step', 'consent');
                            startParams.set('reconnect_account_id', acc.id);
                          }
                          const qs = startParams.toString() ? `?${startParams.toString()}` : '';
                          const res = await api.get(
                            `/social/oauth/${acc.platform.toLowerCase()}/start${qs}`
                          );
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') {
                            if (acc.platform === 'TWITTER') {
                              closeOAuthConnectPopup(oauthPopup);
                              window.location.assign(url);
                              return;
                            }
                            const opened = navigateOAuthConnect(url, oauthPopup);
                            if (!opened.opened) {
                              alert('Could not open sign-in. Allow pop-ups for www.izop.io or try Reconnect again.');
                            }
                          } else {
                            closeOAuthConnectPopup(oauthPopup);
                          }
                        } catch (_) {
                          closeOAuthConnectPopup(oauthPopup);
                        }
                        setReconnectingId(null);
                      }}
                      disabled={reconnectingId === acc.id || isDisconnecting}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] sm:text-xs text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {reconnectingId === acc.id ? <RefreshCw size={12} className="animate-spin" /> : null}
                      Reconnect
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisconnectClick(acc)}
                      disabled={Boolean(disconnectingId) || reconnectingId === acc.id}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-1 text-[10px] sm:text-xs text-red-600 hover:bg-red-50 disabled:opacity-60"
                    >
                      {isDisconnecting ? <Loader2 size={12} className="animate-spin" aria-hidden /> : null}
                      Disconnect
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={id}
                href={`/dashboard?connect=${slug}`}
                className={`account-connect-card flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl border-2 ${border} ${bg} hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group text-center`}
              >
                <div className="w-9 h-9 flex items-center justify-center shrink-0">{CONNECT_GRID_ICON[id]}</div>
                <span className="text-xs sm:text-sm font-semibold text-neutral-800">{name}</span>
                <span className="text-[10px] sm:text-xs text-neutral-500 group-hover:text-neutral-700">Connect</span>
              </Link>
            );
          })}
        </div>
      </div>

      <ConfirmModal
        open={disconnectConfirmOpen}
        onClose={() => {
          if (disconnectingId) return;
          setDisconnectConfirmOpen(false);
          setAccountToDisconnect(null);
          pendingDisconnectRef.current = null;
        }}
        title="Disconnect account?"
        message={accountToDisconnect ? `Disconnect @${accountToDisconnect.username || accountToDisconnect.platform}? Synced data will be removed. You can reconnect anytime.` : ''}
        confirmLabel="Disconnect"
        confirmLoadingLabel="Disconnecting..."
        confirmLoading={false}
        cancelLabel="Keep connected"
        variant="danger"
        closeOnConfirm
        onConfirm={handleDisconnectConfirm}
      />
    </div>
  );
}
