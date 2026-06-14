import {
  accountMappedBrandId,
  countAccountsForBrand,
  CACHED_ACCOUNTS_STORAGE_KEY,
  readAccountBrandMapFromStorage,
  toBrandMapAccountRef,
} from '@/lib/brand-account-move';
import { BRAND_NAME, normalizeLegacyBrandName } from '@/lib/site-brand-assets';

export type IzopWorkspaceSnapshot = {
  id: string;
  name: string;
  connectedAccountCount: number;
  accounts: Array<{ id: string; platform: string; username: string | null }>;
};

export type IzopActiveBrandSnapshot = {
  id: string;
  name: string;
} | null;

const BRANDS_KEY = 'agent4socials_brands_v1';
const ACTIVE_BRAND_KEY = 'agent4socials_active_brand_v1';
const DEFAULT_BRAND_ID = 'brand-default';

type StoredAccount = { id: string; platform: string; username?: string | null };

function readBrandsFromBrowserStorage(): Array<{ id: string; name: string }> {
  if (typeof window === 'undefined') {
    return [{ id: DEFAULT_BRAND_ID, name: BRAND_NAME }];
  }
  try {
    const raw = localStorage.getItem(BRANDS_KEY) || sessionStorage.getItem(BRANDS_KEY);
    if (!raw) return [{ id: DEFAULT_BRAND_ID, name: BRAND_NAME }];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [{ id: DEFAULT_BRAND_ID, name: BRAND_NAME }];
    }
    const rows = parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        id: String(x.id ?? ''),
        name: normalizeLegacyBrandName(String(x.name ?? 'Untitled brand')),
      }))
      .filter((x) => x.id.length > 0);
    return rows.length ? rows : [{ id: DEFAULT_BRAND_ID, name: BRAND_NAME }];
  } catch {
    return [{ id: DEFAULT_BRAND_ID, name: BRAND_NAME }];
  }
}

function readCachedAccountsFromBrowserStorage(): StoredAccount[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw =
      localStorage.getItem(CACHED_ACCOUNTS_STORAGE_KEY) ||
      sessionStorage.getItem(CACHED_ACCOUNTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        id: String(x.id ?? ''),
        platform: String(x.platform ?? ''),
        username: typeof x.username === 'string' ? x.username : null,
      }))
      .filter((x) => x.id.length > 0 && x.platform.length > 0);
  } catch {
    return [];
  }
}

function buildBrandMap(
  accounts: StoredAccount[],
  explicitMap: Record<string, string>
): Record<string, string> {
  const map = { ...explicitMap };
  for (const account of accounts) {
    if (!map[account.id]) map[account.id] = DEFAULT_BRAND_ID;
  }
  return map;
}

/** Build brand workspace snapshot from client-side brand map (matches Account page). */
export function buildIzopWorkspaceSnapshot(
  brands: Array<{ id: string; name: string }>,
  accounts: Array<{ id: string; platform: string; username?: string | null }>,
  brandMap: Record<string, string>
): IzopWorkspaceSnapshot[] {
  if (!brands.length) return [];
  const refs = accounts.map(toBrandMapAccountRef);
  const map = buildBrandMap(accounts, brandMap);
  return brands.map((brand) => {
    const brandAccounts = accounts.filter(
      (a) => accountMappedBrandId(map, a.id) === brand.id
    );
    return {
      id: brand.id,
      name: brand.name,
      connectedAccountCount: countAccountsForBrand(refs, map, brand.id),
      accounts: brandAccounts.map((a) => ({
        id: a.id,
        platform: a.platform,
        username: a.username ?? null,
      })),
    };
  });
}

/** Read workspaces directly from browser storage (same source as Account page). */
export function readWorkspaceSnapshotFromBrowserStorage(): IzopWorkspaceSnapshot[] {
  const brands = readBrandsFromBrowserStorage();
  const accounts = readCachedAccountsFromBrowserStorage();
  const map = readAccountBrandMapFromStorage();
  return buildIzopWorkspaceSnapshot(brands, accounts, map);
}

export function readActiveBrandFromBrowserStorage(): IzopActiveBrandSnapshot {
  const brands = readBrandsFromBrowserStorage();
  if (!brands.length) return null;
  if (typeof window === 'undefined') return brands[0] ?? null;

  try {
    const raw =
      localStorage.getItem(ACTIVE_BRAND_KEY) || sessionStorage.getItem(ACTIVE_BRAND_KEY);
    const activeId = raw && brands.some((b) => b.id === raw) ? raw : brands[0]!.id;
    const brand = brands.find((b) => b.id === activeId);
    return brand ? { id: brand.id, name: brand.name } : null;
  } catch {
    return brands[0] ?? null;
  }
}

export function accountsFromWorkspaces(
  workspaces: IzopWorkspaceSnapshot[] | undefined
): Array<{ id: string; platform: string; username: string | null }> | null {
  if (!workspaces?.length) return null;
  const seen = new Set<string>();
  const out: Array<{ id: string; platform: string; username: string | null }> = [];
  for (const workspace of workspaces) {
    for (const account of workspace.accounts) {
      if (seen.has(account.id)) continue;
      seen.add(account.id);
      out.push(account);
    }
  }
  return out.length ? out : null;
}

export function summarizeWorkspaceAccounts(workspace: IzopWorkspaceSnapshot): string {
  if (!workspace.accounts.length) return 'no connected accounts';
  const labels = workspace.accounts.slice(0, 8).map((a) => {
    const handle = a.username?.trim();
    return handle ? `${a.platform} @${handle}` : a.platform;
  });
  const suffix = workspace.accounts.length > 8 ? ', …' : '';
  return labels.join(', ') + suffix;
}

/** Resolve brand workspaces for chat API (storage + React context + optional API fetch). */
export async function resolveChatBrandContext(options: {
  contextBrands?: Array<{ id: string; name: string }>;
  contextAccounts?: StoredAccount[];
  getAccountBrandId?: (accountId: string) => string;
  activeBrandId?: string;
  fetchAccounts?: () => Promise<StoredAccount[]>;
}): Promise<{ workspaces: IzopWorkspaceSnapshot[]; activeBrand: IzopActiveBrandSnapshot }> {
  const brands = options.contextBrands?.length
    ? options.contextBrands
    : readBrandsFromBrowserStorage();
  let accounts = options.contextAccounts?.length
    ? options.contextAccounts
    : readCachedAccountsFromBrowserStorage();

  if (!accounts.length && options.fetchAccounts) {
    try {
      accounts = await options.fetchAccounts();
    } catch {
      /* ignore */
    }
  }

  const map = buildBrandMap(accounts, readAccountBrandMapFromStorage());
  if (options.getAccountBrandId) {
    for (const account of accounts) {
      map[account.id] = options.getAccountBrandId(account.id);
    }
  }

  const workspaces = buildIzopWorkspaceSnapshot(brands, accounts, map);

  const activeId =
    options.activeBrandId ??
    readActiveBrandFromBrowserStorage()?.id ??
    brands[0]?.id ??
    null;
  const activeBrand = activeId
    ? brands.find((b) => b.id === activeId) ?? null
    : null;

  return {
    workspaces,
    activeBrand: activeBrand ? { id: activeBrand.id, name: activeBrand.name } : null,
  };
}
