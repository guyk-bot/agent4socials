import type { CachedComment, CachedConversation } from '@/context/AppDataContext';
import { notifyInboxReadStateChanged } from '@/lib/inbox-read-state';
import {
  mergeComments,
  mergeConversationLists,
  mergeConversations,
} from '@/lib/inbox/poll-inbox-notifications';

type ConversationRow = CachedConversation & { platform?: string; messageAccountId?: string };
type CommentRow = CachedComment & { platform?: string; accountId?: string };

function accountIdsFromRows<T extends { messageAccountId?: string }>(
  seed: T[],
  incoming: T[]
): Set<string> {
  const ids = new Set<string>();
  for (const c of seed) {
    if (c.messageAccountId) ids.add(c.messageAccountId);
  }
  for (const c of incoming) {
    if (c.messageAccountId) ids.add(c.messageAccountId);
  }
  return ids;
}

function accountIdsFromComments(seed: CommentRow[], incoming: CommentRow[]): Set<string> {
  const ids = new Set<string>();
  for (const c of seed) {
    if (c.accountId) ids.add(c.accountId);
  }
  for (const c of incoming) {
    if (c.accountId) ids.add(c.accountId);
  }
  return ids;
}

/** Merge DM lists per account and flag new activity (same rules as background poll). */
export function mergeInboxConversationsWithUnreadDetection(
  userId: string | undefined,
  seed: ConversationRow[],
  incoming: ConversationRow[]
): ConversationRow[] {
  const accountIds = accountIdsFromRows(seed, incoming);
  const out: ConversationRow[] = [];
  let didTouchReadState = false;

  for (const accId of accountIds) {
    const platform =
      incoming.find((c) => c.messageAccountId === accId)?.platform ??
      seed.find((c) => c.messageAccountId === accId)?.platform ??
      'UNKNOWN';
    const existing = seed.filter((c) => c.messageAccountId === accId);
    const inc = incoming.filter((c) => c.messageAccountId === accId);

    let merged: CachedConversation[];
    if (userId && inc.length > 0) {
      merged = mergeConversations(existing, inc, userId, accId, platform);
      didTouchReadState = true;
    } else if (inc.length > 0) {
      merged = mergeConversationLists(existing, inc);
    } else {
      merged = existing;
    }

    for (const c of merged) {
      out.push({ ...c, platform, messageAccountId: accId });
    }
  }

  if (userId && didTouchReadState) {
    notifyInboxReadStateChanged();
  }

  return out.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
}

/** Merge comment lists per account and flag new unread comments (same rules as background poll). */
export function mergeInboxCommentsWithUnreadDetection(
  userId: string | undefined,
  seed: CommentRow[],
  incoming: CommentRow[]
): CommentRow[] {
  const accountIds = accountIdsFromComments(seed, incoming);
  const out: CommentRow[] = [];
  let didTouchReadState = false;

  for (const accId of accountIds) {
    const platform =
      incoming.find((c) => c.accountId === accId)?.platform ??
      seed.find((c) => c.accountId === accId)?.platform ??
      'UNKNOWN';
    const existing = seed.filter((c) => c.accountId === accId);
    const inc = incoming.filter((c) => c.accountId === accId);

    let merged: CachedComment[];
    if (userId && inc.length > 0) {
      merged = mergeComments(existing, inc, userId, accId, platform);
      didTouchReadState = true;
    } else if (inc.length > 0) {
      const byId = new Map<string, CachedComment>();
      for (const c of existing) byId.set(c.commentId, c);
      for (const c of inc) byId.set(c.commentId, c);
      merged = [...byId.values()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    } else {
      merged = existing;
    }

    for (const c of merged) {
      out.push({ ...c, platform, accountId: accId });
    }
  }

  if (userId && didTouchReadState) {
    notifyInboxReadStateChanged();
  }

  return out.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}
