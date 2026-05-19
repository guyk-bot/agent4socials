/** Show Inbox "please wait" hints shortly after Instagram/Facebook connect. */
const KEY_PREFIX = 'agent4socials_inbox_recent_connect.';
export const INBOX_RECENT_CONNECT_WINDOW_MS = 10 * 60 * 1000;

function storageKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

export function markInboxAccountRecentlyConnected(accountId: string, platform?: string): void {
  if (typeof window === 'undefined' || !accountId) return;
  const p = (platform ?? '').toUpperCase();
  if (p && p !== 'INSTAGRAM' && p !== 'FACEBOOK') return;
  try {
    sessionStorage.setItem(storageKey(accountId), String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function isInboxAccountRecentlyConnected(accountId: string): boolean {
  if (typeof window === 'undefined' || !accountId) return false;
  try {
    const raw = sessionStorage.getItem(storageKey(accountId));
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    if (Date.now() - at > INBOX_RECENT_CONNECT_WINDOW_MS) {
      sessionStorage.removeItem(storageKey(accountId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearInboxAccountRecentlyConnected(accountId: string): void {
  if (typeof window === 'undefined' || !accountId) return;
  try {
    sessionStorage.removeItem(storageKey(accountId));
  } catch {
    /* ignore */
  }
}
