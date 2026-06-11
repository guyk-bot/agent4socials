/** Client-side inbox list cache so the UI does not flicker when AppData sync runs. */

import { prefetchInboxPostMediaBatch } from '@/lib/inbox/inbox-post-media-prefetch';

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

export function writeInboxCommentsClientCache<T extends { accountId?: string; platformPostId?: string; platform?: string; postImageUrl?: string | null }>(
  userId: string,
  rows: T[]
): void {
  if (typeof sessionStorage === 'undefined' || !userId || rows.length === 0) return;
  try {
    sessionStorage.setItem(commentsKey(userId), JSON.stringify(rows.slice(0, 500)));
    prefetchInboxPostMediaBatch(
      rows
        .filter((r) => r.accountId && r.platformPostId && r.platform)
        .map((r) => ({
          accountId: r.accountId!,
          platformPostId: r.platformPostId!,
          platform: r.platform!,
          postImageUrl: r.postImageUrl,
        }))
    );
  } catch {
    /* quota */
  }
}

/** Synchronous hydrate for first paint (avoids empty inbox after navigation). */
export function hydrateInboxCommentsFromClientCache<T>(userId: string | undefined): T[] {
  if (!userId) return readLatestInboxCommentsClientCache<T>();
  return readInboxCommentsClientCache<T>(userId);
}

/** Best-effort read when auth user id is not ready on first client paint. */
export function readLatestInboxCommentsClientCache<T>(): T[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    let best: T[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key?.startsWith('agent4socials_inbox_ui_comments_')) continue;
      const rows = readInboxCommentsClientCache<T>(key.replace('agent4socials_inbox_ui_comments_', ''));
      if (rows.length > best.length) best = rows;
    }
    return best;
  } catch {
    return [];
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
