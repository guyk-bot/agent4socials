import {
  getConversationLastReadCounts,
  getConversationLastSeenUpdated,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  getReadConversationIds,
} from '@/lib/inbox-read-state';
import {
  getPendingUnreadCommentIds,
  getPendingUnreadCommentPlatforms,
  getPendingUnreadConversationIds,
  getPendingUnreadConversationPlatforms,
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
  /** Outbound comments you wrote should not inflate the badge. */
  isFromMe?: boolean;
};

export type InboxHeaderUnread = {
  inbox: number;
  messages: number;
  comments: number;
  byPlatform: Record<string, { comments: number; messages: number }>;
};

function isConversationUnread(
  c: InboxUnreadConversation,
  readConversations: Set<string>,
  lastRead: Record<string, number>,
  lastSeenUpdated: Record<string, string>,
  initializedConvAccounts: Set<string>
): boolean {
  const seenAt = lastSeenUpdated[c.id];
  if (c.updatedTime && seenAt && c.updatedTime.localeCompare(seenAt) > 0) {
    return true;
  }

  const hasCount = typeof c.messageCount === 'number';
  const read = lastRead[c.id];
  const markedRead = readConversations.has(c.id);

  if (markedRead) {
    if (hasCount) return c.messageCount! > (read ?? 0);
    return false;
  }

  if (hasCount) {
    if (read === undefined) {
      const accId = c.messageAccountId;
      if (accId && initializedConvAccounts.has(accId)) {
        if (c.messageCount! > 0) return true;
      }
      return true;
    }
    if (c.messageCount! > read) return true;
    return false;
  }

  const accId = c.messageAccountId;
  if (accId && !initializedConvAccounts.has(accId)) {
    return false;
  }

  return true;
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

  const unreadConvIds = new Set<string>();
  const convPlatformById = new Map<string, string | undefined>();

  for (const c of conversations) {
    convPlatformById.set(c.id, c.platform);
    if (isConversationUnread(c, readConversations, lastRead, lastSeenUpdated, initializedConvAccounts)) {
      unreadConvIds.add(c.id);
    }
  }

  for (const id of getPendingUnreadConversationIds(userId)) {
    unreadConvIds.add(id);
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
 * Nav badge must not drop on partial poll/cache merges. Only accept a lower count
 * after the user marks items read (readStateVersion bump).
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
    return computed;
  }

  const inbox = Math.max(stableRef.inbox, computed.inbox);
  const messages = Math.max(stableRef.messages, computed.messages);
  const comments = Math.max(stableRef.comments, computed.comments);

  if (inbox === computed.inbox && messages === computed.messages && comments === computed.comments) {
    stableRef.inbox = inbox;
    stableRef.messages = messages;
    stableRef.comments = comments;
    return computed;
  }

  stableRef.inbox = inbox;
  stableRef.messages = messages;
  stableRef.comments = comments;
  return { ...computed, inbox, messages, comments };
}
