'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { BrandAccountMovePrompt } from '@/components/account/BrandAccountMoveModal';
import { skipBrandMovePromptBeforeConnect } from '@/lib/brand-platform-connect';

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
const ACCOUNT_BRAND_MAP_KEY = 'agent4socials_account_brand_map_v1';
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

function readAccountBrandMapFromStorage(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(ACCOUNT_BRAND_MAP_KEY) || sessionStorage.getItem(ACCOUNT_BRAND_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === 'string' && typeof v === 'string' && k && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

type AccountsCacheContextType = {
  /** Accounts visible for the currently active brand only. */
  cachedAccounts: CachedAccount[];
  /** All connected accounts across brands (for admin utilities and brand assignment). */
  allCachedAccounts: CachedAccount[];
  setCachedAccounts: React.Dispatch<React.SetStateAction<CachedAccount[]>>;
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
  assignAccountToActiveBrand: (accountId: string) => void;
  /** If this account is mapped to another brand, open the move prompt. Returns true when shown. */
  maybePromptBrandMove: (accountId: string) => boolean;
  /** If this platform is only connected on another brand, open the move prompt. Returns true when shown. */
  maybePromptBrandMoveForPlatform: (platform: string) => boolean;
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

  // After OAuth: if account is on another brand, prompt to move instead of silently hiding it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('connecting') !== '1') return;
      const accountId = params.get('accountId');
      if (!accountId) return;
      const checkKey = `${accountId}:${activeBrandId}:${allCachedAccounts.length}`;
      if (postConnectBrandCheckDoneRef.current === checkKey) return;
      const account = allCachedAccounts.find((a) => a.id === accountId);
      if (!account) return;
      postConnectBrandCheckDoneRef.current = checkKey;
      const mappedBrandId = accountBrandMap[accountId] ?? DEFAULT_BRAND_ID;
      if (mappedBrandId !== activeBrandId) {
        const fromBrand = brands.find((b) => b.id === mappedBrandId);
        setBrandMovePrompt({
          accountId,
          platform: account.platform,
          username: typeof account.username === 'string' ? account.username : undefined,
          fromBrandName: fromBrand?.name ?? 'another brand',
        });
        return;
      }
      setAccountBrandMap((prev) => {
        if (prev[accountId] === activeBrandId) return prev;
        return { ...prev, [accountId]: activeBrandId };
      });
    } catch {
      // ignore
    }
  }, [activeBrandId, allCachedAccounts, accountBrandMap, brands]);
  useEffect(() => { persist(BRANDS_KEY, brands); }, [brands, persist]);
  useEffect(() => { persist(ACCOUNT_BRAND_MAP_KEY, accountBrandMap); }, [accountBrandMap, persist]);
  useEffect(() => { persist(ACTIVE_BRAND_KEY, activeBrandId); }, [activeBrandId, persist]);
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
      setAccountBrandMap((prevMap) => {
        const map = { ...prevMap };
        for (const account of next) {
          if (!map[account.id]) {
            const isNewlyConnectedAccount = !prevIds.has(account.id);
            map[account.id] = isNewlyConnectedAccount ? (activeBrandId || DEFAULT_BRAND_ID) : DEFAULT_BRAND_ID;
          }
        }
        for (const account of next) {
          if ((map[account.id] ?? DEFAULT_BRAND_ID) !== activeBrandId) continue;
          for (const [otherId, brandId] of Object.entries(map)) {
            if (brandId !== activeBrandId || otherId === account.id) continue;
            const other = next.find((a) => a.id === otherId);
            if (other?.platform === account.platform) {
              map[otherId] = DEFAULT_BRAND_ID;
            }
          }
        }
        return map;
      });
      return next;
    });
  }, [activeBrandId]);

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
    (accountId: string) => {
      if (!accountId || !activeBrandId) return;
      const account = allCachedAccounts.find((a) => a.id === accountId);
      if (!account) return;
      setAccountBrandMap((prev) => {
        const next = { ...prev, [accountId]: activeBrandId };
        for (const [id, brandId] of Object.entries(next)) {
          if (brandId !== activeBrandId || id === accountId) continue;
          const other = allCachedAccounts.find((a) => a.id === id);
          if (other?.platform === account.platform) {
            next[id] = DEFAULT_BRAND_ID;
          }
        }
        return next;
      });
    },
    [activeBrandId, allCachedAccounts]
  );

  const maybePromptBrandMove = useCallback(
    (accountId: string): boolean => {
      const account = allCachedAccounts.find((a) => a.id === accountId);
      if (!account) return false;
      const mappedBrandId = accountBrandMap[accountId] ?? DEFAULT_BRAND_ID;
      if (mappedBrandId === activeBrandId) return false;
      const fromBrand = brands.find((b) => b.id === mappedBrandId);
      setBrandMovePrompt({
        accountId,
        platform: account.platform,
        username: typeof account.username === 'string' ? account.username : undefined,
        fromBrandName: fromBrand?.name ?? 'another brand',
      });
      return true;
    },
    [allCachedAccounts, accountBrandMap, activeBrandId, brands]
  );

  const maybePromptBrandMoveForPlatform = useCallback(
    (platform: string): boolean => {
      if (skipBrandMovePromptBeforeConnect(platform)) return false;
      const norm = platform.toUpperCase();
      const matches = allCachedAccounts.filter((a) => a.platform === norm);
      if (matches.length === 0) return false;
      const onActive = matches.filter((a) => (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) === activeBrandId);
      if (onActive.length > 0) return false;
      const onOther = matches.filter((a) => (accountBrandMap[a.id] ?? DEFAULT_BRAND_ID) !== activeBrandId);
      if (onOther.length !== 1) return false;
      return maybePromptBrandMove(onOther[0].id);
    },
    [allCachedAccounts, accountBrandMap, activeBrandId, maybePromptBrandMove]
  );

  const value = useMemo(
    () => ({
      cachedAccounts,
      allCachedAccounts,
      setCachedAccounts,
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
      brandMovePrompt,
      dismissBrandMovePrompt,
    }),
    [
      cachedAccounts,
      allCachedAccounts,
      accountsLoadError,
      setCachedAccounts,
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
