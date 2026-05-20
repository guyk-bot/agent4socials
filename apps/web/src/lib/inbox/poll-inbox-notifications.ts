/**
 * Background inbox poll for nav badge counts (messages + comments).
 * Runs on an interval from AppDataContext while the user is logged in.
 */
import api from '@/lib/api';
import type { CachedComment, CachedConversation } from '@/context/AppDataContext';
import {
  addPendingUnreadCommentIds,
  addPendingUnreadConversationIds,
  removePendingUnreadCommentIds,
} from '@/lib/inbox/inbox-badge-pending';
import {
  addInboxInitializedAccount,
  addInboxInitializedAccountForConversations,
  getConversationLastReadCounts,
  getInboxInitializedAccountIds,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  markCommentsAsRead,
  markConversationsAsRead,
  setConversationLastReadCount,
  setConversationLastSeenUpdated,
  unmarkConversationAsRead,
} from '@/lib/inbox-read-state';

/** Poll every 60s so new items show within ~2 minutes without opening Inbox. */
export const INBOX_NOTIFICATION_POLL_MS = 60_000;

const MESSAGE_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);
const COMMENT_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);

const COMMENTS_SINCE_KEY = (userId: string) => `agent4socials_badge_poll_comments_since_${userId}`;

type AccountLite = { id: string; platform: string };

function pickNewerUpdatedTime(
  a: string | null | undefined,
  b: string | null | undefined
): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.localeCompare(b) >= 0 ? a : b;
}

function newestConversationUpdated(list: CachedConversation[]): string | undefined {
  return list
    .map((c) => c.updatedTime)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
}

/** Merge one row without wiping messageCount/platform (badgePoll omits counts). */
export function mergeCachedConversationRow(
  prev: CachedConversation | undefined,
  incoming: CachedConversation
): CachedConversation {
  return {
    ...prev,
    ...incoming,
    updatedTime: pickNewerUpdatedTime(prev?.updatedTime, incoming.updatedTime),
    messageCount: incoming.messageCount ?? prev?.messageCount,
    platform: incoming.platform ?? prev?.platform,
    senders: (incoming.senders ?? []).map((s, i) => ({
      ...s,
      pictureUrl: s.pictureUrl ?? prev?.senders?.[i]?.pictureUrl ?? null,
      name: s.name ?? prev?.senders?.[i]?.name,
      username: s.username ?? prev?.senders?.[i]?.username,
    })),
  };
}

/** Merge lists without dropping threads or regressing updatedTime (avoids badge flicker). */
export function mergeConversationLists(
  existing: CachedConversation[],
  incoming: CachedConversation[]
): CachedConversation[] {
  const byId = new Map<string, CachedConversation>();
  for (const c of existing) byId.set(c.id, c);
  for (const c of incoming) {
    const prev = byId.get(c.id);
    byId.set(c.id, mergeCachedConversationRow(prev, c));
  }
  return [...byId.values()].sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
}

function commentSinceForPoll(userId: string, existing: CachedComment[]): string | undefined {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(COMMENTS_SINCE_KEY(userId));
      if (stored) return stored;
    } catch {
      /* ignore */
    }
  }
  const newest = existing
    .map((c) => c.createdAt)
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
  return newest;
}

function markConversationActivity(
  conversationId: string,
  prev: CachedConversation | undefined,
  next: CachedConversation,
  userId: string,
  accountId: string,
  platform: string
): void {
  if (!prev) {
    if (getInboxInitializedAccountIdsForConversations(userId).has(accountId)) {
      addPendingUnreadConversationIds([conversationId], userId, platform);
      unmarkConversationAsRead(conversationId, userId);
    }
    return;
  }
  if (
    prev.updatedTime &&
    next.updatedTime &&
    next.updatedTime.localeCompare(prev.updatedTime) > 0
  ) {
    addPendingUnreadConversationIds([conversationId], userId, platform);
    unmarkConversationAsRead(conversationId, userId);
    const count = next.messageCount ?? prev.messageCount;
    if (typeof count === 'number' && count > 0) {
      const lastRead = getConversationLastReadCounts(userId)[conversationId] ?? count;
      setConversationLastReadCount(conversationId, Math.min(lastRead, count - 1), userId);
    }
    if (prev.updatedTime) {
      setConversationLastSeenUpdated(conversationId, prev.updatedTime, userId);
    }
  }
}

function mergeConversations(
  existing: CachedConversation[],
  incoming: CachedConversation[],
  userId: string,
  accountId: string,
  platform: string
): CachedConversation[] {
  const byId = new Map<string, CachedConversation>();
  for (const c of existing) byId.set(c.id, c);

  for (const c of incoming) {
    const prev = byId.get(c.id);
    const row = mergeCachedConversationRow(prev, c);
    markConversationActivity(c.id, prev, row, userId, accountId, platform);
    byId.set(c.id, row);
  }

  const merged = [...byId.values()].sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));

  const initialized = getInboxInitializedAccountIdsForConversations(userId);
  if (!initialized.has(accountId) && merged.length > 0) {
    markConversationsAsRead(merged.map((c) => c.id), userId);
    merged.forEach((c) => {
      if (typeof c.messageCount === 'number') {
        setConversationLastReadCount(c.id, c.messageCount, userId);
      }
      if (c.updatedTime) setConversationLastSeenUpdated(c.id, c.updatedTime, userId);
    });
    addInboxInitializedAccountForConversations(accountId, userId);
  }

  return merged;
}

function mergeComments(
  existing: CachedComment[],
  incoming: CachedComment[],
  userId: string,
  accountId: string,
  platform: string
): CachedComment[] {
  const byId = new Map<string, CachedComment>();
  for (const c of existing) byId.set(c.commentId, c);
  const readComments = getReadCommentIds(userId);
  for (const c of incoming) {
    const isNew = !byId.has(c.commentId);
    if (c.isFromMe && !c.parentCommentId) {
      removePendingUnreadCommentIds([c.commentId], userId);
    } else if (isNew && !c.parentCommentId && !readComments.has(c.commentId)) {
      addPendingUnreadCommentIds([c.commentId], userId, platform);
    }
    byId.set(c.commentId, c);
  }

  const merged = [...byId.values()].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

  const initialized = getInboxInitializedAccountIds(userId);
  if (!initialized.has(accountId) && merged.length > 0) {
    const topLevel = merged.filter((c) => !c.parentCommentId).map((c) => c.commentId);
    markCommentsAsRead(topLevel, userId);
    addInboxInitializedAccount(accountId, userId);
  }

  return merged;
}

export async function pollInboxNotifications(args: {
  accounts: AccountLite[];
  userId: string;
  getConversations: (accountId: string) => CachedConversation[] | undefined;
  getComments: (accountId: string) => CachedComment[] | undefined;
  onConversations: (accountId: string, list: CachedConversation[]) => void;
  onComments: (accountId: string, list: CachedComment[]) => void;
}): Promise<void> {
  const { accounts, userId, getConversations, getComments, onConversations, onComments } = args;

  const commentSinceStart = commentSinceForPoll(userId, accounts.flatMap((a) => getComments(a.id) ?? []));

  for (const acc of accounts) {
    if (MESSAGE_PLATFORMS.has(acc.platform)) {
      try {
        const existing = getConversations(acc.id) ?? [];
        // Always full list for badge poll. Delta with global "since" misses new messages in older threads.
        const res = await api.get<{ conversations?: CachedConversation[]; error?: string }>(
          `/social/accounts/${acc.id}/conversations?badgePoll=1`,
          { timeout: 90_000 }
        );
        if (res.data?.error) continue;
        const incoming = res.data?.conversations ?? [];
        if (incoming.length === 0 && existing.length === 0) continue;
        onConversations(acc.id, mergeConversations(existing, incoming, userId, acc.id, acc.platform));
      } catch {
        /* skip account */
      }
      await new Promise((r) => setTimeout(r, 350));
    }

    if (COMMENT_PLATFORMS.has(acc.platform)) {
      try {
        const existing = getComments(acc.id) ?? [];
        const params = new URLSearchParams();
        // Delta only when we already have comments in memory; otherwise fetch full list.
        if (commentSinceStart && existing.length > 0) {
          params.set('delta', '1');
          params.set('since', commentSinceStart);
        }
        const qs = params.toString();
        const res = await api.get<{ comments?: CachedComment[]; error?: string }>(
          `/social/accounts/${acc.id}/comments${qs ? `?${qs}` : ''}`,
          { timeout: 90_000 }
        );
        if (res.data?.error) continue;
        const incoming = res.data?.comments ?? [];
        if (incoming.length === 0 && existing.length > 0 && commentSinceStart) continue;
        const merged = incoming.length > 0 ? mergeComments(existing, incoming, userId, acc.id, acc.platform) : existing;
        if (incoming.length > 0 || existing.length === 0) {
          onComments(acc.id, merged);
        }
      } catch {
        /* skip account */
      }
      await new Promise((r) => setTimeout(r, 350));
    }
  }

  if (typeof sessionStorage !== 'undefined') {
    try {
      const overlap = new Date(Date.now() - 3 * 60_000).toISOString();
      sessionStorage.setItem(COMMENTS_SINCE_KEY(userId), overlap);
    } catch {
      /* ignore */
    }
  }
}
