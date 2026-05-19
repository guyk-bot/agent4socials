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

/**
 * Meta requires attachment/share sub-fields; requesting `attachments` alone often returns
 * empty `data` even when the DM has images, reels, or shares.
 * @see https://developers.facebook.com/docs/graph-api/reference/message
 */
export const META_INBOX_MESSAGE_FIELDS = [
  'id',
  'created_time',
  'from',
  'to',
  'message',
  'is_unsupported',
  'attachments{type,mime_type,name,image_data,video_data,file_url,payload}',
  'shares{data{name,description,type,url,link}}',
  'story',
  'reactions{data{reaction,users{id,username}}}',
].join(',');

/** Facebook Graph thread listing uses `created_time` (same sub-fields as single message). */
const FB_THREAD_MESSAGE_FIELDS = [
  'id',
  'from',
  'to',
  'message',
  'created_time',
  'is_unsupported',
  'attachments{type,mime_type,name,image_data,video_data,file_url,payload}',
  'shares{data{name,description,type,url,link}}',
  'story',
  'reactions{data{reaction,users{id,username}}}',
].join(',');

type IgAttachment = {
  type?: string;
  name?: string;
  mime_type?: string;
  file_url?: string;
  payload?: { url?: string };
  image_data?: { url?: string };
  video_data?: { url?: string };
};

type IgShareItem = {
  name?: string;
  description?: string;
  type?: string;
  url?: string;
  link?: string;
};

export type IgMessageRow = {
  id: string;
  created_time?: string;
  from?: { id?: string; username?: string; name?: string };
  message?: string;
  is_unsupported?: boolean;
  attachments?: { data?: IgAttachment[] };
  shares?: { data?: IgShareItem[] };
  story?: { link?: string; id?: string };
  reactions?: { data?: Array<{ reaction?: string; users?: Array<{ id?: string; username?: string }> }> };
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
  if (att.image_data) return '(Image)';
  if (att.video_data) return '(Video)';
  if (att.file_url) return att.name ? `(${att.name})` : '(File)';
  const t = (att.type ?? att.mime_type ?? '').toLowerCase();
  if (t.includes('sticker')) return '(Sticker)';
  if (t.includes('story_mention') || t.includes('story')) return '(Story mention)';
  if (t.includes('share')) return '(Share)';
  if (t.includes('audio') || t.includes('voice')) return '(Voice message)';
  if (t.includes('video')) return '(Video)';
  if (t.includes('image') || t.includes('photo')) return '(Image)';
  if (t.includes('gif')) return '(GIF)';
  if (att.payload?.url) return '(Link attachment)';
  if (att.name) return `(${att.name})`;
  return '(Attachment)';
}

function shareLabel(m: IgMessageRow): string {
  const share = m.shares?.data?.[0];
  if (!share) return '';
  const t = (share.type ?? '').toLowerCase();
  const title = (share.name ?? share.description ?? '').trim();
  if (t.includes('reel') || t === 'ig_reel') return title ? `(Shared reel: ${title})` : '(Shared reel)';
  if (t.includes('post') || t === 'ig_post') return title ? `(Shared post: ${title})` : '(Shared post)';
  if (share.url || share.link) return title ? `(Shared link: ${title})` : '(Shared link)';
  return title ? `(Share: ${title})` : '(Share)';
}

function storyLabel(m: IgMessageRow): string {
  if (!m.story?.id && !m.story?.link) return '';
  return '(Story reply)';
}

function reactionLabel(m: IgMessageRow): string {
  const items = m.reactions?.data ?? [];
  if (items.length === 0) return '';
  const emoji = items.map((r) => r.reaction).filter(Boolean).join(' ');
  return emoji ? `(Reaction ${emoji})` : '(Reaction)';
}

/** Build display text for inbox bubbles from a Meta message row. */
export function messageBodyFromRow(m: IgMessageRow): string {
  const text = (m.message ?? '').trim();
  if (text) return text;

  const parts = [attachmentLabel(m), shareLabel(m), storyLabel(m), reactionLabel(m)].filter(Boolean);
  if (m.is_unsupported) parts.push('(Unsupported message type)');
  if (parts.length > 0) return parts.join(' ');

  return '';
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
      message: messageBodyFromRow(m),
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
          params: { fields: META_INBOX_MESSAGE_FIELDS, access_token: accessToken },
          timeout: 8_000,
        });
        noteMetaUsageFromHeaders(r.headers);
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
      fields: FB_THREAD_MESSAGE_FIELDS,
      access_token: accessToken,
    };
    if (platform === 'INSTAGRAM') params.platform = 'instagram';

    const res = await axios.get<{
      data?: IgMessageRow[];
      error?: { message: string };
    }>(`${fbBaseUrl}/${conversationId}/messages`, {
      params,
      timeout: 12_000,
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
    return loadFacebookGraphConversationMessages(conversationId, token, ourIds, 'INSTAGRAM');
  }

  return loadFacebookGraphConversationMessages(conversationId, token, ourIds, 'INSTAGRAM');
}
