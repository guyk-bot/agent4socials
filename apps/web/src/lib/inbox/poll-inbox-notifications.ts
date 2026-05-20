/**
 * Background inbox poll for nav badge counts (messages + comments).
 * Runs on an interval from AppDataContext while the user is logged in.
 */
import api from '@/lib/api';
import type { CachedComment, CachedConversation } from '@/context/AppDataContext';
import {
  addInboxInitializedAccount,
  addInboxInitializedAccountForConversations,
  getConversationLastReadCounts,
  getInboxInitializedAccountIds,
  getInboxInitializedAccountIdsForConversations,
  markCommentsAsRead,
  markConversationsAsRead,
  setConversationLastReadCount,
  unmarkConversationAsRead,
} from '@/lib/inbox-read-state';

/** Poll every 90s so new items show within ~2 minutes without opening Inbox. */
export const INBOX_NOTIFICATION_POLL_MS = 90_000;

const MESSAGE_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);
const COMMENT_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);

type AccountLite = { id: string; platform: string };

function newestIso(
  items: Array<{ updatedTime?: string | null } | { createdAt?: string }>,
  field: 'updatedTime' | 'createdAt'
): string | undefined {
  return items
    .map((i) => (field === 'updatedTime' ? (i as { updatedTime?: string | null }).updatedTime : (i as { createdAt?: string }).createdAt))
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .sort((a, b) => b.localeCompare(a))[0];
}

function mergeConversations(
  existing: CachedConversation[],
  incoming: CachedConversation[],
  userId: string,
  accountId: string
): CachedConversation[] {
  const byId = new Map<string, CachedConversation>();
  for (const c of existing) byId.set(c.id, c);

  for (const c of incoming) {
    const prev = byId.get(c.id);
    if (
      prev?.updatedTime &&
      c.updatedTime &&
      c.updatedTime.localeCompare(prev.updatedTime) > 0
    ) {
      unmarkConversationAsRead(c.id, userId);
      const count = c.messageCount ?? prev.messageCount;
      if (typeof count === 'number' && count > 0) {
        const lastRead = getConversationLastReadCounts(userId)[c.id] ?? count;
        setConversationLastReadCount(c.id, Math.min(lastRead, count - 1), userId);
      }
    }
    byId.set(c.id, {
      ...prev,
      ...c,
      senders: (c.senders ?? []).map((s, i) => ({
        ...s,
        pictureUrl: s.pictureUrl ?? prev?.senders?.[i]?.pictureUrl ?? null,
        name: s.name ?? prev?.senders?.[i]?.name,
        username: s.username ?? prev?.senders?.[i]?.username,
      })),
    });
  }

  const merged = [...byId.values()].sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));

  const initialized = getInboxInitializedAccountIdsForConversations(userId);
  if (!initialized.has(accountId) && merged.length > 0) {
    markConversationsAsRead(merged.map((c) => c.id), userId);
    merged.forEach((c) => {
      if (typeof c.messageCount === 'number') setConversationLastReadCount(c.id, c.messageCount, userId);
    });
    addInboxInitializedAccountForConversations(accountId, userId);
  }

  return merged;
}

function mergeComments(
  existing: CachedComment[],
  incoming: CachedComment[],
  userId: string,
  accountId: string
): CachedComment[] {
  const byId = new Map<string, CachedComment>();
  for (const c of existing) byId.set(c.commentId, c);
  for (const c of incoming) byId.set(c.commentId, c);

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

  for (const acc of accounts) {
    if (MESSAGE_PLATFORMS.has(acc.platform)) {
      try {
        const existing = getConversations(acc.id) ?? [];
        const since = newestIso(existing, 'updatedTime');
        const params = new URLSearchParams({ badgePoll: '1' });
        if (since && existing.length > 0) {
          params.set('delta', '1');
          params.set('since', since);
        }
        const res = await api.get<{ conversations?: CachedConversation[]; error?: string }>(
          `/social/accounts/${acc.id}/conversations?${params.toString()}`,
          { timeout: 60_000 }
        );
        if (res.data?.error) continue;
        const incoming = res.data?.conversations ?? [];
        if (incoming.length === 0) continue;
        onConversations(acc.id, mergeConversations(existing, incoming, userId, acc.id));
      } catch {
        /* skip account */
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    if (COMMENT_PLATFORMS.has(acc.platform)) {
      try {
        const existing = getComments(acc.id) ?? [];
        const since = newestIso(existing, 'createdAt');
        const params = new URLSearchParams();
        if (since && existing.length > 0) {
          params.set('delta', '1');
          params.set('since', since);
        }
        const qs = params.toString();
        const res = await api.get<{ comments?: CachedComment[]; error?: string }>(
          `/social/accounts/${acc.id}/comments${qs ? `?${qs}` : ''}`,
          { timeout: 60_000 }
        );
        if (res.data?.error) continue;
        const incoming = res.data?.comments ?? [];
        if (incoming.length === 0 && since) continue;
        const merged = mergeComments(existing, incoming, userId, acc.id);
        onComments(acc.id, merged);
      } catch {
        /* skip account */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  }
}
