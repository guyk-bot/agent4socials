import { META_BRAND_SCOPED_PLATFORMS } from '@/lib/brand-platform-connect';

/** Session key: full-page redirect after user resolves the brand-move modal (e.g. Facebook page picker). */
export const PENDING_CONNECT_REDIRECT_KEY = 'agent4socials_pending_connect_redirect_v1';

/** Where to return on "Keep on other brand" vs success redirect on "Move to this brand". */
export const PENDING_CONNECT_NAV_KEY = 'agent4socials_pending_connect_nav_v1';

/** Brand workspace active when OAuth started (full-page Twitter redirect loses React state). */
export const PENDING_CONNECT_ACTIVE_BRAND_KEY = 'agent4socials_pending_connect_active_brand_v1';

/** Must match AccountsCacheContext STORAGE_KEY. */
export const CACHED_ACCOUNTS_STORAGE_KEY = 'agent4socials_cached_accounts_v2';

export type PendingConnectNav = {
  successRedirect: string;
  returnUrl: string;
  pendingId?: string;
  activeBrandId?: string;
};

export function storePendingConnectActiveBrand(brandId: string): void {
  if (typeof window === 'undefined' || !brandId) return;
  try {
    sessionStorage.setItem(PENDING_CONNECT_ACTIVE_BRAND_KEY, brandId);
  } catch {
    // ignore
  }
}

export function readPendingConnectActiveBrand(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(PENDING_CONNECT_ACTIVE_BRAND_KEY);
  } catch {
    return null;
  }
}

export function clearPendingConnectActiveBrand(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_CONNECT_ACTIVE_BRAND_KEY);
  } catch {
    // ignore
  }
}

/** Account ids persisted before OAuth (excludes URL optimistic inject on return). */
export function readCachedAccountIdsFromStorage(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw =
      localStorage.getItem(CACHED_ACCOUNTS_STORAGE_KEY) ||
      sessionStorage.getItem(CACHED_ACCOUNTS_STORAGE_KEY);
    const stored: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(stored)) return new Set();
    const ids = stored
      .filter((a): a is { id: string } => !!a && typeof a === 'object' && typeof (a as { id?: unknown }).id === 'string')
      .map((a) => a.id);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

const DEFAULT_CONNECT_RETURN_URL = '/dashboard';

export function buildDashboardSuccessRedirect(
  accountId?: string,
  platform?: string
): string {
  if (typeof window === 'undefined' && !accountId) return DEFAULT_CONNECT_RETURN_URL;
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://agent4socials.com';
  const url = new URL('/dashboard', origin);
  if (accountId) url.searchParams.set('accountId', accountId);
  if (platform) url.searchParams.set('newPlatform', platform.toUpperCase());
  return `${url.pathname}${url.search}`;
}

export function resolveBrandMoveReturnUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_CONNECT_RETURN_URL;
  const path = window.location.pathname;
  if (path.includes('/accounts/') && path.includes('/select')) {
    return `${path}${window.location.search}`;
  }
  // After connect, always land on the dashboard (not Account settings).
  if (path.startsWith('/dashboard/account')) {
    return buildDashboardSuccessRedirect();
  }
  if (path.startsWith('/dashboard')) {
    return `${path}${window.location.search}`;
  }
  return DEFAULT_CONNECT_RETURN_URL;
}

/** True when this account row existed before the OAuth return (not a brand-new DB row). */
export function isPostConnectReconnect(
  accountId: string,
  _platform: string,
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  activeBrandId: string,
  prevAccountIds?: Set<string>
): boolean {
  if (prevAccountIds?.has(accountId)) return true;
  if (isAccountExplicitlyBrandMapped(map, accountId) && map[accountId] !== activeBrandId) {
    return true;
  }
  for (const brandId of enumerateKnownBrandIds(map)) {
    if (brandId === activeBrandId) continue;
    if (isAccountVisibleOnBrand(accounts, map, accountId, brandId)) return true;
  }
  return false;
}

export function readPendingIdFromLocation(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return new URLSearchParams(window.location.search).get('pendingId') ?? undefined;
  } catch {
    return undefined;
  }
}

export function readPendingConnectNav(): PendingConnectNav | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      sessionStorage.getItem(PENDING_CONNECT_NAV_KEY) ||
      (() => {
        const legacy = sessionStorage.getItem(PENDING_CONNECT_REDIRECT_KEY);
        if (!legacy) return null;
        return JSON.stringify({
          successRedirect: legacy,
          returnUrl: resolveBrandMoveReturnUrl(),
          pendingId: readPendingIdFromLocation(),
        } satisfies PendingConnectNav);
      })();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingConnectNav;
    if (!parsed?.successRedirect || !parsed?.returnUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storePendingConnectNav(nav: PendingConnectNav): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_CONNECT_NAV_KEY, JSON.stringify(nav));
    sessionStorage.setItem(PENDING_CONNECT_REDIRECT_KEY, nav.successRedirect);
    if (nav.activeBrandId) {
      storePendingConnectActiveBrand(nav.activeBrandId);
    }
  } catch {
    // ignore
  }
}

export function clearPendingConnectNav(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_CONNECT_NAV_KEY);
    sessionStorage.removeItem(PENDING_CONNECT_REDIRECT_KEY);
    clearPendingConnectActiveBrand();
  } catch {
    // ignore
  }
}

export function prepareBrandMoveNavigation(successRedirect?: string): void {
  const existing = readPendingConnectNav();
  if (successRedirect) {
    storePendingConnectNav({
      successRedirect,
      returnUrl: existing?.returnUrl ?? resolveBrandMoveReturnUrl(),
      pendingId: existing?.pendingId ?? readPendingIdFromLocation(),
    });
    return;
  }
  if (existing) return;
  storePendingConnectNav({
    successRedirect: DEFAULT_CONNECT_RETURN_URL,
    returnUrl: resolveBrandMoveReturnUrl(),
    pendingId: readPendingIdFromLocation(),
  });
}

export function finishPendingConnectNavigation(outcome: 'moved' | 'kept'): void {
  if (typeof window === 'undefined') return;
  const nav = readPendingConnectNav();
  clearPendingConnectNav();
  if (outcome === 'kept') {
    window.location.href = nav?.returnUrl ?? DEFAULT_CONNECT_RETURN_URL;
    return;
  }
  const redirect = nav?.successRedirect;
  if (redirect) {
    window.location.href = sanitizePostConnectRedirect(redirect, 'moved');
  }
}

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

export type BrandMapAccountRef = {
  id: string;
  platform: string;
  platformUserId?: string;
};

export function toBrandMapAccountRef(account: {
  id: string;
  platform: string;
  platformUserId?: unknown;
}): BrandMapAccountRef {
  return {
    id: account.id,
    platform: account.platform,
    platformUserId:
      typeof account.platformUserId === 'string' ? account.platformUserId : undefined,
  };
}

export function mergeBrandMapAccountRefs(
  ...groups: Array<Array<{ id: string; platform: string; platformUserId?: unknown }>>
): BrandMapAccountRef[] {
  const byId = new Map<string, BrandMapAccountRef>();
  for (const group of groups) {
    for (const account of group) {
      byId.set(account.id, toBrandMapAccountRef(account));
    }
  }
  return [...byId.values()];
}

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

export function enumerateKnownBrandIds(map: Record<string, string>): string[] {
  return [...new Set([DEFAULT_BRAND_ID, ...Object.values(map)])];
}

/** Brand workspace where this account is shown in the sidebar, if any (excluding active). */
/**
 * True when the user just connected a different external account (e.g. another TikTok open_id)
 * while another row of the same platform is already visible on a different brand workspace.
 * In that case we assign the new row to the active brand without a move prompt.
 */
export function isNewDistinctPlatformConnectionOnOtherBrand(
  connected: BrandMapAccountRef,
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  activeBrandId: string
): boolean {
  const norm = connected.platform.toUpperCase();
  if (META_BRAND_SCOPED_PLATFORMS.has(norm)) return false;

  const otherVisible = accounts.filter((a) => {
    if (a.id === connected.id) return false;
    if (a.platform.toUpperCase() !== norm) return false;
    for (const brandId of enumerateKnownBrandIds(map)) {
      if (brandId === activeBrandId) continue;
      if (isAccountVisibleOnBrand(accounts, map, a.id, brandId)) return true;
    }
    return false;
  });

  if (otherVisible.length === 0) return false;

  const connectedPuid = connected.platformUserId?.trim();
  if (connectedPuid) {
    return otherVisible.every((a) => {
      const puid = a.platformUserId?.trim();
      return Boolean(puid && puid !== connectedPuid);
    });
  }

  return !accounts.some((a) => a.id === connected.id);
}

export function resolveOtherBrandIdForMovePrompt(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string
): string | null {
  if (isAccountExplicitlyBrandMapped(map, accountId) && map[accountId] !== activeBrandId) {
    return map[accountId];
  }
  for (const brandId of enumerateKnownBrandIds(map)) {
    if (brandId === activeBrandId) continue;
    if (isAccountVisibleOnBrand(accounts, map, accountId, brandId)) return brandId;
  }
  return null;
}

/**
 * Prompt to move only when this account is the one shown on the other brand.
 * Meta platforms may have multiple DB rows; hidden duplicates should not block connect.
 */
export function shouldPromptMoveFromOtherBrand(
  accounts: BrandMapAccountRef[],
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string,
  prevAccountIds?: Set<string>
): boolean {
  // First-time connect: new row id was not in cache before OAuth.
  if (prevAccountIds !== undefined && !prevAccountIds.has(accountId)) {
    return false;
  }
  const account = accounts.find((a) => a.id === accountId);
  if (!account) {
    return (
      isAccountExplicitlyBrandMapped(map, accountId) && map[accountId] !== activeBrandId
    );
  }

  if (isAccountVisibleOnBrand(accounts, map, accountId, activeBrandId)) {
    return false;
  }

  for (const brandId of enumerateKnownBrandIds(map)) {
    if (brandId === activeBrandId) continue;
    if (!isAccountVisibleOnBrand(accounts, map, accountId, brandId)) continue;
    if (META_BRAND_SCOPED_PLATFORMS.has(account.platform.toUpperCase())) {
      return true;
    }
    return true;
  }

  if (isAccountExplicitlyBrandMapped(map, accountId) && map[accountId] !== activeBrandId) {
    const platform = account.platform.toUpperCase();
    if (META_BRAND_SCOPED_PLATFORMS.has(platform)) {
      return isAccountVisibleOnBrand(accounts, map, accountId, map[accountId]);
    }
    return true;
  }

  return false;
}

export type PostConnectBrandAction =
  | { type: 'noop' }
  | { type: 'assign_active' }
  | { type: 'prompt_move'; fromBrandId: string };

export function resolvePostConnectBrandAction(
  map: Record<string, string>,
  accountId: string,
  activeBrandId: string,
  accounts: BrandMapAccountRef[],
  options?: {
    isReconnect?: boolean;
    isDistinctNewConnection?: boolean;
    prevAccountIds?: Set<string>;
  }
): PostConnectBrandAction {
  const connected = accounts.find((a) => a.id === accountId);
  if (
    connected &&
    isNewDistinctPlatformConnectionOnOtherBrand(connected, accounts, map, activeBrandId)
  ) {
    return { type: 'assign_active' };
  }

  const mappedBrandId = accountMappedBrandId(map, accountId);
  if (
    mappedBrandId === activeBrandId &&
    isAccountVisibleOnBrand(accounts, map, accountId, activeBrandId)
  ) {
    return { type: 'noop' };
  }

  if (
    shouldPromptMoveFromOtherBrand(
      accounts,
      map,
      accountId,
      activeBrandId,
      options?.prevAccountIds
    )
  ) {
    const fromBrandId = resolveOtherBrandIdForMovePrompt(
      accounts,
      map,
      accountId,
      activeBrandId
    );
    if (fromBrandId && connected) {
      // Only prompt when this exact row is the one shown on the source brand.
      if (!isAccountVisibleOnBrand(accounts, map, accountId, fromBrandId)) {
        return { type: 'assign_active' };
      }
      return { type: 'prompt_move', fromBrandId };
    }
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
  const nextIds = new Set(params.nextAccounts.map((a) => a.id));
  const map: Record<string, string> = {};
  for (const [id, brandId] of Object.entries(params.prevMap)) {
    if (nextIds.has(id)) map[id] = brandId;
  }
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
    /** When true, only assign this account. Never demote other platform rows. */
    assignOnly?: boolean;
  }
): Record<string, string> {
  const next = { ...prev, [accountId]: activeBrandId };
  if (options?.assignOnly) return next;
  const platform =
    options?.platform?.toUpperCase() ??
    options?.allAccounts?.find((a) => a.id === accountId)?.platform?.toUpperCase();
  if (!platform || !options?.allAccounts?.length) return next;
  for (const [id, brandId] of Object.entries(next)) {
    if (brandId !== activeBrandId || id === accountId) continue;
    const other = options.allAccounts.find((a) => a.id === id);
    if (other?.platform.toUpperCase() !== platform) continue;
    // Keep any row that was already mapped to another brand workspace.
    const prevBrand = prev[id] ?? DEFAULT_BRAND_ID;
    if (prevBrand !== activeBrandId) continue;
    next[id] = DEFAULT_BRAND_ID;
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

export type PostConnectOAuthUrlParams = {
  accountId: string;
  platform: string | null;
};

/** OAuth return params from the dashboard URL (connecting=1). */
export function readPostConnectOAuthFromUrl(search?: string): PostConnectOAuthUrlParams | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(search ?? window.location.search);
    if (params.get('connecting') !== '1') return null;
    const accountId = params.get('accountId');
    if (!accountId) return null;
    const platform = params.get('newPlatform');
    return { accountId, platform: platform ? platform.toUpperCase() : null };
  } catch {
    return null;
  }
}

/** True when URL post-connect params match the account row we just connected. */
export function postConnectUrlMatchesAccount(
  urlParams: PostConnectOAuthUrlParams | null,
  account: { id: string; platform: string }
): boolean {
  if (!urlParams) return false;
  if (urlParams.accountId !== account.id) return false;
  if (urlParams.platform && urlParams.platform !== account.platform.toUpperCase()) return false;
  return true;
}

/**
 * Strip OAuth post-connect query params.
 * Use dropConnectingOnly while the brand-move modal is open so accountId stays in the URL.
 */
export function clearPostConnectOAuthUrlParams(options?: { dropConnectingOnly?: boolean }): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const hadOAuthParams =
      url.searchParams.get('connecting') === '1' ||
      url.searchParams.has('accountId') ||
      url.searchParams.has('newPlatform');
    if (!hadOAuthParams) return;
    url.searchParams.delete('connecting');
    if (!options?.dropConnectingOnly) {
      url.searchParams.delete('accountId');
      url.searchParams.delete('newPlatform');
      url.searchParams.delete('newUsername');
      url.searchParams.delete('newPic');
    }
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // ignore
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
