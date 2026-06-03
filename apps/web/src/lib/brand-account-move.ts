/** Session key: full-page redirect after user resolves the brand-move modal (e.g. Facebook page picker). */
export const PENDING_CONNECT_REDIRECT_KEY = 'agent4socials_pending_connect_redirect_v1';

/** Must match AccountsCacheContext ACCOUNT_BRAND_MAP_KEY. */
export const ACCOUNT_BRAND_MAP_KEY = 'agent4socials_account_brand_map_v1';

export const DEFAULT_BRAND_ID = 'brand-default';

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
