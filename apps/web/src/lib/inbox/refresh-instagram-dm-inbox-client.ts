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

/** Must stay below Vercel route maxDuration (60s). */
const CLIENT_TIMEOUT_MS = 58_000;

function parseResponse(data: {
  conversations?: InboxDmConversation[];
  instagramAccountId?: string;
  error?: string;
  emptyHint?: string;
}): RefreshInstagramDmResult {
  const conversations = data.conversations ?? [];
  const error =
    typeof data.error === 'string' && data.error.trim()
      ? data.error.trim()
      : typeof data.emptyHint === 'string' && data.emptyHint.trim() && conversations.length === 0
        ? data.emptyHint.trim()
        : undefined;
  return {
    conversations,
    instagramAccountId: data.instagramAccountId,
    error,
    emptyHint: data.emptyHint,
  };
}

/** Live Instagram DM list: one request, server tries Page token then fallbacks. */
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
    if (data?.conversations?.length || data?.error || data?.emptyHint) {
      return parseResponse(data);
    }
    const isTimeout =
      (err as { code?: string })?.code === 'ECONNABORTED' ||
      /timeout/i.test((err as { message?: string })?.message ?? '');
    return {
      conversations: [],
      error: isTimeout
        ? 'Request timed out before Meta finished. Tap Retry from Meta once more. If it keeps failing, reconnect via Facebook and choose your Page.'
        : 'Could not load Instagram messages. Try Retry from Meta or reconnect via Facebook.',
    };
  }
}
