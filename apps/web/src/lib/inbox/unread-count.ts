import {
  getConversationLastReadCounts,
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
  const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(userId);
  const readComments = getReadCommentIds(userId);

  // Count unread CONVERSATIONS (not total unread messages) so the badge stays at a
  // human-readable number. A conversation is unread if it has more messages than the
  // last-read count stored in localStorage.
  const hasMessageCount = conversations.some((c) => typeof c.messageCount === 'number');
  let messages = 0;
  if (hasMessageCount) {
    for (const c of conversations) {
      const count = c.messageCount ?? 0;
      const read = lastRead[c.id];
      if (read === undefined) {
        const accId = c.messageAccountId;
        // If account has been initialized but this conversation has no lastRead, treat as unread.
        if (accId && initializedConvAccounts.has(accId) && count > 0) {
          messages += 1;
          continue;
        }
      }
      if (count > (read ?? 0)) messages += 1;
    }
  } else {
    messages = conversations.filter((c) => !readConversations.has(c.id)).length;
  }

  const comments = commentIds.filter((id) => !readComments.has(id)).length;
  const inbox = Math.min(messages + comments, 99);
  return { inbox, messages: Math.min(messages, 99), comments: Math.min(comments, 99) };
}
