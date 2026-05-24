import {
  getConversationLastReadCounts,
  getConversationLastSeenUpdated,
  getInboxInitializedAccountIds,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  getReadConversationIds,
  markConversationsAsRead,
  notifyInboxReadStateChanged,
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
  accountId?: string;
  /** Outbound comments you wrote should not inflate the badge. */
  isFromMe?: boolean;
  parentCommentId?: string | null;
};

/** Whether a top-level comment should count as unread (nav badge + inbox row). */
export function isCommentUnread(
  c: InboxUnreadComment,
  readComments: Set<string>,
  initializedCommentAccounts: Set<string>
): boolean {
  if (!c.commentId || c.isFromMe || c.parentCommentId) return false;
  if (readComments.has(c.commentId)) return false;
  const accId = c.accountId;
  // Historical inbox load: do not flash every cached comment as "new" before first sync.
  if (accId && !initializedCommentAccounts.has(accId)) return false;
  // After init, badge counts only sticky pending IDs (set when mergeComments sees a new arrival).
  return false;
}

/** Unread top-level comments from persisted read state + sticky pending (survives refresh). */
export function deriveUnreadTopLevelCommentIds(
  userId: string,
  topLevel: InboxUnreadComment[]
): Set<string> {
  const readSet = getReadCommentIds(userId);
  const pending = getPendingUnreadCommentIds(userId);
  const initialized = getInboxInitializedAccountIds(userId);
  const unread = new Set<string>();
  for (const c of topLevel) {
    if (!c.commentId || c.isFromMe) continue;
    if (pending.has(c.commentId)) {
      unread.add(c.commentId);
      continue;
    }
    if (isCommentUnread(c, readSet, initialized)) unread.add(c.commentId);
  }
  return unread;
}

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

  // Comment pending IDs are set only when mergeComments detects a new arrival (not on bulk load).
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

/** Drop stale pending IDs and realign nav badge with loaded inbox lists. */
export function syncInboxNavBadgeWithLoadedLists(
  userId: string,
  conversations: InboxUnreadConversation[],
  comments: InboxUnreadComment[]
): InboxHeaderUnread {
  if (typeof window === 'undefined' || !userId) {
    return { inbox: 0, messages: 0, comments: 0, byPlatform: {} };
  }

  const readComments = getReadCommentIds(userId);
  const stalePendingComments = [...getPendingUnreadCommentIds(userId)].filter((id) =>
    readComments.has(id)
  );
  if (stalePendingComments.length) removePendingUnreadCommentIds(stalePendingComments, userId);

  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const convById = new Map(conversations.map((c) => [c.id, c]));
  const stalePendingConv = [...getPendingUnreadConversationIds(userId)].filter((id) => {
    if (readConversations.has(id)) return true;
    const row = convById.get(id);
    if (!row) return false;
    return !isConversationUnread(
      row,
      readConversations,
      lastRead,
      lastSeenUpdated,
      initializedConvAccounts
    );
  });
  if (stalePendingConv.length) removePendingUnreadConversationIds(stalePendingConv, userId);

  pruneStalePendingUnread(
    userId,
    conversations.map((c) => c.id),
    comments.filter((c) => !c.parentCommentId).map((c) => c.commentId)
  );

  const computed = computeInboxHeaderUnread(conversations, comments, userId);
  if (computed.inbox > 0) {
    writeInboxBadgeSnapshot(userId, computed);
  } else {
    clearInboxBadgeSnapshot(userId);
  }
  notifyInboxReadStateChanged();
  return computed;
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
    markConversationsAsRead(markRead, userId, { silent: true });
    changed = true;
  }
  for (const { id, updatedTime } of syncSeen) {
    const prev = lastSeenUpdated[id];
    if (!prev || updatedTime.localeCompare(prev) > 0) {
      setConversationLastSeenUpdated(id, updatedTime, userId);
      changed = true;
    }
  }
  // Background sync only — do not bump the nav badge (avoids flicker).
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
  // Sticky pending IDs: count toward badge only when not already marked read in localStorage.
  for (const id of getPendingUnreadConversationIds(userId)) {
    if (readConversations.has(id)) continue;
    const row = convById.get(id);
    if (
      row &&
      !isConversationUnread(row, readConversations, lastRead, lastSeenUpdated, initializedConvAccounts)
    ) {
      continue;
    }
    unreadConvIds.add(id);
    if (!convPlatformById.has(id)) {
      convPlatformById.set(id, pendingConvPlatforms[id]);
    }
  }

  const unreadCommentIds = new Set<string>();
  const commentPlatformById = new Map<string, string | undefined>();
  for (const c of comments) {
    if (!c.commentId || c.isFromMe || c.parentCommentId) continue;
    commentPlatformById.set(c.commentId, c.platform);
  }
  for (const id of getPendingUnreadCommentIds(userId)) {
    if (readComments.has(id)) continue;
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
  THREADS: 'Threads',
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
 * Nav badge floor: keep sticky pending IDs visible until the user opens the thread.
 * Snapshot is applied only before inbox lists hydrate (see AppDataContext), not here.
 */
export function getStickyNavInboxBadge(
  userId: string,
  computed: InboxHeaderUnread
): InboxHeaderUnread {
  const pendingMsg = getPendingUnreadConversationIds(userId).size;
  const pendingCmt = getPendingUnreadCommentIds(userId).size;
  const pendingInbox = Math.min(pendingMsg + pendingCmt, 99);
  const inbox = Math.max(computed.inbox, pendingInbox);
  const messages = Math.max(computed.messages, pendingMsg);
  const comments = Math.max(computed.comments, pendingCmt);
  return { ...computed, inbox, messages, comments };
}
