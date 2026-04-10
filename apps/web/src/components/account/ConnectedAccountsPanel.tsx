'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData } from '@/context/AppDataContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PlatformAnalyticsHeader } from '@/components/analytics';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';
import { RefreshCw, Image } from 'lucide-react';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={24} />,
  FACEBOOK: <FacebookIcon size={24} />,
  TIKTOK: <TikTokIcon size={24} />,
  YOUTUBE: <YoutubeIcon size={24} />,
  TWITTER: <XTwitterIcon size={24} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={24} />,
  PINTEREST: <PinterestIcon size={24} />,
};

/** Same connect targets and styling as Summary dashboard empty state (compact grid on Account page). */
const CONNECT_PLATFORM_CARDS: { id: string; name: string; slug: string; border: string; bg: string }[] = [
  { id: 'FACEBOOK', name: 'Facebook', slug: 'facebook', border: 'border-blue-200', bg: 'bg-blue-50/50' },
  { id: 'INSTAGRAM', name: 'Instagram', slug: 'instagram', border: 'border-pink-200', bg: 'bg-pink-50/50' },
  { id: 'TIKTOK', name: 'TikTok', slug: 'tiktok', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
  { id: 'YOUTUBE', name: 'YouTube', slug: 'youtube', border: 'border-red-200', bg: 'bg-red-50/50' },
  { id: 'TWITTER', name: 'Twitter/X', slug: 'twitter', border: 'border-neutral-300', bg: 'bg-neutral-100/80' },
  { id: 'LINKEDIN', name: 'LinkedIn', slug: 'linkedin', border: 'border-blue-200', bg: 'bg-blue-50/50' },
  { id: 'PINTEREST', name: 'Pinterest', slug: 'pinterest', border: 'border-rose-200', bg: 'bg-rose-50/50' },
];

const CONNECT_GRID_ICON: Record<string, React.ReactNode> = {
  FACEBOOK: <FacebookIcon size={26} />,
  INSTAGRAM: <InstagramIcon size={26} />,
  TIKTOK: <TikTokIcon size={26} />,
  YOUTUBE: <YoutubeIcon size={26} />,
  TWITTER: <XTwitterIcon size={26} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={26} />,
  PINTEREST: <PinterestIcon size={26} />,
};

function profileUrlForAccount(acc: SocialAccount): string {
  const pid = (acc as { pageId?: string }).pageId;
  const username = acc.username;
  const platform = acc.platform;
  if (platform === 'INSTAGRAM' && username) return `https://instagram.com/${username.replace(/^@/, '')}`;
  if (platform === 'FACEBOOK' && pid) return `https://www.facebook.com/${pid}`;
  if (platform === 'TIKTOK' && username) return `https://www.tiktok.com/@${username.replace(/^@/, '')}`;
  if (platform === 'YOUTUBE') return 'https://www.youtube.com';
  if (platform === 'TWITTER' && username) return `https://x.com/${username.replace(/^@/, '')}`;
  if (platform === 'LINKEDIN') return 'https://www.linkedin.com';
  if (platform === 'PINTEREST' && username) return `https://www.pinterest.com/${username.replace(/^@/, '')}/`;
  return '#';
}

/**
 * Connected social accounts management (reconnect, disconnect).
 * Rendered on `/dashboard/account` and legacy `/dashboard/accounts` redirects here.
 */
export function ConnectedAccountsPanel() {
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const appData = useAppData();
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount() ?? { selectedAccountId: null, setSelectedAccountId: () => {} };

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);
  const pendingDisconnectRef = useRef<SocialAccount | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [tokenDebugLoading, setTokenDebugLoading] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [enablingTwitter1oa, setEnablingTwitter1oa] = useState(false);

  const accounts = (cachedAccounts as SocialAccount[]) ?? [];

  const handleDisconnectClick = (acc: SocialAccount) => {
    pendingDisconnectRef.current = acc;
    setAccountToDisconnect(acc);
    setDisconnectConfirmOpen(true);
  };

  const handleDisconnectConfirm = async () => {
    const acc = pendingDisconnectRef.current ?? accountToDisconnect;
    pendingDisconnectRef.current = null;
    setDisconnectConfirmOpen(false);
    setAccountToDisconnect(null);
    if (!acc) {
      return;
    }
    const accountIdToRemove = acc.id;
    const disconnectedAccountWasSelected = selectedAccountId === accountIdToRemove;
    setDisconnectingId(accountIdToRemove);
    try {
      await api.delete(`/social/accounts/${accountIdToRemove}`);
      const res = await api.get(`/social/accounts?_=${Date.now()}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
      appData?.clearAccountData(accountIdToRemove);
      if (disconnectedAccountWasSelected) {
        setSelectedAccountId(null);
      }
    } catch (e) {
      const err = e as { response?: { data?: { message?: string }; status?: number } };
      const msg = err?.response?.data?.message ?? (err?.response?.status === 401 ? 'Session expired. Sign out and sign back in, then try again.' : 'Could not disconnect. Try again.');
      setAlertMessage(msg);
    } finally {
      setDisconnectingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {alertMessage && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {alertMessage}
        </div>
      )}

      {accounts.length === 0 ? (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50/40 p-4 sm:p-5">
          <p className="text-sm text-neutral-600 text-center mb-4">No accounts connected yet.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
            {CONNECT_PLATFORM_CARDS.map(({ id, name, slug, border, bg }) => (
              <Link
                key={id}
                href={`/dashboard?connect=${slug}`}
                className={`flex flex-col items-center justify-center gap-2 p-3 sm:p-4 rounded-xl border-2 ${border} ${bg} bg-white hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 group text-center`}
              >
                <div className="w-9 h-9 flex items-center justify-center shrink-0">{CONNECT_GRID_ICON[id]}</div>
                <span className="text-xs sm:text-sm font-semibold text-neutral-800">{name}</span>
                <span className="text-[10px] sm:text-xs text-neutral-500 group-hover:text-neutral-700">Connect</span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((acc) => (
            <li key={acc.id} className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
              <PlatformAnalyticsHeader
                account={{
                  id: acc.id,
                  platform: acc.platform,
                  username: acc.username,
                  profilePicture: acc.profilePicture,
                }}
                profileUrl={profileUrlForAccount(acc)}
                platformLabel={acc.platform === 'TWITTER' ? 'Twitter/X' : acc.platform.charAt(0) + acc.platform.slice(1).toLowerCase()}
                icon={PLATFORM_ICON[acc.platform]}
                onReconnect={async () => {
                  if (reconnectingId) return;
                  setReconnectingId(acc.id);
                  try {
                    const res = await api.get(`/social/oauth/${acc.platform.toLowerCase()}/start`);
                    const url = res?.data?.url;
                    if (url && typeof url === 'string') window.location.href = url;
                  } catch (_) {}
                  setReconnectingId(null);
                }}
                onDisconnectClick={() => handleDisconnectClick(acc)}
                onCheckPermissions={(acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK') ? async () => {
                  if (tokenDebugLoading) return;
                  setTokenDebugLoading(acc.id);
                  try {
                    const res = await api.get(`/social/accounts/${acc.id}/token-debug`);
                    const d = res.data as {
                      isValid?: boolean;
                      scopes?: string[];
                      hasPublishScope?: boolean;
                      hasFacebookInsightsScope?: boolean;
                      hasInstagramInsightsScope?: boolean;
                      expiresAt?: number;
                    };
                    const exp = d.expiresAt ? new Date(d.expiresAt * 1000).toISOString().slice(0, 10) : 'N/A';
                    const scopeList = (d.scopes ?? []).join(', ') || 'none';
                    const fbInsights = d.hasFacebookInsightsScope ? 'yes' : 'no';
                    const igInsights = d.hasInstagramInsightsScope ? 'yes' : 'no';
                    const msg = `Token valid: ${d.isValid ?? false}. Publish scope: ${d.hasPublishScope ? 'yes' : 'no'}. Expires: ${exp}.\n\nFacebook Page insights (read_insights): ${fbInsights}.\nInstagram insights (instagram_manage_insights): ${igInsights}.\n\nAll scopes: ${scopeList}`;
                    setAlertMessage(msg);
                  } catch (e: unknown) {
                    const err = e as { response?: { data?: { message?: string; error?: string } } };
                    setAlertMessage(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Could not validate token.');
                  }
                  setTokenDebugLoading(null);
                } : undefined}
                reconnectLoading={reconnectingId === acc.id}
                checkPermissionsLoading={tokenDebugLoading === acc.id}
                disconnectLoading={disconnectingId === acc.id}
                extraActions={acc.platform === 'TWITTER' && !(acc as { imageUploadEnabled?: boolean }).imageUploadEnabled ? (
                  <button
                    type="button"
                    onClick={async () => {
                      if (enablingTwitter1oa) return;
                      setEnablingTwitter1oa(true);
                      try {
                        const res = await api.get('/social/oauth/twitter-1oa/start');
                        const url = res?.data?.url;
                        if (url && typeof url === 'string') window.location.href = url;
                        else setAlertMessage(res?.data?.message ?? 'Could not start. Add TWITTER_API_KEY and TWITTER_API_SECRET in Vercel.');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAlertMessage(msg ?? 'Enable image upload failed.');
                      }
                      setEnablingTwitter1oa(false);
                    }}
                    disabled={!!enablingTwitter1oa}
                    title="Enable image upload for X posts (OAuth 1.0a)"
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 bg-white text-[#374151] text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                  >
                    {enablingTwitter1oa ? <RefreshCw size={16} className="animate-spin" /> : <Image size={16} />}
                    Enable image upload
                  </button>
                ) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={disconnectConfirmOpen}
        onClose={() => { setDisconnectConfirmOpen(false); setAccountToDisconnect(null); }}
        title="Disconnect account?"
        message={accountToDisconnect ? `Disconnect @${accountToDisconnect.username || accountToDisconnect.platform}? All synced posts and insights for this account will be removed. You can reconnect anytime from Account or when you add a platform from the dashboard.` : ''}
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        variant="danger"
        onConfirm={() => { void handleDisconnectConfirm(); }}
      />
    </div>
  );
}
