/**
 * Sticky unread IDs for the nav Inbox badge. Once a new DM or comment is detected,
 * it stays in the badge count until the user opens Inbox and reads it (not when
 * a stale cache overwrites conversation data).
 */

const KEY_CONV = 'agent4socials_badge_pending_conv';
const KEY_COMMENT = 'agent4socials_badge_pending_comment';
const KEY_CONV_PLATFORM = 'agent4socials_badge_pending_conv_platform';
const KEY_COMMENT_PLATFORM = 'agent4socials_badge_pending_comment_platform';

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

function loadPlatformMap(key: string): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [id, platform] of Object.entries(parsed)) {
      if (typeof id === 'string' && typeof platform === 'string' && platform) {
        out[id] = platform;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function savePlatformMap(key: string, map: Record<string, string>): void {
  if (typeof window === 'undefined') return;
  try {
    const entries = Object.entries(map).slice(-500);
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}

function setPlatformsForIds(
  platformKey: string,
  ids: Iterable<string>,
  platform?: string
): void {
  if (!platform) return;
  const map = loadPlatformMap(platformKey);
  let changed = false;
  for (const id of ids) {
    if (id && map[id] !== platform) {
      map[id] = platform;
      changed = true;
    }
  }
  if (changed) savePlatformMap(platformKey, map);
}

function removePlatformsForIds(platformKey: string, ids: Iterable<string>): void {
  const map = loadPlatformMap(platformKey);
  let changed = false;
  for (const id of ids) {
    if (map[id] && delete map[id]) changed = true;
  }
  if (changed) savePlatformMap(platformKey, map);
}

export function getPendingUnreadConversationIds(userId: string): Set<string> {
  return loadSet(storageKey(KEY_CONV, userId));
}

export function getPendingUnreadConversationPlatforms(userId: string): Record<string, string> {
  return loadPlatformMap(storageKey(KEY_CONV_PLATFORM, userId));
}

export function addPendingUnreadConversationIds(
  ids: Iterable<string>,
  userId: string,
  platform?: string
): void {
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
  setPlatformsForIds(storageKey(KEY_CONV_PLATFORM, userId), ids, platform);
}

export function removePendingUnreadConversationIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_CONV, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (set.delete(id)) changed = true;
  }
  if (changed) saveSet(key, set);
  removePlatformsForIds(storageKey(KEY_CONV_PLATFORM, userId), ids);
}

export function getPendingUnreadCommentIds(userId: string): Set<string> {
  return loadSet(storageKey(KEY_COMMENT, userId));
}

export function getPendingUnreadCommentPlatforms(userId: string): Record<string, string> {
  return loadPlatformMap(storageKey(KEY_COMMENT_PLATFORM, userId));
}

export function addPendingUnreadCommentIds(
  ids: Iterable<string>,
  userId: string,
  platform?: string
): void {
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
  setPlatformsForIds(storageKey(KEY_COMMENT_PLATFORM, userId), ids, platform);
}

export function removePendingUnreadCommentIds(ids: Iterable<string>, userId: string): void {
  const key = storageKey(KEY_COMMENT, userId);
  const set = loadSet(key);
  let changed = false;
  for (const id of ids) {
    if (set.delete(id)) changed = true;
  }
  if (changed) saveSet(key, set);
  removePlatformsForIds(storageKey(KEY_COMMENT_PLATFORM, userId), ids);
}
