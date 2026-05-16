import type { Platform } from '@prisma/client';
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
export type ConversationUiMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
};

const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

const IG_MESSAGE_FETCH_LIMIT = 12;
const IG_MESSAGE_BATCH_SIZE = 4;

type IgMessageRow = {
  id: string;
  created_time?: string;
  from?: { id?: string; username?: string; name?: string };
  message?: string;
  error?: { message?: string; code?: number };
};

async function resolveLinkedPageId(userId: string, accessToken: string): Promise<string | null> {
  try {
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', accessToken },
      select: { platformUserId: true },
    });
    return fb?.platformUserId ?? null;
  } catch {
    return null;
  }
}

function mapRows(
  rows: IgMessageRow[],
  ourIds: Set<string>
): ConversationUiMessage[] {
  return rows
    .filter((m) => m.id && !m.error)
    .map((m) => ({
      id: m.id,
      fromId: m.from?.id ?? null,
      fromName: m.from?.username ?? m.from?.name ?? null,
      message: m.message ?? '',
      createdTime: m.created_time ?? null,
      isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
    }))
    .sort((a, b) => {
      const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return tA - tB;
    });
}

async function fetchIgMessageDetails(
  messageIds: string[],
  accessToken: string
): Promise<IgMessageRow[]> {
  const out: IgMessageRow[] = [];
  const ids = messageIds.slice(0, IG_MESSAGE_FETCH_LIMIT);
  for (let i = 0; i < ids.length; i += IG_MESSAGE_BATCH_SIZE) {
    const chunk = ids.slice(i, i + IG_MESSAGE_BATCH_SIZE);
    const batch = await Promise.all(
      chunk.map((msgId) =>
        axios
          .get<IgMessageRow>(`${igBaseUrl}/${msgId}`, {
            params: { fields: 'id,created_time,from,to,message', access_token: accessToken },
            timeout: 12_000,
          })
          .then((r) => r.data)
          .catch(() => null)
      )
    );
    for (const m of batch) {
      if (m && !m.error) out.push(m);
    }
  }
  return out;
}

/** Instagram Business Login: list message ids, then hydrate recent messages (reliable on graph.instagram.com). */
export async function loadInstagramBusinessConversationMessages(
  conversationId: string,
  accessToken: string,
  ourIds: Set<string>
): Promise<{ messages: ConversationUiMessage[]; error?: string }> {
  try {
    const convoRes = await axios.get<{
      messages?: { data?: Array<{ id: string }> };
      error?: { message?: string };
    }>(`${igBaseUrl}/${conversationId}`, {
      params: { fields: 'messages', access_token: accessToken },
      timeout: 15_000,
    });
    if (convoRes.data?.error) {
      return { messages: [], error: convoRes.data.error.message ?? 'Could not load messages.' };
    }
    const messageIds = (convoRes.data?.messages?.data ?? []).map((m) => m.id).filter(Boolean);
    if (messageIds.length === 0) return { messages: [] };
    const rows = await fetchIgMessageDetails(messageIds, accessToken);
    return { messages: mapRows(rows, ourIds) };
  } catch (e) {
    const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
    const msg =
      err?.response?.data?.error?.message ?? err?.message ?? 'Could not load Instagram messages.';
    console.error('[inbox] Instagram business messages failed:', msg);
    return { messages: [], error: msg };
  }
}

/** Facebook Graph (Page token): single request for thread messages; required for IG DMs via linked Page. */
export async function loadFacebookGraphConversationMessages(
  conversationId: string,
  accessToken: string,
  ourIds: Set<string>,
  platform?: Platform
): Promise<{ messages: ConversationUiMessage[]; error?: string }> {
  try {
    const params: Record<string, string> = {
      fields: 'id,from,to,message,created_time',
      access_token: accessToken,
    };
    if (platform === 'INSTAGRAM') params.platform = 'instagram';

    const res = await axios.get<{
      data?: IgMessageRow[];
      error?: { message: string };
    }>(`${fbBaseUrl}/${conversationId}/messages`, {
      params,
      timeout: 30_000,
    });

    if (res.data?.error) {
      return { messages: [], error: res.data.error.message };
    }

    const list = mapRows(res.data?.data ?? [], ourIds);
    return { messages: list };
  } catch (e) {
    const err = e as { response?: { data?: { error?: { message?: string } } }; message?: string };
    const msg =
      err?.response?.data?.error?.message ?? err?.message ?? 'Could not load conversation messages.';
    console.error('[inbox] Facebook Graph messages failed:', msg);
    return { messages: [], error: msg };
  }
}

export async function loadInstagramConversationMessages(args: {
  userId: string;
  account: { platform: Platform; platformUserId: string; accessToken: string; credentialsJson: unknown };
  conversationId: string;
  isInstagramBusinessLogin: boolean;
}): Promise<{ messages: ConversationUiMessage[]; error?: string }> {
  const { userId, account, conversationId, isInstagramBusinessLogin } = args;
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson
    : {}) as { linkedPageId?: string };
  const token = account.accessToken || '';
  const ourIds = new Set<string>(
    [account.platformUserId, credJson.linkedPageId].filter((x): x is string => !!x)
  );

  if (isInstagramBusinessLogin) {
    return loadInstagramBusinessConversationMessages(conversationId, token, ourIds);
  }

  let linkedPageId = credJson.linkedPageId ?? null;
  if (!linkedPageId && token) {
    linkedPageId = await resolveLinkedPageId(userId, token);
  }

  if (linkedPageId) {
    const viaPage = await loadFacebookGraphConversationMessages(
      conversationId,
      token,
      ourIds,
      'INSTAGRAM'
    );
    if (viaPage.messages.length > 0 || viaPage.error) return viaPage;
  }

  return loadFacebookGraphConversationMessages(conversationId, token, ourIds, 'INSTAGRAM');
}
