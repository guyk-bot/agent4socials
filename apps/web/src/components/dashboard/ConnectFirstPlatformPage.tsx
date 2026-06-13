'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { ConfirmModal } from '@/components/ConfirmModal';
import ConnectView from '@/components/dashboard/ConnectView';
import { FirstConnectPrompt } from '@/components/dashboard/FirstConnectPrompt';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import {
  buildDashboardSuccessRedirect,
  storePendingConnectNav,
} from '@/lib/brand-account-move';
import {
  clearOAuthConnectInFlight,
  clearOAuthConnectInFlightForPlatform,
  closeOAuthConnectPopup,
  isPlatformOAuthPending,
  navigateOAuthConnect,
  notifyOAuthCompleteLocally,
  pollOAuthConnectAccount,
  prepareOAuthConnectPopup,
  readOAuthConnectInFlight,
  storeOAuthConnectInFlight,
  watchOAuthConnectPopup,
} from '@/lib/oauth-connect';
import { isActiveConnectFlow } from '@/lib/dashboard-onboarding';

const ALLOWED_CONNECT = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN', 'PINTEREST', 'THREADS'];

export function ConnectFirstPlatformPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const {
    allCachedAccounts,
    setCachedAccounts,
    accountsLoadError,
    setAccountsLoadError,
    activeBrandId,
  } = useAccountsCache() ?? {
    allCachedAccounts: [],
    setCachedAccounts: () => {},
    accountsLoadError: null,
    setAccountsLoadError: () => {},
    activeBrandId: 'brand-default',
  };
  const { selectedPlatformForConnect, setSelectedPlatformForConnect } =
    useSelectedAccount() ?? {
      selectedPlatformForConnect: null,
      setSelectedPlatformForConnect: () => {},
    };

  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [oauthLaunchingPlatform, setOauthLaunchingPlatform] = useState<string | null>(null);
  const [oauthLaunchingMethod, setOauthLaunchingMethod] = useState<string | undefined>(undefined);

  const connectParam = searchParams.get('connect');
  const connectFromUrl =
    connectParam && ALLOWED_CONNECT.includes(connectParam.toUpperCase())
      ? connectParam.toUpperCase()
      : null;
  const connectErrorFromUrl = searchParams.get('connect_error');
  const connectPlatform = (selectedPlatformForConnect || connectFromUrl) as string | null;

  const fetchAccounts = useCallback(async (): Promise<SocialAccount[]> => {
    try {
      const res = await api.get('/social/accounts');
      const data = (Array.isArray(res.data) ? res.data : []) as SocialAccount[];
      setCachedAccounts(data);
      return data;
    } catch {
      return [];
    }
  }, [setCachedAccounts]);

  useEffect(() => {
    if (allCachedAccounts.length === 0) return;
    if (isActiveConnectFlow(search)) return;
    if (connectFromUrl) {
      const existing = allCachedAccounts.find((a) => a.platform === connectFromUrl);
      if (!existing) return;
    }
    router.replace('/dashboard/console');
  }, [allCachedAccounts.length, connectFromUrl, router, search, allCachedAccounts]);

  useEffect(() => {
    if (!connectErrorFromUrl) return;
    clearOAuthConnectInFlight();
    setOauthLaunchingPlatform(null);
    setOauthLaunchingMethod(undefined);
    setAlertMessage(connectErrorFromUrl);
    if (!connectParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('connect_error');
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [connectErrorFromUrl, connectParam, router]);

  useEffect(() => {
    if (!connectParam) return;
    const upper = connectParam.toUpperCase();
    if (!ALLOWED_CONNECT.includes(upper)) return;
    const existing = allCachedAccounts.find((a) => a.platform === upper);
    if (!existing?.id) return;
    setSelectedPlatformForConnect(null);
    clearOAuthConnectInFlight();
    router.replace('/dashboard/console');
  }, [connectParam, allCachedAccounts, router, setSelectedPlatformForConnect]);

  const handleConnect = async (
    platform: string,
    method?: string,
    options?: { switchAccount?: boolean }
  ) => {
    const getMessage = (err: unknown): string | null => {
      if (!err || typeof err !== 'object' || !('response' in err)) return null;
      const res = (err as { response?: { data?: { message?: string } } }).response;
      return res?.data?.message ?? null;
    };
    setAlertMessage(null);
    const platformUpper = platform.trim().toUpperCase();
    storeOAuthConnectInFlight(platformUpper);
    const oauthPopup = prepareOAuthConnectPopup();
    setOauthLaunchingPlatform(platform);
    setOauthLaunchingMethod(method);
    let oauthPopupOpened = false;
    let stopOAuthPoll: (() => void) | undefined;
    let stopPopupWatch: (() => void) | undefined;
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const dashboardRedirect = buildDashboardSuccessRedirect();
      storePendingConnectNav({
        successRedirect: dashboardRedirect,
        returnUrl: `${currentPath}${window.location.search}`,
        activeBrandId,
      });
    }
    try {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const bearer = sessionData.session?.access_token ?? '';
      const startParams = new URLSearchParams();
      if (method && method !== 'switch') startParams.set('method', method);
      if (options?.switchAccount && platform.toLowerCase() === 'threads') {
        startParams.set('switch_account', '1');
      }
      if (
        platform.toLowerCase() === 'threads' &&
        searchParams.get('threads_review') === '1'
      ) {
        startParams.set('force_full_consent', '1');
      }
      const qs = startParams.toString() ? `?${startParams.toString()}` : '';
      const startRes = await fetch(`/api/social/oauth/${encodeURIComponent(platform)}/start${qs}`, {
        headers: { Authorization: `Bearer ${bearer}` },
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      });
      const data = (await startRes.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (!startRes.ok) {
        const serverMsg =
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : typeof data?.error === 'string' && data.error.trim()
              ? data.error.trim()
              : `Connect failed (HTTP ${startRes.status}).`;
        throw { response: { status: startRes.status, data: { message: serverMsg } } };
      }
      const url = data?.url;
      if (url && typeof url === 'string') {
        if (platform.toLowerCase() === 'twitter') {
          closeOAuthConnectPopup(oauthPopup);
          window.location.assign(url);
          return;
        }
        const opened = navigateOAuthConnect(url, oauthPopup);
        if (!opened.opened) {
          setAlertMessage(
            'Could not open sign-in. Allow pop-ups for www.izop.io or click Connect again.'
          );
        } else {
          oauthPopupOpened = true;
          setOauthLaunchingPlatform(null);
          setOauthLaunchingMethod(undefined);
          if (oauthPopup && !oauthPopup.closed) {
            stopPopupWatch = watchOAuthConnectPopup(oauthPopup, platform, () => {
              stopOAuthPoll?.();
              stopOAuthPoll = pollOAuthConnectAccount(
                platform,
                fetchAccounts,
                (connected) => {
                  notifyOAuthCompleteLocally(connected);
                },
                { requireInFlight: false, maxMs: 60_000 }
              );
            });
          }
        }
        return;
      }
      closeOAuthConnectPopup(oauthPopup);
      setAlertMessage('Invalid response from server. Check server logs.');
    } catch (err: unknown) {
      closeOAuthConnectPopup(oauthPopup);
      clearOAuthConnectInFlightForPlatform(platform);
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError');
      if (aborted) {
        setAlertMessage('Connect timed out. Wait a moment and try again.');
      } else {
        const msg = getMessage(err);
        setAlertMessage(
          msg?.trim()
            ? msg
            : err instanceof Error && err.message.trim()
              ? `Could not start connect: ${err.message.slice(0, 160)}`
              : 'Could not start connect. Sign out and back in, or try again in a moment.'
        );
      }
    } finally {
      if (!oauthPopupOpened) {
        stopPopupWatch?.();
        stopOAuthPoll?.();
        setOauthLaunchingPlatform(null);
        setOauthLaunchingMethod(undefined);
      }
    }
  };

  const platformAlreadyConnected = Boolean(
    connectPlatform && allCachedAccounts.some((a) => a.platform === connectPlatform)
  );
  const showConnectView = Boolean(connectPlatform) && !platformAlreadyConnected;

  if (showConnectView && connectPlatform) {
    const connectCallbackPending = isPlatformOAuthPending(connectPlatform);
    const oauthLaunching =
      oauthLaunchingPlatform?.toUpperCase() === connectPlatform.toUpperCase();

    return (
      <>
        <ConfirmModal
          open={alertMessage !== null}
          onClose={() => setAlertMessage(null)}
          message={alertMessage ?? ''}
          variant="alert"
          confirmLabel="OK"
        />
        <ConnectView
          platform={connectPlatform}
          onConnect={handleConnect}
          connecting={connectCallbackPending}
          launching={oauthLaunching}
          launchingMethod={oauthLaunchingMethod}
          connectError={alertMessage ?? connectErrorFromUrl}
        />
      </>
    );
  }

  return (
    <>
      <ConfirmModal
        open={alertMessage !== null}
        onClose={() => setAlertMessage(null)}
        message={alertMessage ?? ''}
        variant="alert"
        confirmLabel="OK"
      />
      <FirstConnectPrompt
        accounts={allCachedAccounts}
        accountsLoadError={accountsLoadError}
        onRefreshAccounts={() => {
          setAccountsLoadError(null);
          void fetchAccounts();
        }}
      />
    </>
  );
}
