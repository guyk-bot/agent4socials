import { setInboxNotifyBaseline } from '@/lib/inbox/inbox-notify-baseline';

/** Show Inbox "please wait" hints shortly after a platform connect. */
const KEY_PREFIX = 'agent4socials_inbox_recent_connect.';
export const INBOX_RECENT_CONNECT_WINDOW_MS = 10 * 60 * 1000;

function storageKey(accountId: string): string {
  return `${KEY_PREFIX}${accountId}`;
}

export function markInboxAccountRecentlyConnected(
  accountId: string,
  _platform?: string,
  userId?: string | null
): void {
  if (typeof window === 'undefined' || !accountId) return;
  const at = Date.now();
  try {
    sessionStorage.setItem(storageKey(accountId), String(at));
  } catch {
    /* ignore */
  }
  if (userId) setInboxNotifyBaseline(accountId, userId, at);
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
