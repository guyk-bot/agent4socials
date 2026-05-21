import {
  getConversationLastReadCounts,
  getConversationLastSeenUpdated,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  getReadConversationIds,
  markConversationsAsRead,
  setConversationLastSeenUpdated,
} from '@/lib/inbox-read-state';
import {
  addPendingUnreadCommentIds,
  addPendingUnreadConversationIds,
  getPendingUnreadCommentIds,
  getPendingUnreadCommentPlatforms,
  getPendingUnreadConversationIds,
  getPendingUnreadConversationPlatforms,
  removePendingUnreadCommentIds,
  removePendingUnreadConversationIds,
} from '@/lib/inbox/inbox-badge-pending';
import { notifyInboxReadStateChanged } from '@/lib/inbox-read-state';

export type InboxUnreadConversation = {
  id: string;
  messageCount?: number;
  messageAccountId?: string;
  updatedTime?: string | null;
  platform?: string;
};

export type InboxUnreadComment = {
  commentId: string;
  platform?: string;
  /** Outbound comments you wrote should not inflate the badge. */
  isFromMe?: boolean;
};

export type InboxHeaderUnread = {
  inbox: number;
  messages: number;
  comments: number;
  byPlatform: Record<string, { comments: number; messages: number }>;
};

const BADGE_SNAPSHOT_PREFIX = 'agent4socials_badge_snapshot_v1_';

/** Resolve user id from localStorage inbox keys so the badge can hydrate before auth finishes. */
export function extractInboxBadgeUserIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  const prefixes = [
    'agent4socials_badge_pending_conv_',
    'agent4socials_badge_pending_comment_',
    BADGE_SNAPSHOT_PREFIX,
    'agent4socials_read_conversations_',
  ];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      for (const p of prefixes) {
        if (key.startsWith(p)) {
          const id = key.slice(p.length);
          if (id.length > 0) return id;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function readInboxBadgeSnapshot(userId: string): InboxHeaderUnread | null {
  if (typeof window === 'undefined' || !userId) return null;
  try {
    const raw = localStorage.getItem(`${BADGE_SNAPSHOT_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as InboxHeaderUnread;
    if (typeof parsed.inbox !== 'number') return null;
    return {
      inbox: parsed.inbox,
      messages: typeof parsed.messages === 'number' ? parsed.messages : 0,
      comments: typeof parsed.comments === 'number' ? parsed.comments : 0,
      byPlatform:
        parsed.byPlatform && typeof parsed.byPlatform === 'object' ? parsed.byPlatform : {},
    };
  } catch {
    return null;
  }
}

export function writeInboxBadgeSnapshot(userId: string, unread: InboxHeaderUnread): void {
  if (typeof window === 'undefined' || !userId || unread.inbox <= 0) return;
  try {
    localStorage.setItem(`${BADGE_SNAPSHOT_PREFIX}${userId}`, JSON.stringify(unread));
  } catch {
    /* ignore */
  }
}

export function clearInboxBadgeSnapshot(userId: string): void {
  if (typeof window === 'undefined' || !userId) return;
  try {
    localStorage.removeItem(`${BADGE_SNAPSHOT_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}

/** Persist sticky pending IDs for anything that should show in the badge (survives refresh). */
export function ensurePendingIdsForUnreadCounts(
  conversations: InboxUnreadConversation[],
  comments: InboxUnreadComment[],
  userId: string
): void {
  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const pendingConv = getPendingUnreadConversationIds(userId);

  for (const c of conversations) {
    if (
      !pendingConv.has(c.id) &&
      isConversationUnread(
        c,
        readConversations,
        lastRead,
        lastSeenUpdated,
        initializedConvAccounts
      )
    ) {
      addPendingUnreadConversationIds([c.id], userId, c.platform);
    }
  }

  const readComments = getReadCommentIds(userId);
  const pendingComments = getPendingUnreadCommentIds(userId);
  for (const c of comments) {
    if (!c.commentId || c.isFromMe) continue;
    if (!readComments.has(c.commentId) && !pendingComments.has(c.commentId)) {
      addPendingUnreadCommentIds([c.commentId], userId, c.platform);
    }
  }
}

/** Keep the last non-zero badge across refresh until the user clears it by reading. */
export function mergeInboxBadgeWithSnapshot(
  computed: InboxHeaderUnread,
  userId: string
): InboxHeaderUnread {
  const snapshot = readInboxBadgeSnapshot(userId);
  if (!snapshot || snapshot.inbox <= 0) return computed;
  const inbox = Math.max(computed.inbox, snapshot.inbox);
  const messages = Math.max(computed.messages, snapshot.messages);
  const comments = Math.max(computed.comments, snapshot.comments);
  const byPlatform = { ...snapshot.byPlatform, ...computed.byPlatform };
  return { inbox, messages, comments, byPlatform };
}

/** Whether a DM thread should count as unread (nav badge + inbox row highlight). */
export function isConversationUnread(
  c: InboxUnreadConversation,
  readConversations: Set<string>,
  lastRead: Record<string, number>,
  lastSeenUpdated: Record<string, string>,
  initializedConvAccounts: Set<string>
): boolean {
  const markedRead = readConversations.has(c.id);
  const hasCount = typeof c.messageCount === 'number';
  const read = lastRead[c.id];
  const seenAt = lastSeenUpdated[c.id];

  if (hasCount && c.messageCount! <= (read ?? 0)) {
    return false;
  }

  if (markedRead) {
    if (hasCount) return c.messageCount! > (read ?? 0);
    if (c.updatedTime && seenAt && c.updatedTime.localeCompare(seenAt) > 0) {
      return true;
    }
    return false;
  }

  if (c.updatedTime && seenAt && c.updatedTime.localeCompare(seenAt) > 0) {
    return true;
  }

  if (hasCount) {
    if (read === undefined) {
      const accId = c.messageAccountId;
      if (accId && initializedConvAccounts.has(accId)) {
        return c.messageCount! > 0;
      }
      return true;
    }
    return c.messageCount! > read;
  }

  const accId = c.messageAccountId;
  if (accId && !initializedConvAccounts.has(accId)) {
    return false;
  }

  return false;
}

/**
 * When the inbox list is fully loaded, clear stale pending badge IDs and sync
 * last-seen timestamps so the nav badge matches visible rows.
 */
export function reconcileInboxReadStateWithConversations(
  conversations: InboxUnreadConversation[],
  userId: string
): boolean {
  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const convById = new Map(conversations.map((c) => [c.id, c]));

  // Do not prune pending-unread IDs here — they are only cleared by
  // pruneStalePendingUnread (conversation no longer in list) or by the
  // inbox UI when the user opens the thread.

  const pendingIds = getPendingUnreadConversationIds(userId);
  const syncSeen: Array<{ id: string; updatedTime: string }> = [];
  const markRead: string[] = [];
  for (const c of conversations) {
    // Skip conversations that are explicitly pending-unread — they should
    // stay unread until the user opens them.
    if (pendingIds.has(c.id)) continue;
    const unread = isConversationUnread(
      c,
      readConversations,
      lastRead,
      lastSeenUpdated,
      initializedConvAccounts
    );
    if (!unread && c.updatedTime) {
      syncSeen.push({ id: c.id, updatedTime: c.updatedTime });
      if (!readConversations.has(c.id)) markRead.push(c.id);
    }
  }

  let changed = false;
  if (markRead.length) {
    markConversationsAsRead(markRead, userId);
    changed = true;
  }
  for (const { id, updatedTime } of syncSeen) {
    const prev = lastSeenUpdated[id];
    if (!prev || updatedTime.localeCompare(prev) > 0) {
      setConversationLastSeenUpdated(id, updatedTime, userId);
      changed = true;
    }
  }
  if (changed) notifyInboxReadStateChanged();
  return changed;
}

function bumpPlatform(
  byPlatform: Record<string, { comments: number; messages: number }>,
  platform: string | undefined,
  kind: 'messages' | 'comments'
): void {
  const key = platform && platform.length > 0 ? platform : 'UNKNOWN';
  if (!byPlatform[key]) byPlatform[key] = { comments: 0, messages: 0 };
  byPlatform[key][kind] += 1;
}

/**
 * Drop pending badge IDs that no longer exist in the loaded inbox lists (stale poll/cache).
 * Returns true if anything was removed.
 */
export function pruneStalePendingUnread(
  userId: string,
  conversationIds: Iterable<string>,
  commentIds: Iterable<string>
): boolean {
  const convSet = new Set(conversationIds);
  const commentSet = new Set(commentIds);
  const staleConv = [...getPendingUnreadConversationIds(userId)].filter((id) => !convSet.has(id));
  const staleComments = [...getPendingUnreadCommentIds(userId)].filter((id) => !commentSet.has(id));
  if (staleConv.length) removePendingUnreadConversationIds(staleConv, userId);
  if (staleComments.length) removePendingUnreadCommentIds(staleComments, userId);
  if (staleConv.length || staleComments.length) {
    notifyInboxReadStateChanged();
    return true;
  }
  return false;
}

/** Unread DM threads + comment count for header badge (client-only, uses localStorage). */
export function computeInboxHeaderUnread(
  conversations: InboxUnreadConversation[],
  comments: InboxUnreadComment[],
  userId?: string | null
): InboxHeaderUnread {
  const empty: InboxHeaderUnread = { inbox: 0, messages: 0, comments: 0, byPlatform: {} };
  if (!userId) return empty;

  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const readComments = getReadCommentIds(userId);
  const pendingConvPlatforms = getPendingUnreadConversationPlatforms(userId);
  const pendingCommentPlatforms = getPendingUnreadCommentPlatforms(userId);

  const convIds = new Set(conversations.map((c) => c.id));
  const unreadConvIds = new Set<string>();
  const convPlatformById = new Map<string, string | undefined>();

  for (const c of conversations) {
    convPlatformById.set(c.id, c.platform);
    if (isConversationUnread(c, readConversations, lastRead, lastSeenUpdated, initializedConvAccounts)) {
      unreadConvIds.add(c.id);
    }
  }

  const convById = new Map(conversations.map((c) => [c.id, c]));
  // Sticky pending IDs: always count toward the badge even when the thread is not
  // in the in-memory list yet (partial cache, poll in flight, or account not loaded).
  // Cleared only when the user opens the thread in Inbox or prune after a full load.
  for (const id of getPendingUnreadConversationIds(userId)) {
    unreadConvIds.add(id);
    if (!convPlatformById.has(id)) {
      convPlatformById.set(id, pendingConvPlatforms[id]);
    }
  }

  const unreadCommentIds = new Set<string>();
  const commentPlatformById = new Map<string, string | undefined>();
  for (const c of comments) {
    if (!c.commentId || c.isFromMe) continue;
    commentPlatformById.set(c.commentId, c.platform);
    if (!readComments.has(c.commentId)) unreadCommentIds.add(c.commentId);
  }
  for (const id of getPendingUnreadCommentIds(userId)) {
    unreadCommentIds.add(id);
    if (!commentPlatformById.has(id)) {
      commentPlatformById.set(id, pendingCommentPlatforms[id]);
    }
  }

  const byPlatform: Record<string, { comments: number; messages: number }> = {};
  for (const id of unreadConvIds) {
    bumpPlatform(byPlatform, convPlatformById.get(id) ?? pendingConvPlatforms[id], 'messages');
  }
  for (const id of unreadCommentIds) {
    bumpPlatform(byPlatform, commentPlatformById.get(id) ?? pendingCommentPlatforms[id], 'comments');
  }

  const messages = Math.min(unreadConvIds.size, 99);
  const commentsCount = Math.min(unreadCommentIds.size, 99);
  const inbox = Math.min(messages + commentsCount, 99);
  return { inbox, messages, comments: commentsCount, byPlatform };
}

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TWITTER: 'X (Twitter)',
  YOUTUBE: 'YouTube',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
  TIKTOK: 'TikTok',
  UNKNOWN: 'Inbox',
};

/** Tooltip for the nav Inbox badge. */
export function formatInboxBadgeTitle(unread: InboxHeaderUnread): string | undefined {
  if (unread.inbox <= 0) return undefined;
  const parts: string[] = [`${unread.inbox} unread`];
  const breakdown = Object.entries(unread.byPlatform)
    .filter(([, v]) => (v.messages ?? 0) + (v.comments ?? 0) > 0)
    .map(([platform, v]) => {
      const label = PLATFORM_LABELS[platform] ?? platform;
      const bits: string[] = [];
      if (v.messages > 0) bits.push(`${v.messages} message${v.messages === 1 ? '' : 's'}`);
      if (v.comments > 0) bits.push(`${v.comments} comment${v.comments === 1 ? '' : 's'}`);
      return `${label}: ${bits.join(', ')}`;
    });
  if (breakdown.length > 0) parts.push(breakdown.join(' · '));
  return parts.join(' — ');
}

/**
 * Nav badge: reset only when read state changes (user opened a thread / marked read).
 * While read state is unchanged, never let the count drop — partial cache merges
 * and poll timing used to make the badge flash on/off every few seconds.
 */
export function stabilizeInboxHeaderUnread(
  computed: InboxHeaderUnread,
  readStateVersion: number,
  stableRef: { version: number; inbox: number; messages: number; comments: number }
): InboxHeaderUnread {
  if (readStateVersion !== stableRef.version) {
    stableRef.version = readStateVersion;
    stableRef.inbox = computed.inbox;
    stableRef.messages = computed.messages;
    stableRef.comments = computed.comments;
    // User opened/read something — allow badge to clear; do not restore snapshot.
    return computed;
  }

  const inbox = Math.max(stableRef.inbox, computed.inbox);
  const messages = Math.max(stableRef.messages, computed.messages);
  const comments = Math.max(stableRef.comments, computed.comments);
  stableRef.inbox = inbox;
  stableRef.messages = messages;
  stableRef.comments = comments;
  return { ...computed, inbox, messages, comments };
}
