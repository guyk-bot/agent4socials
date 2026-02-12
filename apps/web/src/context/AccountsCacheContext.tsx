'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

type CachedAccount = { id: string; platform: string; username?: string; profilePicture?: string | null; [key: string]: unknown };

type AccountsCacheContextType = {
  cachedAccounts: CachedAccount[];
  setCachedAccounts: (accounts: CachedAccount[]) => void;
};

const AccountsCacheContext = createContext<AccountsCacheContextType | undefined>(undefined);

export function AccountsCacheProvider({ children }: { children: React.ReactNode }) {
  const [cachedAccounts, setCachedAccounts] = useState<CachedAccount[]>([]);
  return (
    <AccountsCacheContext.Provider value={{ cachedAccounts, setCachedAccounts }}>
      {children}
    </AccountsCacheContext.Provider>
  );
}

export function useAccountsCache() {
  const ctx = useContext(AccountsCacheContext);
  return ctx;
}
