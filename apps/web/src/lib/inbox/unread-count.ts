import {
  getConversationLastReadCounts,
  getConversationLastSeenUpdated,
  getInboxInitializedAccountIdsForConversations,
  getReadCommentIds,
  getReadConversationIds,
} from '@/lib/inbox-read-state';

export type InboxUnreadConversation = {
  id: string;
  messageCount?: number;
  messageAccountId?: string;
};

/** Unread DM threads + comment count for header badge (client-only, uses localStorage). */
export function computeInboxHeaderUnread(
  conversations: InboxUnreadConversation[],
  commentIds: string[],
  userId?: string | null
): { inbox: number; messages: number; comments: number } {
  const readConversations = getReadConversationIds(userId);
  const lastRead = getConversationLastReadCounts(userId);
  const lastSeenUpdated = getConversationLastSeenUpdated(userId);
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const readComments = getReadCommentIds(userId);

  // Count unread CONVERSATIONS (not total unread messages) so the badge stays at a
  // human-readable number. A conversation is unread if it has more messages than the
  // last-read count stored in localStorage.
  const hasMessageCount = conversations.some((c) => typeof c.messageCount === 'number');
  let messages = 0;
  for (const c of conversations) {
    const seenAt = lastSeenUpdated[c.id];
    if (c.updatedTime && seenAt && c.updatedTime.localeCompare(seenAt) > 0) {
      messages += 1;
      continue;
    }

    if (hasMessageCount) {
      const count = c.messageCount;
      const read = lastRead[c.id];
      if (read === undefined) {
        const accId = c.messageAccountId;
        if (accId && initializedConvAccounts.has(accId)) {
          if (typeof count === 'number' && count > 0) {
            messages += 1;
            continue;
          }
          if (!readConversations.has(c.id)) {
            messages += 1;
            continue;
          }
        }
      }
      if (typeof count === 'number' && count > (read ?? 0)) {
        messages += 1;
        continue;
      }
      if (!readConversations.has(c.id)) {
        messages += 1;
      }
    } else if (!readConversations.has(c.id)) {
      messages += 1;
    }
  }

  const comments = commentIds.filter((id) => !readComments.has(id)).length;
  const inbox = Math.min(messages + comments, 99);
  return { inbox, messages: Math.min(messages, 99), comments: Math.min(comments, 99) };
}
