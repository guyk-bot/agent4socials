import type { Platform } from '@prisma/client';
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';
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

/** Max messages to hydrate per conversation open — keeps total time well under the 60s Vercel limit. */
const IG_MESSAGE_FETCH_LIMIT = 10;

type IgAttachment = {
  type?: string; // 'image', 'video', 'audio', 'file', 'sticker', 'share', 'story_mention', etc.
  name?: string;
  mime_type?: string;
  payload?: { url?: string };
};

type IgMessageRow = {
  id: string;
  created_time?: string;
  from?: { id?: string; username?: string; name?: string };
  message?: string;
  attachments?: { data?: IgAttachment[] };
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

/** Resolve a human-readable display string for a message that has no text (e.g. media, sticker). */
function attachmentLabel(m: IgMessageRow): string {
  const att = m.attachments?.data?.[0];
  if (!att) return '';
  const t = (att.type ?? att.mime_type ?? '').toLowerCase();
  if (t.includes('sticker')) return '(Sticker)';
  if (t.includes('story_mention') || t.includes('story')) return '(Story mention)';
  if (t.includes('share')) return '(Share)';
  if (t.includes('audio') || t.includes('voice')) return '(Voice message)';
  if (t.includes('video')) return '(Video)';
  if (t.includes('image') || t.includes('photo')) return '(Image)';
  if (t.includes('gif')) return '(GIF)';
  if (att.name) return `(${att.name})`;
  return '(Attachment)';
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
      message: m.message || attachmentLabel(m) || '',
      createdTime: m.created_time ?? null,
      isFromPage: !!(m.from?.id && ourIds.has(m.from.id)),
    }))
    .sort((a, b) => {
      const tA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
      const tB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
      return tA - tB;
    });
}

/**
 * Fetch individual Instagram message details in parallel.
 * Uses direct axios (not runMetaGraphRequest) because this is a critical, user-initiated
 * operation — blocking it with the non-critical throttle guard causes UI timeouts.
 * Still records x-app-usage so future non-critical calls are throttled if usage is high.
 */
async function fetchIgMessageDetails(
  messageIds: string[],
  accessToken: string
): Promise<IgMessageRow[]> {
  const ids = messageIds.slice(0, IG_MESSAGE_FETCH_LIMIT);
  const results = await Promise.all(
    ids.map(async (msgId): Promise<IgMessageRow | null> => {
      try {
        const r = await axios.get<IgMessageRow>(`${igBaseUrl}/${msgId}`, {
          params: { fields: 'id,created_time,from,to,message,attachments', access_token: accessToken },
          timeout: 8_000, // shorter per-message timeout — 10 in parallel = ~8s total max
        });
        noteMetaUsageFromHeaders(r.headers); // still track usage for throttle guard
        return r.data ?? null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((m): m is IgMessageRow => !!m && !m.error);
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
      timeout: 10_000,
    });
    noteMetaUsageFromHeaders(convoRes.headers);
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
      fields: 'id,from,to,message,created_time,attachments',
      access_token: accessToken,
    };
    if (platform === 'INSTAGRAM') params.platform = 'instagram';

    const res = await axios.get<{
      data?: IgMessageRow[];
      error?: { message: string };
    }>(`${fbBaseUrl}/${conversationId}/messages`, {
      params,
      timeout: 12_000, // reduced from 30s — prevents double-call from hitting the 60s function limit
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

  // If linkedPageId is resolved, use the Facebook Graph path (page token + platform=instagram).
  // Always return its result — even empty — to avoid making a second identical API call.
  // Two sequential 30s calls would hit the 60s Vercel function limit and cause client timeouts.
  if (linkedPageId) {
    return loadFacebookGraphConversationMessages(conversationId, token, ourIds, 'INSTAGRAM');
  }

  // No linked page found: try direct graph.facebook.com call without page context.
  return loadFacebookGraphConversationMessages(conversationId, token, ourIds, 'INSTAGRAM');
}
