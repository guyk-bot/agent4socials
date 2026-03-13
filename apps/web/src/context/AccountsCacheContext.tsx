'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';

type CachedAccount = { id: string; platform: string; username?: string; profilePicture?: string | null; [key: string]: unknown };

const STORAGE_KEY = 'agent4socials_cached_accounts';

function readAccountsFromStorage(): CachedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type AccountsCacheContextType = {
  cachedAccounts: CachedAccount[];
  setCachedAccounts: React.Dispatch<React.SetStateAction<CachedAccount[]>>;
  accountsLoadError: string | null;
  setAccountsLoadError: React.Dispatch<React.SetStateAction<string | null>>;
};

const AccountsCacheContext = createContext<AccountsCacheContextType | undefined>(undefined);

export function AccountsCacheProvider({ children }: { children: React.ReactNode }) {
  const [cachedAccounts, setCachedAccountsState] = useState<CachedAccount[]>(readAccountsFromStorage);
  const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);

  const setCachedAccounts = useCallback((arg: React.SetStateAction<CachedAccount[]>) => {
    setCachedAccountsState((prev) => {
      const next = typeof arg === 'function' ? arg(prev) : arg;
      if (typeof window !== 'undefined' && Array.isArray(next)) {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);

  return (
    <AccountsCacheContext.Provider value={{ cachedAccounts, setCachedAccounts, accountsLoadError, setAccountsLoadError }}>
      {children}
    </AccountsCacheContext.Provider>
  );
}

export function useAccountsCache() {
  const ctx = useContext(AccountsCacheContext);
  return ctx;
}
