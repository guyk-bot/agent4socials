/** Session key: full-page redirect after user resolves the brand-move modal (e.g. Facebook page picker). */
export const PENDING_CONNECT_REDIRECT_KEY = 'agent4socials_pending_connect_redirect_v1';

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
    if (params.get('connecting') !== '1') return null;
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
