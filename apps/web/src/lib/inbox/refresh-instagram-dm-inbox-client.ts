/**
 * Client-only: load Instagram DMs for Inbox Messages tab (single API call).
 */
import api from '@/lib/api';

export type InboxDmConversation = {
  id: string;
  updatedTime: string | null;
  senders: Array<{
    id?: string;
    name?: string;
    username?: string;
    pictureUrl?: string | null;
  }>;
  messageCount?: number;
};

export type RefreshInstagramDmResult = {
  conversations: InboxDmConversation[];
  instagramAccountId?: string;
  error?: string;
  emptyHint?: string;
};

/** Fast list only; server enriches senders in after(). */
const CLIENT_TIMEOUT_MS = 32_000;

function parseResponse(data: {
  conversations?: InboxDmConversation[];
  instagramAccountId?: string;
  error?: string;
  emptyHint?: string;
}): RefreshInstagramDmResult {
  const conversations = data.conversations ?? [];
  const error =
    typeof data.error === 'string' && data.error.trim() && conversations.length === 0
      ? data.error.trim()
      : undefined;
  return {
    conversations,
    instagramAccountId: data.instagramAccountId,
    error,
    emptyHint: data.emptyHint,
  };
}

/** Silent background refresh: never surfaces timeout errors to the UI. */
export async function refreshInstagramDmInboxLive(): Promise<RefreshInstagramDmResult> {
  try {
    const res = await api.get<{
      conversations?: InboxDmConversation[];
      instagramAccountId?: string;
      error?: string;
      emptyHint?: string;
    }>('/inbox/instagram-dms', {
      params: { fresh: 1 },
      timeout: CLIENT_TIMEOUT_MS,
    });
    return parseResponse(res.data ?? {});
  } catch (err: unknown) {
    const data = (err as { response?: { data?: { error?: string; emptyHint?: string; conversations?: InboxDmConversation[]; instagramAccountId?: string } } })
      ?.response?.data;
    if (data) return parseResponse(data);
    return { conversations: [] };
  }
}
