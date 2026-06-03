'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { BrandAccountMovePrompt } from '@/components/account/BrandAccountMoveModal';
import { skipBrandMovePromptForPlatform } from '@/lib/brand-platform-connect';
import {
  ACCOUNT_BRAND_MAP_KEY,
  accountMappedBrandId,
  applyBrandMapUpdatesOnAccountsSync,
  buildNextBrandMapForMove,
  isAccountMappedToOtherBrand,
  isAccountVisibleOnBrand,
  isBrandMoveResolvedFromUrl,
  isOAuthConnectingFromUrl,
  persistAccountBrandMapSync,
  readAccountBrandMapFromStorage,
  readPostConnectAccountIdFromUrl,
  brandMapsEqual,
  repairCorruptedBrandMap,
  resolvePostConnectBrandAction,
  shouldPromptMoveFromOtherBrand,
  prepareBrandMoveNavigation,
} from '@/lib/brand-account-move';

type CachedAccount = { id: string; platform: string; username?: string; profilePicture?: string | null; [key: string]: unknown };

/** Insert or refresh a just-connected account so the sidebar can render before /social/accounts returns. */
export function upsertOptimisticConnectedAccount(
  accounts: CachedAccount[],
  payload: { id: string; platform: string; username?: string; profilePicture?: string | null }
): CachedAccount[] {
  const row: CachedAccount = {
    id: payload.id,
    platform: payload.platform,
    username: payload.username ?? payload.platform,
    profilePicture: payload.profilePicture ?? null,
  };
  const idx = accounts.findIndex((a) => a.id === payload.id);
  if (idx === -1) return [...accounts, row];
  const updated = [...accounts];
  updated[idx] = { ...updated[idx], ...row };
  return updated;
}
export type BrandWorkspace = {
  id: string;
  name: string;
  imageUrl?: string | null;
  createdAt: string;
};

const STORAGE_KEY = 'agent4socials_cached_accounts_v2';
const BRANDS_KEY = 'agent4socials_brands_v1';
const ACTIVE_BRAND_KEY = 'agent4socials_active_brand_v1';
const DEFAULT_BRAND_ID = 'brand-default';

function readAccountsFromStorage(): CachedAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : [];
    const result: CachedAccount[] = Array.isArray(stored) ? stored : [];

    // When the OAuth callback redirects with ?connecting=1, it also embeds the
    // new account's platform/username/picture so the sidebar can render it
    // immediately on first paint — no API round-trip needed.
    try {
      const params = new URLSearchParams(window.location.search);
      const accountId = params.get('accountId');
      const connecting = params.get('connecting');
      const newPlatform = params.get('newPlatform');
      if (connecting === '1' && accountId && newPlatform) {
        const newUsername = params.get('newUsername') ?? newPlatform;
        const newPic = params.get('newPic') ?? null;
        const idx = result.findIndex((a) => a.id === accountId);
        if (idx === -1) {
          // New account not in localStorage yet — inject it so the sidebar shows it right away
          return [...result, { id: accountId, platform: newPlatform, username: newUsername, profilePicture: newPic }];
        } else {
          // Reconnecting — refresh cached metadata from redirect params
          const updated = [...result];
          updated[idx] = { ...updated[idx], username: newUsername, profilePicture: newPic };
          return updated;
        }
      }
    } catch {
      // ignore URL parse errors
    }

    return result;
  } catch {
    return [];
  }
}

function defaultBrands(): BrandWorkspace[] {
  return [{ id: DEFAULT_BRAND_ID, name: 'Agent4socials', imageUrl: null, createdAt: new Date().toISOString() }];
}

function readBrandsFromStorage(): BrandWorkspace[] {
  if (typeof window === 'undefined') return defaultBrands();
  try {
    const raw = localStorage.getItem(BRANDS_KEY) || sessionStorage.getItem(BRANDS_KEY);
    if (!raw) return defaultBrands();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultBrands();
    const rows = parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        id: String(x.id ?? ''),
        name: String(x.name ?? 'Untitled brand'),
        imageUrl: typeof x.imageUrl === 'string' ? x.imageUrl : null,
        createdAt: String(x.createdAt ?? new Date().toISOString()),
      }))
      .filter((x) => x.id.length > 0);
    return rows.length ? rows : defaultBrands();
  } catch {
    return defaultBrands();
  }
}

function readActiveBrandIdFromStorage(brands: BrandWorkspace[]): string {
  if (typeof window === 'undefined') return brands[0]?.id ?? DEFAULT_BRAND_ID;
  try {
    const raw = localStorage.getItem(ACTIVE_BRAND_KEY) || sessionStorage.getItem(ACTIVE_BRAND_KEY);
    if (!raw) return brands[0]?.id ?? DEFAULT_BRAND_ID;
    return brands.some((b) => b.id === raw) ? raw : (brands[0]?.id ?? DEFAULT_BRAND_ID);
  } catch {
    return brands[0]?.id ?? DEFAULT_BRAND_ID;
  }
}


export type FinishPostConnectBrandResult = 'prompt' | 'assigned' | 'noop';

type AccountsCacheContextType = {
  /** Accounts visible for the currently active brand only. */
  cachedAccounts: CachedAccount[];
  /** All connected accounts across brands (for admin utilities and brand assignment). */
  allCachedAccounts: CachedAccount[];
  setCachedAccounts: React.Dispatch<React.SetStateAction<CachedAccount[]>>;
  /** Remove one account from cache immediately (e.g. optimistic disconnect). */
  removeConnectedAccountFromCache: (accountId: string) => void;
  accountsLoadError: string | null;
  setAccountsLoadError: React.Dispatch<React.SetStateAction<string | null>>;
  brands: BrandWorkspace[];
  activeBrandId: string;
  setActiveBrandId: (id: string) => void;
  createBrand: (name: string, imageUrl?: string | null) => string;
  renameBrand: (brandId: string, name: string) => void;
  deleteBrand: (brandId: string) => boolean;
  setBrandImage: (brandId: string, imageUrl: string | null) => void;
  getAccountBrandId: (accountId: string) => string;
  /** Assign a connected account to the active brand (local brand map only). */
  assignAccountToActiveBrand: (accountId: string, options?: { platform?: string }) => void;
  /** If this account is mapped to another brand, open the move prompt. Returns true when shown. */
  maybePromptBrandMove: (
    accountId: string,
    hint?: { platform: string; username?: string },
    options?: { successRedirect?: string }
  ) => boolean;
  /**
   * After OAuth with a fresh /social/accounts list (avoids stale React state).
   * Assigns the account to the active brand when unassigned; prompts move when on another brand.
   */
  finishPostConnectBrandAssignment: (
    accountId: string,
    freshAccounts: CachedAccount[],
    hint?: { platform: string; username?: string },
    options?: { successRedirect?: string }
  ) => FinishPostConnectBrandResult;
  /** If this platform is only connected on another brand, open the move prompt. Returns true when shown. */
  maybePromptBrandMoveForPlatform: (platform: string, options?: { afterConnect?: boolean }) => boolean;
  /** Connected on a different brand workspace (not shown in sidebar for the active brand). */
  getOtherBrandPlatformAccount: (
    platform: string
  ) => { account: CachedAccount; brandId: string; brandName: string } | null;
  brandMovePrompt: BrandAccountMovePrompt | null;
  dismissBrandMovePrompt: () => void;
};

const AccountsCacheContext = createContext<AccountsCacheContextType | undefined>(undefined);

export function AccountsCacheProvider({ children }: { children: React.ReactNode }) {
  const [allCachedAccounts, setAllCachedAccountsState] = useState<CachedAccount[]>(readAccountsFromStorage);
  const [accountsLoadError, setAccountsLoadError] = useState<string | null>(null);
  const [brands, setBrands] = useState<BrandWorkspace[]>(readBrandsFromStorage);
  const [accountBrandMap, setAccountBrandMap] = useState<Record<string, string>>(readAccountBrandMapFromStorage);
  const [activeBrandId, setActiveBrandIdState] = useState<string>(() => readActiveBrandIdFromStorage(readBrandsFromStorage()));
  const [brandMovePrompt, setBrandMovePrompt] = useState<BrandAccountMovePrompt | null>(null);

  const persist = useCallback((key: string, value: unknown) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      sessionStorage.setItem(key, raw);
      localStorage.setItem(key, raw);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => { persist(STORAGE_KEY, allCachedAccounts); }, [allCachedAccounts, persist]);

  const dismissBrandMovePrompt = useCallback(() => setBrandMovePrompt(null), []);

  const postConnectBrandCheckDoneRef = React.useRef<string | null>(null);
  const brandMapRepairDoneRef = React.useRef(false);

  useEffect(() => { persist(BRANDS_KEY, brands); }, [brands, persist]);
  useEffect(() => { persist(ACCOUNT_BRAND_MAP_KEY, accountBrandMap); }, [accountBrandMap, persist]);
  useEffect(() => { persist(ACTIVE_BRAND_KEY, activeBrandId); }, [activeBrandId, persist]);

  useEffect(() => {
    if (brandMapRepairDoneRef.current || allCachedAccounts.length === 0 || brands.length === 0) return;
    brandMapRepairDoneRef.current = true;
    setAccountBrandMap((prev) => {
      const repaired = repairCorruptedBrandMap(
        prev,
        allCachedAccounts.map((a) => ({ id: a.id, platform: a.platform })),
        brands.map((b) => b.id)
      );
      if (brandMapsEqual(repaired, prev)) return prev;
      persistAccountBrandMapSync(repaired);
      return repaired;
    });
  }, [allCachedAccounts, brands]);
  useEffect(() => {
    // If a brand has no image yet, default it from one of its connected account avatars.
    setBrands((prev) => {
      let changed = false;
      const next = prev.map((brand) => {
        if (brand.imageUrl) return brand;
        const pick =
          allCachedAccounts.find(
            (a) =>
              (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) === brand.id &&
              typeof a.profilePicture === 'string' &&
              a.profilePicture
          )?.profilePicture ?? null;
        if (!pick) return brand;
        changed = true;
        return { ...brand, imageUrl: pick };
      });
      return changed ? next : prev;
    });
  }, [allCachedAccounts, accountBrandMap]);

  const cachedAccounts = useMemo(() => {
    const onBrand = allCachedAccounts.filter(
      (a) => (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) === activeBrandId
    );
    const seenPlatform = new Set<string>();
    return onBrand.filter((a) => {
      if (seenPlatform.has(a.platform)) return false;
      seenPlatform.add(a.platform);
      return true;
    });
  }, [allCachedAccounts, accountBrandMap, activeBrandId]);

  const setCachedAccounts = useCallback((arg: React.SetStateAction<CachedAccount[]>) => {
    setAllCachedAccountsState((prev) => {
      const next = typeof arg === 'function' ? arg(prev) : arg;
      const prevIds = new Set(prev.map((a) => a.id));
      const deferBrandAssign = isOAuthConnectingFromUrl();
      setAccountBrandMap((prevMap) => {
        const brandIds = brands.map((b) => b.id);
        const synced = applyBrandMapUpdatesOnAccountsSync({
          prevMap,
          prevAccountIds: prevIds,
          nextAccounts: next.map((a) => ({ id: a.id, platform: a.platform })),
          activeBrandId: activeBrandId || DEFAULT_BRAND_ID,
          deferBrandAssign,
        });
        const repaired = repairCorruptedBrandMap(synced, next, brandIds);
        if (!brandMapsEqual(repaired, prevMap)) {
          persistAccountBrandMapSync(repaired);
        }
        return repaired;
      });
      return next;
    });
  }, [activeBrandId, brands]);

  const removeConnectedAccountFromCache = useCallback((accountId: string) => {
    if (!accountId) return;
    setAllCachedAccountsState((prev) => prev.filter((a) => a.id !== accountId));
    setAccountBrandMap((prev) => {
      if (!(accountId in prev)) return prev;
      const next = { ...prev };
      delete next[accountId];
      persistAccountBrandMapSync(next);
      return next;
    });
  }, []);

  const setActiveBrandId = useCallback((id: string) => {
    if (!id) return;
    setActiveBrandIdState(id);
  }, []);

  const createBrand = useCallback((name: string, imageUrl?: string | null) => {
    const trimmed = name.trim();
    const id = `brand-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const fallbackImageFromConnected = allCachedAccounts.find((a) => typeof a.profilePicture === 'string' && a.profilePicture)?.profilePicture ?? null;
    const next: BrandWorkspace = {
      id,
      name: trimmed || 'New brand',
      imageUrl: imageUrl ?? fallbackImageFromConnected ?? null,
      createdAt: new Date().toISOString(),
    };
    setBrands((prev) => [...prev, next]);
    setActiveBrandIdState(id);
    return id;
  }, [allCachedAccounts]);

  const setBrandImage = useCallback((brandId: string, imageUrl: string | null) => {
    setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, imageUrl } : b)));
  }, []);

  const renameBrand = useCallback((brandId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBrands((prev) => prev.map((b) => (b.id === brandId ? { ...b, name: trimmed } : b)));
  }, []);

  const deleteBrand = useCallback((brandId: string): boolean => {
    const brandExists = brands.some((b) => b.id === brandId);
    if (!brandExists || brands.length <= 1) return false;
    const remaining = brands.filter((b) => b.id !== brandId);
    if (remaining.length === 0) return false;
    const fallbackBrandId = remaining.find((b) => b.id === DEFAULT_BRAND_ID)?.id ?? remaining[0].id;
    setBrands(remaining);
    setAccountBrandMap((prev) => {
      const next = { ...prev };
      for (const [accountId, mappedBrandId] of Object.entries(next)) {
        if (mappedBrandId === brandId) next[accountId] = fallbackBrandId;
      }
      return next;
    });
    if (activeBrandId === brandId) {
      setActiveBrandIdState(fallbackBrandId);
    }
    return true;
  }, [brands, activeBrandId]);

  const getAccountBrandId = useCallback((accountId: string) => {
    return accountBrandMap[accountId] ?? DEFAULT_BRAND_ID;
  }, [accountBrandMap]);

  const assignAccountToActiveBrand = useCallback(
    (accountId: string, options?: { platform?: string }) => {
      if (!accountId || !activeBrandId) return;
      const account = allCachedAccounts.find((a) => a.id === accountId);
      const platform = options?.platform ?? account?.platform;
      setAccountBrandMap((prev) => {
        const next = buildNextBrandMapForMove(prev, accountId, activeBrandId, {
          platform,
          allAccounts: allCachedAccounts.map((a) => ({ id: a.id, platform: a.platform })),
        });
        persistAccountBrandMapSync(next);
        return next;
      });
    },
    [activeBrandId, allCachedAccounts]
  );

  const maybePromptBrandMove = useCallback(
    (
      accountId: string,
      hint?: { platform: string; username?: string },
      options?: { successRedirect?: string }
    ): boolean => {
      const map = { ...readAccountBrandMapFromStorage(), ...accountBrandMap };
      if (!shouldPromptMoveFromOtherBrand(allCachedAccounts, map, accountId, activeBrandId)) {
        return false;
      }
      const mappedBrandId = accountMappedBrandId(map, accountId);
      const account = allCachedAccounts.find((a) => a.id === accountId);
      const platform = account?.platform ?? hint?.platform;
      if (!platform) return false;
      const fromBrand = brands.find((b) => b.id === mappedBrandId);
      prepareBrandMoveNavigation(options?.successRedirect);
      setBrandMovePrompt({
        accountId,
        platform,
        username:
          (typeof account?.username === 'string' ? account.username : undefined) ??
          hint?.username,
        fromBrandName: fromBrand?.name ?? 'another brand',
      });
      return true;
    },
    [allCachedAccounts, accountBrandMap, activeBrandId, brands]
  );

  const maybePromptBrandMoveForPlatform = useCallback(
    (platform: string, options?: { afterConnect?: boolean }): boolean => {
      if (skipBrandMovePromptForPlatform(platform)) return false;
      const norm = platform.toUpperCase();
      const matches = allCachedAccounts.filter((a) => a.platform === norm);
      if (matches.length === 0) return false;
      const map = { ...readAccountBrandMapFromStorage(), ...accountBrandMap };
      const onActive = matches.filter(
        (a) => accountMappedBrandId(map, a.id) === activeBrandId
      );
      if (onActive.length > 0) return false;
      const onOther = matches.filter(
        (a) =>
          isAccountMappedToOtherBrand(map, a.id, activeBrandId) &&
          isAccountVisibleOnBrand(allCachedAccounts, map, a.id, accountMappedBrandId(map, a.id))
      );
      if (onOther.length !== 1) return false;
      return maybePromptBrandMove(onOther[0].id);
    },
    [allCachedAccounts, accountBrandMap, activeBrandId, maybePromptBrandMove]
  );

  const finishPostConnectBrandAssignment = useCallback(
    (
      accountId: string,
      freshAccounts: CachedAccount[],
      hint?: { platform: string; username?: string },
      options?: { successRedirect?: string }
    ): FinishPostConnectBrandResult => {
      const account =
        freshAccounts.find((a) => a.id === accountId) ??
        allCachedAccounts.find((a) => a.id === accountId);
      const platform = account?.platform ?? hint?.platform;
      if (!platform) return 'noop';
      const map = { ...readAccountBrandMapFromStorage(), ...accountBrandMap };
      const accountRefs = freshAccounts.map((a) => ({ id: a.id, platform: a.platform }));
      const action = resolvePostConnectBrandAction(map, accountId, activeBrandId, accountRefs);
      if (action.type === 'prompt_move') {
        const fromBrand = brands.find((b) => b.id === action.fromBrandId);
        prepareBrandMoveNavigation(options?.successRedirect);
        setBrandMovePrompt({
          accountId,
          platform,
          username:
            (typeof account?.username === 'string' ? account.username : undefined) ??
            hint?.username,
          fromBrandName: fromBrand?.name ?? 'another brand',
        });
        return 'prompt';
      }
      if (action.type === 'assign_active') {
        const next = buildNextBrandMapForMove(map, accountId, activeBrandId, {
          platform,
          allAccounts: accountRefs,
        });
        if (!brandMapsEqual(next, map)) {
          persistAccountBrandMapSync(next);
          setAccountBrandMap(next);
        }
        return 'assigned';
      }
      return 'noop';
    },
    [accountBrandMap, activeBrandId, allCachedAccounts, brands]
  );

  const getOtherBrandPlatformAccount = useCallback(
    (platform: string) => {
      const norm = platform.toUpperCase();
      const onActive = allCachedAccounts.some(
        (a) => a.platform === norm && (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) === activeBrandId
      );
      if (onActive) return null;
      const candidates = allCachedAccounts.filter((a) => a.platform === norm);
      const onOther = candidates.find((a) => (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) !== activeBrandId);
      if (!onOther) return null;
      const brandId = accountBrandMap[onOther.id] ?? DEFAULT_BRAND_ID;
      const brand = brands.find((b) => b.id === brandId);
      return {
        account: onOther,
        brandId,
        brandName: brand?.name ?? 'another brand',
      };
    },
    [allCachedAccounts, accountBrandMap, activeBrandId, brands]
  );

  // After OAuth: if account is explicitly on another brand, prompt to move (never auto-move).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (isBrandMoveResolvedFromUrl()) {
        const accountId = readPostConnectAccountIdFromUrl();
        if (accountId) {
          postConnectBrandCheckDoneRef.current = `resolved:${accountId}:${activeBrandId}`;
        }
        return;
      }
      const accountId = readPostConnectAccountIdFromUrl();
      if (!accountId) return;
      const checkKey = `${accountId}:${activeBrandId}:${allCachedAccounts.length}:${accountMappedBrandId(accountBrandMap, accountId)}`;
      if (postConnectBrandCheckDoneRef.current === checkKey) return;
      const account = allCachedAccounts.find((a) => a.id === accountId);
      if (!account) return;
      postConnectBrandCheckDoneRef.current = checkKey;
      const postConnectResult = finishPostConnectBrandAssignment(accountId, allCachedAccounts);
      if (postConnectResult === 'prompt') return;
      if (postConnectResult !== 'noop') return;
      if (maybePromptBrandMoveForPlatform(account.platform, { afterConnect: true })) return;
    } catch {
      // ignore
    }
  }, [
    activeBrandId,
    allCachedAccounts,
    accountBrandMap,
    brands,
    maybePromptBrandMove,
    maybePromptBrandMoveForPlatform,
    finishPostConnectBrandAssignment,
  ]);

  const value = useMemo(
    () => ({
      cachedAccounts,
      allCachedAccounts,
      setCachedAccounts,
      removeConnectedAccountFromCache,
      accountsLoadError,
      setAccountsLoadError,
      brands,
      activeBrandId,
      setActiveBrandId,
      createBrand,
      renameBrand,
      deleteBrand,
      setBrandImage,
      getAccountBrandId,
      assignAccountToActiveBrand,
      maybePromptBrandMove,
      maybePromptBrandMoveForPlatform,
      finishPostConnectBrandAssignment,
      getOtherBrandPlatformAccount,
      brandMovePrompt,
      dismissBrandMovePrompt,
    }),
    [
      cachedAccounts,
      allCachedAccounts,
      accountsLoadError,
      setCachedAccounts,
      removeConnectedAccountFromCache,
      setAccountsLoadError,
      brands,
      activeBrandId,
      setActiveBrandId,
      createBrand,
      renameBrand,
      deleteBrand,
      setBrandImage,
      getAccountBrandId,
      assignAccountToActiveBrand,
      maybePromptBrandMove,
      maybePromptBrandMoveForPlatform,
      finishPostConnectBrandAssignment,
      getOtherBrandPlatformAccount,
      brandMovePrompt,
      dismissBrandMovePrompt,
    ]
  );

  return <AccountsCacheContext.Provider value={value}>{children}</AccountsCacheContext.Provider>;
}

export function useAccountsCache() {
  const ctx = useContext(AccountsCacheContext);
  return ctx;
}
