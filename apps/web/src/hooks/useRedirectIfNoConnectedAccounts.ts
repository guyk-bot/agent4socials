'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { readOAuthConnectInFlight } from '@/lib/oauth-connect';
import {
  CONNECTED_ACCOUNTS_PATH,
  shouldRedirectEmptyAccountsToConnect,
} from '@/lib/dashboard-onboarding';

/**
 * Sends users with zero connected platforms to Account → Connected accounts
 * instead of empty analytics (Console / legacy /dashboard).
 */
export function useRedirectIfNoConnectedAccounts(): void {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const redirectedRef = useRef(false);
  const { allCachedAccounts } = useAccountsCache() ?? { allCachedAccounts: [] };

  useEffect(() => {
    redirectedRef.current = false;
  }, [pathname, search]);

  useEffect(() => {
    if (redirectedRef.current) return;
    if (!shouldRedirectEmptyAccountsToConnect(pathname, search)) return;
    if (readOAuthConnectInFlight()) return;
    if (allCachedAccounts.length > 0) return;

    let cancelled = false;

    const goToConnect = () => {
      if (cancelled || redirectedRef.current) return;
      redirectedRef.current = true;
      router.replace(CONNECTED_ACCOUNTS_PATH);
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
  }, [pathname, search, allCachedAccounts.length, router]);
}
