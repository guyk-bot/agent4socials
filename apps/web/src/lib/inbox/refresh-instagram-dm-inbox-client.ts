/**
 * Client-only: load Instagram DMs for Inbox Messages tab (no bootstrap, no comment sync).
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
  error?: string;
  emptyHint?: string;
};

const CLIENT_TIMEOUT_MS = 32_000;

function parseConvResponse(data: {
  conversations?: InboxDmConversation[];
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
  return { conversations, error, emptyHint: data.emptyHint };
}

/**
 * Live Instagram DM list: Instagram account row, then optional Page fallback.
 */
export async function refreshInstagramDmInboxLive(args: {
  instagramAccountId: string;
  facebookPageAccountId?: string | null;
}): Promise<RefreshInstagramDmResult> {
  const { instagramAccountId, facebookPageAccountId } = args;

  try {
    const primary = await api.get<{
      conversations?: InboxDmConversation[];
      error?: string;
      emptyHint?: string;
    }>(`/social/accounts/${instagramAccountId}/conversations?fresh=1`, {
      timeout: CLIENT_TIMEOUT_MS,
    });
    const parsed = parseConvResponse(primary.data ?? {});
    if (parsed.conversations.length > 0 || parsed.error) return parsed;

    if (facebookPageAccountId) {
      const pageRes = await api.get<{
        conversations?: InboxDmConversation[];
        error?: string;
        emptyHint?: string;
      }>(
        `/social/accounts/${facebookPageAccountId}/conversations?instagramOnly=1&fresh=1`,
        { timeout: CLIENT_TIMEOUT_MS }
      );
      return parseConvResponse(pageRes.data ?? {});
    }
    return parsed;
  } catch (err: unknown) {
    const data = (err as { response?: { data?: { error?: string; emptyHint?: string } } })?.response
      ?.data;
    if (data) return parseConvResponse(data);
    const isTimeout =
      (err as { code?: string })?.code === 'ECONNABORTED' ||
      /timeout/i.test((err as { message?: string })?.message ?? '');
    return {
      conversations: [],
      error: isTimeout
        ? 'Meta took too long to respond. Try Retry from Meta again in a moment, or reconnect via Facebook and choose your Page.'
        : 'Could not load Instagram messages. Try Retry from Meta or reconnect via Facebook.',
    };
  }
}
