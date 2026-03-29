'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

export type SocialAccount = { id: string; platform: string; username?: string; profilePicture?: string | null; [key: string]: unknown };

type SelectedAccountContextType = {
  selectedAccountId: string | null;
  selectedPlatformForConnect: string | null;
  setSelectedAccountId: (id: string | null) => void;
  setSelectedAccount: (account: SocialAccount | null) => void;
  setSelectedPlatformForConnect: (platform: string | null) => void;
  clearSelection: () => void;
};

const STORAGE_KEY = 'agent4socials_selected_account_id';
const SelectedAccountContext = createContext<SelectedAccountContextType | undefined>(undefined);

export function SelectedAccountProvider({ children }: { children: React.ReactNode }) {
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(null);
  const [selectedPlatformForConnect, setSelectedPlatformForConnectState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      if (id) setSelectedAccountIdState(id);
    } catch (_) {}
  }, []);

  const setSelectedAccountId = useCallback((id: string | null) => {
    setSelectedAccountIdState(id);
    setSelectedPlatformForConnectState(null);
    try {
      if (id) localStorage.setItem(STORAGE_KEY, id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  const setSelectedAccount = useCallback((account: SocialAccount | null) => {
    setSelectedAccountIdState(account?.id ?? null);
    setSelectedPlatformForConnectState(null);
    try {
      if (account?.id) localStorage.setItem(STORAGE_KEY, account.id);
      else localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  const setSelectedPlatformForConnect = useCallback((platform: string | null) => {
    setSelectedPlatformForConnectState(platform);
    setSelectedAccountIdState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedAccountIdState(null);
    setSelectedPlatformForConnectState(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  return (
    <SelectedAccountContext.Provider
      value={{
        selectedAccountId,
        selectedPlatformForConnect,
        setSelectedAccountId,
        setSelectedAccount,
        setSelectedPlatformForConnect,
        clearSelection,
      }}
    >
      {children}
    </SelectedAccountContext.Provider>
  );
}

export function useSelectedAccount() {
  return useContext(SelectedAccountContext);
}

/** Resolve full account from a list (e.g. cachedAccounts) and selectedAccountId */
export function useResolvedSelectedAccount(accounts: SocialAccount[]) {
  const { selectedAccountId } = useSelectedAccount() ?? { selectedAccountId: null };
  return selectedAccountId ? accounts.find((a) => a.id === selectedAccountId) ?? null : null;
}
