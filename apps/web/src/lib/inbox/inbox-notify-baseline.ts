/**
 * Per-account timestamp: only comments created after this count as "new" inbox notifications.
 * Set when an account is first synced in Inbox or right after OAuth connect.
 */

const KEY_PREFIX = 'agent4socials_inbox_notify_since_';

function storageKey(userId: string, accountId: string): string {
  return `${KEY_PREFIX}${userId}_${accountId}`;
}

export function setInboxNotifyBaseline(
  accountId: string,
  userId: string,
  atMs: number = Date.now()
): void {
  if (typeof window === 'undefined' || !accountId || !userId) return;
  try {
    localStorage.setItem(storageKey(userId, accountId), String(atMs));
  } catch {
    /* ignore */
  }
}

export function getInboxNotifyBaseline(accountId: string, userId: string): number | null {
  if (typeof window === 'undefined' || !accountId || !userId) return null;
  try {
    const raw = localStorage.getItem(storageKey(userId, accountId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** True when a top-level comment should surface as unread (badge + row dot). */
export function shouldNotifyInboxComment(
  comment: { accountId?: string; createdAt?: string },
  userId: string
): boolean {
  const accountId = comment.accountId;
  if (!accountId || !userId) return false;
  const baseline = getInboxNotifyBaseline(accountId, userId);
  if (baseline == null) return false;
  const created = comment.createdAt ? new Date(comment.createdAt).getTime() : NaN;
  if (!Number.isFinite(created)) return false;
  // Small clock skew buffer (30s) so a just-arrived comment is not dropped.
  return created > baseline - 30_000;
}
