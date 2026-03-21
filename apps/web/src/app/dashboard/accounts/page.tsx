'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData } from '@/context/AppDataContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PlatformAnalyticsHeader } from '@/components/analytics';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, RedditIcon } from '@/components/SocialPlatformIcons';
import { RefreshCw, HelpCircle, Image } from 'lucide-react';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={24} />,
  FACEBOOK: <FacebookIcon size={24} />,
  TIKTOK: <TikTokIcon size={24} />,
  YOUTUBE: <YoutubeIcon size={24} />,
  TWITTER: <XTwitterIcon size={24} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={24} />,
  REDDIT: <RedditIcon size={24} />,
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
  if (platform === 'REDDIT' && username) return `https://www.reddit.com/user/${username.replace(/^u\//, '').replace(/^@/, '')}`;
  return '#';
}

export default function AccountsPage() {
  const router = useRouter();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const appData = useAppData();
  const { selectedAccountId, setSelectedAccountId } = useSelectedAccount() ?? { selectedAccountId: null, setSelectedAccountId: () => {} };

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [tokenDebugLoading, setTokenDebugLoading] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [enablingTwitter1oa, setEnablingTwitter1oa] = useState(false);

  const accounts = (cachedAccounts as SocialAccount[]) ?? [];

  const handleDisconnectClick = (acc: SocialAccount) => {
    setAccountToDisconnect(acc);
    setDisconnectConfirmOpen(true);
  };

  const handleDisconnectConfirm = async () => {
    const acc = accountToDisconnect;
    if (!acc) {
      setDisconnectConfirmOpen(false);
      return;
    }
    const accountIdToRemove = acc.id;
    const disconnectedAccountWasSelected = selectedAccountId === accountIdToRemove;
    setDisconnectConfirmOpen(false);
    setAccountToDisconnect(null);
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
    <div className="bg-[#F8FAFC] min-h-full -m-6 md:-m-8 p-6 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900 tracking-tight">Connected accounts</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Manage your connected social accounts. Disconnect here when you no longer want to link an account.
          </p>
        </div>

        {alertMessage && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
            {alertMessage}
          </div>
        )}

        {accounts.length === 0 ? (
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
            <p className="text-neutral-600">No accounts connected yet.</p>
            <p className="text-sm text-neutral-500 mt-1">Connect an account from the Analytics sidebar on the dashboard.</p>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="mt-4 px-4 py-2 rounded-lg bg-[var(--primary)] text-neutral-900 font-medium text-sm hover:opacity-90"
            >
              Go to Dashboard
            </button>
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
      </div>

      <ConfirmModal
        open={disconnectConfirmOpen}
        onClose={() => { setDisconnectConfirmOpen(false); setAccountToDisconnect(null); }}
        title="Disconnect account?"
        message={accountToDisconnect ? `Disconnect @${accountToDisconnect.username || accountToDisconnect.platform}? All synced posts and insights for this account will be removed. You can reconnect anytime from the sidebar.` : ''}
        confirmLabel="Disconnect"
        cancelLabel="Keep connected"
        variant="danger"
        onConfirm={handleDisconnectConfirm}
      />
    </div>
  );
}
