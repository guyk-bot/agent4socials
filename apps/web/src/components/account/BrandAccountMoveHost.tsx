'use client';

import React from 'react';
import { BrandAccountMoveModal } from '@/components/account/BrandAccountMoveModal';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import api from '@/lib/api';
import {
  finishPendingConnectNavigation,
  readPendingConnectNav,
} from '@/lib/brand-account-move';
import { dismissPendingConnect } from '@/lib/dismiss-pending-connect';

/** Renders brand move prompt inside SelectedAccountProvider (layout). */
export function BrandAccountMoveHost() {
  const cache = useAccountsCache();
  const selected = useSelectedAccount();

  if (!cache?.brandMovePrompt) return null;

  const {
    brandMovePrompt,
    activeBrandId,
    brands,
    assignAccountToActiveBrand,
    dismissBrandMovePrompt,
    setCachedAccounts,
  } = cache;

  const activeBrandName = brands.find((b) => b.id === activeBrandId)?.name ?? 'this brand';

  const refreshAccounts = async () => {
    try {
      const res = await api.get(`/social/accounts?_=${Date.now()}`);
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
    } catch {
      // ignore
    }
  };

  return (
    <BrandAccountMoveModal
      prompt={brandMovePrompt}
      activeBrandName={activeBrandName}
      onMove={async () => {
        if (!brandMovePrompt) return;
        assignAccountToActiveBrand(brandMovePrompt.accountId, {
          platform: brandMovePrompt.platform,
        });
        selected?.setSelectedAccountId(brandMovePrompt.accountId);
        dismissBrandMovePrompt();
        const pendingId = readPendingConnectNav()?.pendingId;
        await dismissPendingConnect(pendingId);
        finishPendingConnectNavigation('moved');
      }}
      onKeepOnOtherBrand={async () => {
        dismissBrandMovePrompt();
        await refreshAccounts();
        finishPendingConnectNavigation('kept');
      }}
    />
  );
}
