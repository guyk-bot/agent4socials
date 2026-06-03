'use client';

import React from 'react';
import { BrandAccountMoveModal } from '@/components/account/BrandAccountMoveModal';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';

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
  } = cache;

  const activeBrandName = brands.find((b) => b.id === activeBrandId)?.name ?? 'this brand';

  return (
    <BrandAccountMoveModal
      prompt={brandMovePrompt}
      activeBrandName={activeBrandName}
      onMove={() => {
        if (!brandMovePrompt) return;
        assignAccountToActiveBrand(brandMovePrompt.accountId);
        selected?.setSelectedAccountId(brandMovePrompt.accountId);
        dismissBrandMovePrompt();
      }}
      onKeepOnOtherBrand={dismissBrandMovePrompt}
    />
  );
}
