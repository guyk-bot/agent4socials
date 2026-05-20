import {
  getConversationLastReadCounts,
  getConversationLastSeenUpdated,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  getReadConversationIds,
} from '@/lib/inbox-read-state';
import {
  getPendingUnreadCommentIds,
  getPendingUnreadConversationIds,
  removePendingUnreadCommentIds,
  removePendingUnreadConversationIds,
} from '@/lib/inbox/inbox-badge-pending';

export type InboxUnreadConversation = {
  id: string;
  messageCount?: number;
  messageAccountId?: string;
  updatedTime?: string | null;
};

function isConversationUnread(
  c: InboxUnreadConversation,
  hasMessageCount: boolean,
  readConversations: Set<string>,
  lastRead: Record<string, number>,
  lastSeenUpdated: Record<string, string>,
  initializedConvAccounts: Set<string>
): boolean {
  const seenAt = lastSeenUpdated[c.id];
  if (c.updatedTime && seenAt && c.updatedTime.localeCompare(seenAt) > 0) {
    return true;
  }

  if (hasMessageCount) {
    const count = c.messageCount;
    const read = lastRead[c.id];
    if (read === undefined) {
      const accId = c.messageAccountId;
      if (accId && initializedConvAccounts.has(accId)) {
        if (typeof count === 'number' && count > 0) return true;
        if (!readConversations.has(c.id)) return true;
      }
    }
    if (typeof count === 'number' && count > (read ?? 0)) return true;
    if (!readConversations.has(c.id)) return true;
    return false;
  }

  return !readConversations.has(c.id);
}

/** Unread DM threads + comment count for header badge (client-only, uses localStorage). */
export function computeInboxHeaderUnread(
  conversations: InboxUnreadConversation[],
  commentIds: string[],
  userId?: string | null
): { inbox: number; messages: number; comments: number } {
  if (!userId) {
    return { inbox: 0, messages: 0, comments: 0 };
  }

  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const readComments = getReadCommentIds(userId);

  const hasMessageCount = conversations.some((c) => typeof c.messageCount === 'number');
  const unreadConvIds = new Set<string>();

  for (const c of conversations) {
    if (isConversationUnread(c, hasMessageCount, readConversations, lastRead, lastSeenUpdated, initializedConvAccounts)) {
      unreadConvIds.add(c.id);
    }
  }

  const pendingConv = getPendingUnreadConversationIds(userId);
  for (const id of pendingConv) {
    unreadConvIds.add(id);
  }

  for (const id of pendingConv) {
    const c = conversations.find((x) => x.id === id);
    if (
      c &&
      !isConversationUnread(c, hasMessageCount, readConversations, lastRead, lastSeenUpdated, initializedConvAccounts)
    ) {
      removePendingUnreadConversationIds([id], userId);
      unreadConvIds.delete(id);
    }
  }

  const unreadCommentIds = new Set<string>();
  for (const id of commentIds) {
    if (!readComments.has(id)) unreadCommentIds.add(id);
  }
  const pendingComments = getPendingUnreadCommentIds(userId);
  for (const id of pendingComments) {
    unreadCommentIds.add(id);
  }
  for (const id of pendingComments) {
    if (!commentIds.includes(id) || readComments.has(id)) {
      removePendingUnreadCommentIds([id], userId);
      unreadCommentIds.delete(id);
    }
  }

  const messages = Math.min(unreadConvIds.size, 99);
  const comments = Math.min(unreadCommentIds.size, 99);
  const inbox = Math.min(messages + comments, 99);
  return { inbox, messages, comments };
}
