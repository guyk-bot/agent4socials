'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import { readOAuthConnectInFlight, isOAuthRedirectGuarded, readPostConnectTargetAccount } from '@/lib/oauth-connect';
import {
  FIRST_CONNECT_PATH,
  shouldRedirectEmptyAccountsToConnect,
} from '@/lib/dashboard-onboarding';

/**
 * Sends users with zero connected platforms to the first-connect page
 * instead of empty analytics (Console / legacy /dashboard).
 */
export function useRedirectIfNoConnectedAccounts(): void {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const redirectedRef = useRef(false);
  const { allCachedAccounts } = useAccountsCache() ?? { allCachedAccounts: [] };
  const selectedPlatformForConnect =
    useSelectedAccount()?.selectedPlatformForConnect ?? null;

  useEffect(() => {
    redirectedRef.current = false;
  }, [pathname, search]);

  useEffect(() => {
    if (redirectedRef.current) return;
    if (!shouldRedirectEmptyAccountsToConnect(pathname, search)) return;
    if (selectedPlatformForConnect) return;
    if (readOAuthConnectInFlight()) return;
    if (isOAuthRedirectGuarded()) return; // Don't redirect shortly after OAuth starts
    if (readPostConnectTargetAccount()) return;
    if (allCachedAccounts.length > 0) return;

    let cancelled = false;

    const goToConnect = () => {
      if (cancelled || redirectedRef.current) return;
      redirectedRef.current = true;
      router.replace(FIRST_CONNECT_PATH);
    };

    void (async () => {
      try {
        const res = await api.get('/social/accounts');
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        if (data.length === 0) goToConnect();
      } catch {
        // Keep the page if accounts cannot be loaded (session/DB issues).
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, search, allCachedAccounts.length, selectedPlatformForConnect, router]);
}
