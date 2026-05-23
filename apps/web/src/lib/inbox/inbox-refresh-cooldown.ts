/** Client-side cooldowns so Inbox does not hammer Meta on every tab switch or poll tick. */

export const INBOX_THREADS_LIVE_REFRESH_MS = 5 * 60_000;
export const INBOX_LIGHT_META_SYNC_MS = 10 * 60_000;

function storageKey(scope: string, userId: string): string {
  return `agent4socials_inbox_live_${scope}_${userId}`;
}

export function canRunInboxLiveRefresh(scope: string, userId: string, cooldownMs: number): boolean {
  if (typeof sessionStorage === 'undefined') return true;
  try {
    const raw = sessionStorage.getItem(storageKey(scope, userId));
    if (!raw) return true;
    const last = Number(raw);
    if (!Number.isFinite(last)) return true;
    return Date.now() - last >= cooldownMs;
  } catch {
    return true;
  }
}

export function markInboxLiveRefresh(scope: string, userId: string): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(storageKey(scope, userId), String(Date.now()));
  } catch {
    /* ignore */
  }
}
