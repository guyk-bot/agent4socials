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

  const hasMessageCount = conversations.some((c) => typeof c.messageCount === 'number');
  let messages = 0;
  if (hasMessageCount) {
    for (const c of conversations) {
      const count = c.messageCount ?? 0;
      const read = lastRead[c.id];
      if (read === undefined) {
        const accId = c.messageAccountId;
        if (accId && initializedConvAccounts.has(accId)) {
          messages += count;
          continue;
        }
      }
      messages += Math.max(0, count - (read ?? 0));
    }
  } else {
    messages = conversations.filter((c) => !readConversations.has(c.id)).length;
  }

  const comments = commentIds.filter((id) => !readComments.has(id)).length;
  const inbox = Math.min(messages + comments, 99);
  return { inbox, messages: Math.min(messages, 99), comments: Math.min(comments, 99) };
}
