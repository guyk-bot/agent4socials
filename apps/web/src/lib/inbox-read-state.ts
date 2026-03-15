/**
 * Persist inbox read state in localStorage so refresh keeps read/unread.
 * Keys are scoped per user by optional userId to avoid cross-account leakage.
 */

const KEY_COMMENTS = 'agent4socials_read_comments';
const KEY_CONVERSATIONS = 'agent4socials_read_conversations';
const KEY_ENGAGEMENT = 'agent4socials_read_engagement';
const KEY_CONVERSATION_LAST_READ = 'agent4socials_conversation_last_read';
const MAX_STORED = 2000; // cap to avoid localStorage bloat

function getKey(base: string, userId?: string | null): string {
  if (userId) return `${base}_${userId}`;
  return base;
}

function loadSet(key: string): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === 'string').slice(-MAX_STORED));
  } catch {
    return new Set();
  }
}

function saveSet(key: string, set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    const arr = [...set].slice(-MAX_STORED);
    localStorage.setItem(key, JSON.stringify(arr));
  } catch {
    // ignore quota or parse errors
  }
}

export function getReadCommentIds(userId?: string | null): Set<string> {
  return loadSet(getKey(KEY_COMMENTS, userId));
}

export function getReadConversationIds(userId?: string | null): Set<string> {
  return loadSet(getKey(KEY_CONVERSATIONS, userId));
}

export function getReadEngagementIds(userId?: string | null): Set<string> {
  return loadSet(getKey(KEY_ENGAGEMENT, userId));
}

export function markCommentsAsRead(ids: Iterable<string>, userId?: string | null): void {
  const key = getKey(KEY_COMMENTS, userId);
  const set = loadSet(key);
  for (const id of ids) set.add(id);
  saveSet(key, set);
}

export function markConversationsAsRead(ids: Iterable<string>, userId?: string | null): void {
  const key = getKey(KEY_CONVERSATIONS, userId);
  const set = loadSet(key);
  for (const id of ids) set.add(id);
  saveSet(key, set);
}

export function markEngagementAsRead(ids: Iterable<string>, userId?: string | null): void {
  const key = getKey(KEY_ENGAGEMENT, userId);
  const set = loadSet(key);
  for (const id of ids) set.add(id);
  saveSet(key, set);
}

/** Last read message count per conversation id (for unread message badge). */
export function getConversationLastReadCounts(userId?: string | null): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const key = getKey(KEY_CONVERSATION_LAST_READ, userId);
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const obj = JSON.parse(raw) as unknown;
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
    return obj as Record<string, number>;
  } catch {
    return {};
  }
}

export function setConversationLastReadCount(conversationId: string, count: number, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const key = getKey(KEY_CONVERSATION_LAST_READ, userId);
    const prev = getConversationLastReadCounts(userId);
    if (count <= 0) {
      const next = { ...prev };
      delete next[conversationId];
      localStorage.setItem(key, JSON.stringify(next));
      return;
    }
    localStorage.setItem(key, JSON.stringify({ ...prev, [conversationId]: count }));
  } catch {
    // ignore
  }
}

const KEY_INBOX_INITIALIZED_ACCOUNTS = 'agent4socials_inbox_initialized_accounts';

/** Account IDs for which we've already marked "existing at first load" as read (so we only highlight new notifications after connection). */
export function getInboxInitializedAccountIds(userId?: string | null): Set<string> {
  return loadSet(getKey(KEY_INBOX_INITIALIZED_ACCOUNTS, userId));
}

export function addInboxInitializedAccount(accountId: string, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  const key = getKey(KEY_INBOX_INITIALIZED_ACCOUNTS, userId);
  const set = loadSet(key);
  set.add(accountId);
  saveSet(key, set);
}
