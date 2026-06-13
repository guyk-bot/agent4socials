'use client';

import React from 'react';
import {
  ConnectPlatformCardsGrid,
  type ConnectGridAccount,
} from '@/components/account/ConnectPlatformCardsGrid';

type FirstConnectPromptProps = {
  accounts?: ConnectGridAccount[];
  accountsLoadError?: string | null;
  onRefreshAccounts?: () => void;
  connectHrefPrefix?: string;
};

/** Minimal first-connect screen: heading + platform grid only. */
export function FirstConnectPrompt({
  accounts = [],
  accountsLoadError = null,
  onRefreshAccounts,
  connectHrefPrefix = '/dashboard/connect',
}: FirstConnectPromptProps) {
  return (
    <div className="w-full max-w-3xl mx-auto pt-2 pb-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight mb-4">
        Connect your first platform
      </h1>
      {accountsLoadError ? (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800 font-medium">Accounts could not be loaded</p>
          <p className="text-sm text-amber-700 mt-1">{accountsLoadError}</p>
          {onRefreshAccounts ? (
            <button
              type="button"
              onClick={onRefreshAccounts}
              className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
            >
              Refresh
            </button>
          ) : null}
        </div>
      ) : null}
      <ConnectPlatformCardsGrid accounts={accounts} connectHrefPrefix={connectHrefPrefix} />
    </div>
  );
}
