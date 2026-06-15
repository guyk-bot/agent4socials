'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData } from '@/context/AppDataContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  ConnectPlatformCardsGrid,
  type ConnectGridAccount,
} from '@/components/account/ConnectPlatformCardsGrid';
import { buildDashboardSuccessRedirect } from '@/lib/brand-account-move';
import {
  closeOAuthConnectPopup,
  listenForOAuthComplete,
  resetConnectUiAfterAccountDisconnect,
  navigateOAuthConnect,
  prepareOAuthConnectPopup,
  clearOAuthConnectInFlightForPlatform,
  watchOAuthConnectPopup,
  storeOAuthConnectInFlight,
  storePostConnectTargetAccount,
  clearPostConnectTargetAccount,
  readPostConnectTargetAccount,
  pollOAuthConnectAccount,
} from '@/lib/oauth-connect';

/**
 * Connected social accounts management (reconnect, disconnect).
 * Rendered on `/dashboard/account` and legacy `/dashboard/accounts` redirects here.
 */
export function ConnectedAccountsPanel() {
  const router = useRouter();
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
  const { selectedAccountId, setSelectedAccountId, setSelectedPlatformForConnect } =
    useSelectedAccount() ?? {
      selectedAccountId: null,
      setSelectedAccountId: () => {},
      setSelectedPlatformForConnect: () => {},
    };

  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [accountToDisconnect, setAccountToDisconnect] = useState<SocialAccount | null>(null);
  const pendingDisconnectRef = useRef<SocialAccount | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const accounts = (cachedAccounts as SocialAccount[]) ?? [];

  const goToPlatformDashboard = (
    accountId: string,
    platform: string,
    opts?: { reconnect?: boolean }
  ) => {
    clearPostConnectTargetAccount();
    setSelectedAccountId(accountId);
    router.replace(
      buildDashboardSuccessRedirect(
        accountId,
        platform,
        opts?.reconnect ? { reconnect: '1' } : { just_connected: '1' }
      )
    );
  };

  useEffect(() => {
    const target = readPostConnectTargetAccount();
    if (target) {
      goToPlatformDashboard(target.accountId, target.platform, { reconnect: target.reconnect });
    }
  }, []);

  useEffect(() => {
    return listenForOAuthComplete((payload) => {
      const { accountId, platform } = payload;
      const target = readPostConnectTargetAccount();
      const isReconnect = target?.reconnect === true;
      if (accountId && platform) {
        goToPlatformDashboard(accountId, platform, { reconnect: isReconnect });
        setReconnectingId(null);
      }
      void (async () => {
        try {
          const res = await api.get(`/social/accounts?_=${Date.now()}`);
          const data = Array.isArray(res.data) ? res.data : [];
          setCachedAccounts(data);
          const connected = accountId ? data.find((a) => a.id === accountId) : undefined;
          const plat = connected?.platform ?? platform ?? '';
          if (accountId && plat && finishPostConnectBrandAssignment) {
            finishPostConnectBrandAssignment(
              accountId,
              data,
              connected
                ? { platform: connected.platform, username: connected.username }
                : platform
                  ? { platform, username: undefined }
                  : undefined,
              {
                successRedirect: buildDashboardSuccessRedirect(accountId, plat || platform),
              }
            );
          }
        } catch {
          /* ignore */
        }
      })();
    });
  }, [setCachedAccounts, finishPostConnectBrandAssignment, router, setSelectedAccountId]);

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
    resetConnectUiAfterAccountDisconnect(acc.platform);
    setSelectedPlatformForConnect(null);
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

  const handleReconnect = async (acc: ConnectGridAccount) => {
    if (reconnectingId) return;
    const oauthPopup = prepareOAuthConnectPopup();
    setReconnectingId(acc.id);
    storeOAuthConnectInFlight(acc.platform);
    storePostConnectTargetAccount(acc.id, acc.platform, { reconnect: true });
    try {
      const liMethod =
        acc.platform === 'LINKEDIN' && acc.linkedinConnectionKind === 'organization_page'
          ? 'page'
          : acc.platform === 'LINKEDIN'
            ? 'personal'
            : undefined;
      const tiktokMethod =
        acc.platform === 'TIKTOK' && acc.tiktokConnectionKind === 'business'
          ? 'business'
          : acc.platform === 'TIKTOK' && acc.tiktokConnectionKind === 'personal'
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
      const res = await api.get(`/social/oauth/${acc.platform.toLowerCase()}/start${qs}`);
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
        } else if (oauthPopup && !oauthPopup.closed) {
          watchOAuthConnectPopup(oauthPopup, acc.platform, () => {
            goToPlatformDashboard(acc.id, acc.platform, { reconnect: true });
            setReconnectingId(null);
            pollOAuthConnectAccount(
              acc.platform,
              async () => {
                const r = await api.get(`/social/accounts?_=${Date.now()}`);
                return Array.isArray(r.data) ? r.data : [];
              },
              () => {
                void api.get(`/social/accounts?_=${Date.now()}`).then((r) => {
                  const data = Array.isArray(r.data) ? r.data : [];
                  setCachedAccounts(data);
                });
              },
              { requireInFlight: false, maxMs: 90_000 }
            );
          });
        }
      } else {
        closeOAuthConnectPopup(oauthPopup);
        setReconnectingId(null);
      }
    } catch {
      closeOAuthConnectPopup(oauthPopup);
      setReconnectingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {alertMessage && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {alertMessage}
        </div>
      )}

      <ConnectPlatformCardsGrid
        connectHrefPrefix="/dashboard"
        accounts={accounts as ConnectGridAccount[]}
        reconnectingId={reconnectingId}
        disconnectingId={disconnectingId}
        onReconnect={handleReconnect}
        onDisconnect={(acc) => handleDisconnectClick(acc as SocialAccount)}
      />

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
