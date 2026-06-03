import { META_BRAND_SCOPED_PLATFORMS } from '@/lib/brand-platform-connect';

/** Session key: full-page redirect after user resolves the brand-move modal (e.g. Facebook page picker). */
export const PENDING_CONNECT_REDIRECT_KEY = 'agent4socials_pending_connect_redirect_v1';

/** Must match AccountsCacheContext ACCOUNT_BRAND_MAP_KEY. */
export const ACCOUNT_BRAND_MAP_KEY = 'agent4socials_account_brand_map_v1';

export const DEFAULT_BRAND_ID = 'brand-default';

/** Brand workspace that owns this account in the client map (unset = default brand). */
export function accountMappedBrandId(
  map: Record<string, string>,
  accountId: string
): string {
  return map[accountId] ?? DEFAULT_BRAND_ID;
}

export function isAccountMappedToOtherBrand(
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string
): boolean {
  return accountMappedBrandId(map, accountId) !== activeBrandId;
}

/** True when the account has an explicit entry in the brand map (not inferred default brand). */
export function isAccountExplicitlyBrandMapped(
  map: Record<string, string>,
  accountId: string
): boolean {
  return Object.prototype.hasOwnProperty.call(map, accountId);
}

export type BrandMapAccountRef = { id: string; platform: string };

/** Sidebar shows at most one row per platform; first matching account in list order wins. */
export function getSidebarPlatformAccountForBrand(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  brandId: string,
  platform: string
): BrandMapAccountRef | null {
  const norm = platform.toUpperCase();
  for (const a of accounts) {
    if (a.platform.toUpperCase() !== norm) continue;
    if (accountMappedBrandId(map, a.id) !== brandId) continue;
    return a;
  }
  return null;
}

export function isAccountVisibleOnBrand(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  accountId: string,
  brandId: string
): boolean {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return false;
  const visible = getSidebarPlatformAccountForBrand(accounts, map, brandId, account.platform);
  return visible?.id === accountId;
}

/**
 * Prompt to move only when this account is the one shown on the other brand.
 * Meta platforms may have multiple DB rows; hidden duplicates should not block connect.
 */
export function shouldPromptMoveFromOtherBrand(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string
): boolean {
  if (!isAccountExplicitlyBrandMapped(map, accountId)) return false;
  const fromBrandId = map[accountId];
  if (fromBrandId === activeBrandId) return false;
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return true;
  const platform = account.platform.toUpperCase();
  if (!META_BRAND_SCOPED_PLATFORMS.has(platform)) return true;
  return isAccountVisibleOnBrand(accounts, map, accountId, fromBrandId);
}

export type PostConnectBrandAction =
  | { type: 'noop' }
  | { type: 'assign_active' }
  | { type: 'prompt_move'; fromBrandId: string };

export function resolvePostConnectBrandAction(
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string,
  accounts: BrandMapAccountRef[]
): PostConnectBrandAction {
  if (!isAccountExplicitlyBrandMapped(map, accountId)) {
    return { type: 'assign_active' };
  }
  const mappedBrandId = map[accountId];
  if (mappedBrandId === activeBrandId) return { type: 'noop' };
  if (shouldPromptMoveFromOtherBrand(accounts, map, accountId, activeBrandId)) {
    return { type: 'prompt_move', fromBrandId: mappedBrandId };
  }
  return { type: 'assign_active' };
}

/**
 * When /social/accounts is synced into cache, only brand-assign accounts that are
 * genuinely new (new DB row). Never bulk-assign or bulk-demote on full list refresh.
 */
export function applyBrandMapUpdatesOnAccountsSync(params: {
  prevMap: Record<string, string>;
  prevAccountIds: Set<string>;
  nextAccounts: BrandMapAccountRef[];
  activeBrandId: string;
  deferBrandAssign: boolean;
}): Record<string, string> {
  const map = { ...params.prevMap };
  for (const account of params.nextAccounts) {
    if (map[account.id] !== undefined) continue;
    if (params.deferBrandAssign) continue;
    // First bulk load with an empty cache must not assign every platform to the active brand.
    if (params.prevAccountIds.size === 0) continue;
    if (!params.prevAccountIds.has(account.id)) {
      map[account.id] = params.activeBrandId || DEFAULT_BRAND_ID;
    }
  }
  return map;
}

/** Count sidebar-visible accounts for a brand (one row per platform). */
export function countAccountsForBrand(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  brandId: string
): number {
  const seen = new Set<string>();
  let n = 0;
  for (const a of accounts) {
    if (accountMappedBrandId(map, a.id) !== brandId) continue;
    const platform = a.platform.toUpperCase();
    if (seen.has(platform)) continue;
    seen.add(platform);
    n += 1;
  }
  return n;
}

/**
 * Heal maps corrupted when a full account fetch ran with an empty cache while a
 * secondary brand was active (every account was assigned to that brand).
 */
export function repairCorruptedBrandMap(
  map: Record<string, string>,
  accounts: BrandMapAccountRef[],
  brandIds: string[]
): Record<string, string> {
  if (accounts.length === 0) return map;
  const validBrandIds = new Set(brandIds);
  const next: Record<string, string> = {};
  for (const [id, brandId] of Object.entries(map)) {
    if (validBrandIds.has(brandId)) next[id] = brandId;
  }

  const platformCount = new Set(accounts.map((a) => a.platform.toUpperCase())).size;

  for (const brandId of brandIds) {
    if (brandId === DEFAULT_BRAND_ID) continue;
    const onBrand = accounts.filter((a) => accountMappedBrandId(next, a.id) === brandId);
    if (onBrand.length < accounts.length - 1 || onBrand.length < Math.max(3, platformCount - 1)) {
      continue;
    }
    for (const a of onBrand) {
      delete next[a.id];
    }
  }

  for (const brandId of brandIds) {
    if (brandId === DEFAULT_BRAND_ID) continue;
    const seenPlatform = new Set<string>();
    for (const a of accounts) {
      if (accountMappedBrandId(next, a.id) !== brandId) continue;
      const p = a.platform.toUpperCase();
      if (seenPlatform.has(p)) delete next[a.id];
      else seenPlatform.add(p);
    }
  }

  return next;
}

export function brandMapsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

export function readAccountBrandMapFromStorage(): Record<string, string> {
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

/** Write brand map before a full-page navigation (React persist effects are too late). */
export function persistAccountBrandMapSync(map: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = JSON.stringify(map);
    localStorage.setItem(ACCOUNT_BRAND_MAP_KEY, raw);
    sessionStorage.setItem(ACCOUNT_BRAND_MAP_KEY, raw);
  } catch {
    // ignore
  }
}

export function buildNextBrandMapForMove(
  prev: Record<string, string>,
  accountId: string,
  activeBrandId: string,
  options?: {
    platform?: string;
    allAccounts?: Array<{ id: string; platform: string }>;
  }
): Record<string, string> {
  const next = { ...prev, [accountId]: activeBrandId };
  const platform =
    options?.platform?.toUpperCase() ??
    options?.allAccounts?.find((a) => a.id === accountId)?.platform?.toUpperCase();
  if (!platform || !options?.allAccounts?.length) return next;
  for (const [id, brandId] of Object.entries(next)) {
    if (brandId !== activeBrandId || id === accountId) continue;
    const other = options.allAccounts.find((a) => a.id === id);
    if (other?.platform === platform) next[id] = DEFAULT_BRAND_ID;
  }
  return next;
}

/** After user picks Move / Keep on the brand modal, drop connecting=1 so post-connect does not re-prompt. */
export function sanitizePostConnectRedirect(
  redirect: string,
  outcome: 'moved' | 'kept'
): string {
  const url = new URL(redirect, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
  url.searchParams.delete('connecting');
  url.searchParams.delete('brandMoved');
  url.searchParams.delete('brandKept');
  if (outcome === 'moved') url.searchParams.set('brandMoved', '1');
  else url.searchParams.set('brandKept', '1');
  return `${url.pathname}${url.search}`;
}

export function isPostConnectReturnFromUrl(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(search ?? window.location.search);
    return (
      params.get('connecting') === '1' ||
      params.get('brandMoved') === '1' ||
      params.get('brandKept') === '1'
    );
  } catch {
    return false;
  }
}

export function isBrandMoveResolvedFromUrl(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(search ?? window.location.search);
    return params.get('brandMoved') === '1' || params.get('brandKept') === '1';
  } catch {
    return false;
  }
}

export function isOAuthConnectingFromUrl(search?: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(search ?? window.location.search);
    return params.get('connecting') === '1';
  } catch {
    return false;
  }
}

export function readPostConnectAccountIdFromUrl(search?: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(search ?? window.location.search);
    if (!isPostConnectReturnFromUrl(search)) return null;
    return params.get('accountId');
  } catch {
    return null;
  }
}

export function parseAccountIdFromDashboardRedirect(redirect: string): string | null {
  try {
    const url = new URL(redirect, typeof window !== 'undefined' ? window.location.origin : 'https://localhost');
    return url.searchParams.get('accountId');
  } catch {
    return null;
  }
}
