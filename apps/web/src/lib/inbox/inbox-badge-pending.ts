/**
 * Sticky unread IDs for the nav Inbox badge. Once a new DM or comment is detected,
 * it stays in the badge count until the user opens Inbox and reads it (not when
 * a stale cache overwrites conversation data).
 */

const KEY_CONV = 'agent4socials_badge_pending_conv';
const KEY_COMMENT = 'agent4socials_badge_pending_comment';

function storageKey(base: string, userId: string): string {
  return `${base}_${userId}`;
}

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify([...set].slice(-500)));
  } catch {
    /* ignore */
  }
}

export function getPendingUnreadConversationIds(userId: string): Set<string> {
  return loadSet(storageKey(KEY_CONV, userId));
}

export function addPendingUnreadConversationIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_CONV, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) saveSet(key, set);
}

export function removePendingUnreadConversationIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_CONV, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (set.delete(id)) changed = true;
  }
  if (changed) saveSet(key, set);
}

export function getPendingUnreadCommentIds(userId: string): Set<string> {
  return loadSet(storageKey(KEY_COMMENT, userId));
}

export function addPendingUnreadCommentIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_COMMENT, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (id && !set.has(id)) {
      set.add(id);
      changed = true;
    }
  }
  if (changed) saveSet(key, set);
}

export function removePendingUnreadCommentIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_COMMENT, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (set.delete(id)) changed = true;
  }
  if (changed) saveSet(key, set);
}
