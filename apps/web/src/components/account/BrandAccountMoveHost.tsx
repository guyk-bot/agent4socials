'use client';

import React from 'react';
import { BrandAccountMoveModal } from '@/components/account/BrandAccountMoveModal';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import {
  PENDING_CONNECT_REDIRECT_KEY,
  sanitizePostConnectRedirect,
} from '@/lib/brand-account-move';

function finishPendingConnectRedirect(outcome: 'moved' | 'kept') {
  if (typeof window === 'undefined') return;
  try {
    const redirect = sessionStorage.getItem(PENDING_CONNECT_REDIRECT_KEY);
    if (!redirect) return;
    sessionStorage.removeItem(PENDING_CONNECT_REDIRECT_KEY);
    window.location.href = sanitizePostConnectRedirect(redirect, outcome);
  } catch {
    // ignore
  }
}

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
        assignAccountToActiveBrand(brandMovePrompt.accountId, {
          platform: brandMovePrompt.platform,
        });
        selected?.setSelectedAccountId(brandMovePrompt.accountId);
        dismissBrandMovePrompt();
        finishPendingConnectRedirect('moved');
      }}
      onKeepOnOtherBrand={() => {
        dismissBrandMovePrompt();
        finishPendingConnectRedirect('kept');
      }}
    />
  );
}
