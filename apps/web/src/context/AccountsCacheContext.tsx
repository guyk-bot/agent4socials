'use client';

import React, { createContext, useContext, useState } from 'react';

type CachedAccount = { id: string; platform: string; username?: string; profilePicture?: string | null; [key: string]: unknown };

type AccountsCacheContextType = {
  cachedAccounts: CachedAccount[];
  setCachedAccounts: React.Dispatch<React.SetStateAction<CachedAccount[]>>;
  accountsLoadError: string | null;
  setAccountsLoadError: React.Dispatch<React.SetStateAction<string | null>>;
};

const AccountsCacheContext = createContext<AccountsCacheContextType | undefined>(undefined);

export function AccountsCacheProvider({ children }: { children: React.ReactNode }) {
  const [cachedAccounts, setCachedAccounts] = useState<CachedAccount[]>([]);
  const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);
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
