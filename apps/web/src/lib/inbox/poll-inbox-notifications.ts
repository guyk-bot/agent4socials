/**
 * Systematic inbox sync (AppDataContext timer). Updates nav badge + in-memory cache.
 * Does not run when the user opens Inbox; the Inbox UI reads this cache only.
 */
import api from '@/lib/api';
import type { CachedComment, CachedConversation } from '@/context/AppDataContext';
import { INBOX_SYSTEM_SYNC_MS } from '@/lib/inbox/inbox-sync-config';
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
import { mergeInboxSenderRows } from '@/lib/inbox/merge-inbox-lists';
import {
  shouldAllowInboxListSync,
  shouldAllowMinimalProfileEnrichment,
  shouldBlockMetaNonEssentialCalls,
} from '@/lib/meta-usage-guard';

/** @deprecated Use INBOX_SYSTEM_SYNC_MS */
export const INBOX_NOTIFICATION_POLL_MS = INBOX_SYSTEM_SYNC_MS;

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
    senders: mergeInboxSenderRows(prev?.senders, incoming.senders),
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
    // Only flag as unread when truly newly-arrived: updatedTime must be within 2× the poll
    // interval. If the conversation is old (cache miss after a page refresh wiped sessionStorage),
    // treating it as unread would produce a spurious badge on every refresh.
    const RECENT_THRESHOLD_MS = 2 * 120_000; // 4 min — 2× the 2-min poll cadence
    const updatedMs = next.updatedTime ? Date.parse(next.updatedTime) : 0;
    const isRecent = updatedMs > 0 && Date.now() - updatedMs < RECENT_THRESHOLD_MS;
    if (isRecent && getInboxInitializedAccountIdsForConversations(userId).has(accountId)) {
      addPendingUnreadConversationIds([conversationId], userId, platform);
      unmarkConversationAsRead(conversationId, userId);
      // Ensure isConversationUnread returns true so the badge isn't immediately
      // cleared by computeInboxHeaderUnread. If lastRead >= messageCount the
      // unread check short-circuits to false, so pull lastRead back by one.
      const mc = next.messageCount;
      if (typeof mc === 'number' && mc > 0) {
        const existingRead = getConversationLastReadCounts(userId)[conversationId];
        if (existingRead === undefined || existingRead >= mc) {
          setConversationLastReadCount(conversationId, mc - 1, userId);
        }
      }
      // If seenAt equals updatedTime the timestamp check also short-circuits.
      // Keep seenAt one second before updatedTime so the conversation is unread.
      if (next.updatedTime) {
        const seenBefore = new Date(updatedMs - 1000).toISOString();
        setConversationLastSeenUpdated(conversationId, seenBefore, userId);
      }
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

/** Scheduled inbox sync: conversations (light Meta list) + comment deltas. */
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
  const listSyncAllowed = shouldAllowInboxListSync();
  const minimalEnrich = shouldAllowMinimalProfileEnrichment();
  const metaBlocked = shouldBlockMetaNonEssentialCalls();

  for (const acc of accounts) {
    if (acc.platform === 'TIKTOK' || acc.platform === 'YOUTUBE' || acc.platform === 'PINTEREST' || acc.platform === 'LINKEDIN') {
      continue;
    }
    if (MESSAGE_PLATFORMS.has(acc.platform)) {
      try {
        const existing = getConversations(acc.id) ?? [];
        const convParams = new URLSearchParams();
        if (listSyncAllowed) {
          convParams.set('badgePoll', '1');
          if (minimalEnrich) convParams.set('minimalEnrich', '1');
        } else {
          convParams.set('cacheOnly', '1');
        }
        const res = await api.get<{ conversations?: CachedConversation[]; error?: string }>(
          `/social/accounts/${acc.id}/conversations?${convParams.toString()}`,
          { timeout: listSyncAllowed ? 90_000 : 30_000 }
        );
        if (res.data?.error) continue;
        const incoming = res.data?.conversations ?? [];
        if (incoming.length === 0 && existing.length === 0) continue;
        onConversations(acc.id, mergeConversations(existing, incoming, userId, acc.id, acc.platform));
      } catch {
        /* skip account */
      }
      await new Promise((r) => setTimeout(r, 800));
    }

    // Comments are loaded by Inbox UI + DB cache only (avoids empty Meta throttle wiping the list).
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
