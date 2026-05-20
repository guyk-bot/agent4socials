/** Client-side inbox list cache so the UI does not flicker when AppData sync runs. */

const commentsKey = (userId: string) => `agent4socials_inbox_ui_comments_${userId}`;
const conversationsKey = (userId: string) => `agent4socials_inbox_ui_conversations_${userId}`;

export function readInboxCommentsClientCache<T>(userId: string): T[] {
  if (typeof sessionStorage === 'undefined' || !userId) return [];
  try {
    const raw = sessionStorage.getItem(commentsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeInboxCommentsClientCache<T>(userId: string, rows: T[]): void {
  if (typeof sessionStorage === 'undefined' || !userId || rows.length === 0) return;
  try {
    sessionStorage.setItem(commentsKey(userId), JSON.stringify(rows.slice(0, 500)));
  } catch {
    /* quota */
  }
}

export function readInboxConversationsClientCache<T>(userId: string): T[] {
  if (typeof sessionStorage === 'undefined' || !userId) return [];
  try {
    const raw = sessionStorage.getItem(conversationsKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeInboxConversationsClientCache<T>(userId: string, rows: T[]): void {
  if (typeof sessionStorage === 'undefined' || !userId || rows.length === 0) return;
  try {
    sessionStorage.setItem(conversationsKey(userId), JSON.stringify(rows.slice(0, 300)));
  } catch {
    /* quota */
  }
}
