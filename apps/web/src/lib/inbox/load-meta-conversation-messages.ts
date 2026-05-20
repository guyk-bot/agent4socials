import type { Platform } from '@prisma/client';
import axios from 'axios';
import { prisma } from '@/lib/db';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { noteMetaUsageFromHeaders } from '@/lib/meta-usage-guard';
export type InboxMessageMedia = {
  kind: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'share' | 'story';
  url?: string | null;
  title?: string | null;
};

export type InboxMessageReaction = {
  reaction: string;
  username?: string | null;
};

export type ConversationUiMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
  media?: InboxMessageMedia[];
  reactions?: InboxMessageReaction[];
};

const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = 'https://graph.instagram.com/v25.0';

/** Max messages per Instagram Business thread (nested fields or per-id hydration). */
const IG_MESSAGE_FETCH_LIMIT = 20;

/**
 * Meta requires attachment/share sub-fields; requesting `attachments` alone often returns
 * empty `data` even when the DM has images, reels, or shares.
 * @see https://developers.facebook.com/docs/graph-api/reference/message
 */
const META_ATTACHMENT_SUBFIELDS =
  'attachments{type,mime_type,name,image_data{url,render_as_sticker,preview_url,animated_gif_url,media_url},video_data{url,preview_url},file_url,payload{url}}';
const META_SHARE_SUBFIELDS = 'shares{data{id,name,description,type,url,link,template}}';

export const META_INBOX_MESSAGE_FIELDS = [
  'id',
  'created_time',
  'from',
  'to',
  'message',
  'is_unsupported',
  META_ATTACHMENT_SUBFIELDS,
  META_SHARE_SUBFIELDS,
  'story',
  'reactions{data{reaction,users{id,username}}}',
].join(',');

/** Nested message fields on conversation edge (one round-trip vs N+1 per message). */
const IG_CONVERSATION_MESSAGES_FIELDS = `messages.limit(${IG_MESSAGE_FETCH_LIMIT}){${META_INBOX_MESSAGE_FIELDS}}`;

/** Facebook Graph thread listing uses `created_time` (same sub-fields as single message). */
const FB_THREAD_MESSAGE_FIELDS = [
  'id',
  'from',
  'to',
  'message',
  'created_time',
  'is_unsupported',
  META_ATTACHMENT_SUBFIELDS,
  META_SHARE_SUBFIELDS,
  'story',
  'reactions{data{reaction,users{id,username}}}',
].join(',');

type IgImageData = {
  url?: string;
  render_as_sticker?: boolean;
  preview_url?: string;
  animated_gif_url?: string;
  media_url?: string;
};

type IgVideoData = {
  url?: string;
  preview_url?: string;
};

type IgAttachment = {
  type?: string;
  name?: string;
  mime_type?: string;
  file_url?: string;
  payload?: { url?: string };
  image_data?: IgImageData;
  video_data?: IgVideoData;
};

type IgShareItem = {
  id?: string;
  name?: string;
  description?: string;
  type?: string;
  url?: string;
  link?: string;
  template?: unknown;
};

/** Meta image_data can expose sticker CDN URLs on several keys (see Graph API Message reference). */
export function imageUrlFromImageData(img?: IgImageData | null): string | null {
  if (!img) return null;
  return img.url ?? img.preview_url ?? img.animated_gif_url ?? img.media_url ?? null;
}

function findHttpImageUrlInObject(obj: unknown, depth = 0): string | null {
  if (!obj || depth > 8) return null;
  if (typeof obj === 'string' && /^https?:\/\//i.test(obj)) {
    const path = obj.split('?')[0] ?? '';
    if (/\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(path) || /fbcdn|cdninstagram/i.test(obj)) return obj;
  }
  if (typeof obj === 'object') {
    const record = obj as Record<string, unknown>;
    for (const key of [
      'image_url',
      'url',
      'preview_url',
      'media_url',
      'animated_gif_url',
      'animated_gif_preview_url',
    ]) {
      const v = record[key];
      if (typeof v === 'string' && v.startsWith('https://')) return v;
    }
    for (const v of Object.values(record)) {
      const found = findHttpImageUrlInObject(v, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function classifyShareItem(share: IgShareItem): InboxMessageMedia {
  const t = (share.type ?? '').toLowerCase();
  const title = (share.name ?? share.description ?? '').trim() || null;
  const url = share.url ?? share.link ?? findHttpImageUrlInObject(share.template) ?? null;

  if (t.includes('sticker') || t === 'like_heart' || t === 'like') {
    return { kind: 'sticker', url, title };
  }
  if (t.includes('reel') || t === 'ig_reel') {
    return { kind: 'share', url, title };
  }
  if (t.includes('post') || t === 'ig_post') {
    return { kind: 'share', url, title };
  }
  // FB Messenger stickers often appear as nameless share rows with no URL until hydrated.
  if (!url && !title && (!t || t === 'fallback' || t === 'template')) {
    return { kind: 'sticker', url: null, title: null };
  }
  return { kind: 'share', url, title };
}

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
  if (att.image_data?.render_as_sticker || (att.type ?? '').toLowerCase().includes('sticker')) {
    return imageUrlFromImageData(att.image_data) ? '' : '(Sticker)';
  }
  if (imageUrlFromImageData(att.image_data)) return '';
  if (att.video_data?.url || att.video_data?.preview_url) return '';
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
  const labels: string[] = [];
  for (const share of m.shares?.data ?? []) {
    const item = classifyShareItem(share);
    if (item.kind === 'sticker') {
      if (!item.url) labels.push('(Sticker)');
      continue;
    }
    const t = (share.type ?? '').toLowerCase();
    const title = (share.name ?? share.description ?? '').trim();
    if (t.includes('reel') || t === 'ig_reel') labels.push(title ? `(Shared reel: ${title})` : '(Shared reel)');
    else if (t.includes('post') || t === 'ig_post')
      labels.push(title ? `(Shared post: ${title})` : '(Shared post)');
    else if (share.url || share.link)
      labels.push(title ? `(Shared link: ${title})` : '(Shared link)');
    else labels.push(title ? `(Share: ${title})` : '(Share)');
  }
  return labels.filter(Boolean).join(' ');
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

function attachmentKind(att: IgAttachment): InboxMessageMedia['kind'] | null {
  const t = (att.type ?? att.mime_type ?? '').toLowerCase();
  const name = (att.name ?? '').toLowerCase();
  if (att.image_data?.render_as_sticker || t.includes('sticker') || t === 'like_heart') return 'sticker';
  if (imageUrlFromImageData(att.image_data) || t.includes('image') || t.includes('photo')) return 'image';
  if (att.video_data?.url || att.video_data?.preview_url || t.includes('video')) return 'video';
  if (t.includes('audio') || t.includes('voice') || /\.(ogg|mp3|m4a|wav|aac)(\?|$)/i.test(name))
    return 'audio';
  if (t.includes('share')) return 'share';
  if (att.file_url || att.payload?.url) return 'file';
  return null;
}

/** Structured media for inbox rendering (images, video, voice, shares). */
export function extractMediaFromRow(m: IgMessageRow): InboxMessageMedia[] {
  const out: InboxMessageMedia[] = [];
  for (const att of m.attachments?.data ?? []) {
    let kind = attachmentKind(att);
    const url =
      imageUrlFromImageData(att.image_data) ??
      att.video_data?.url ??
      att.video_data?.preview_url ??
      att.file_url ??
      att.payload?.url ??
      null;
    if (kind === 'image' && att.image_data?.render_as_sticker) kind = 'sticker';
    if (kind && url) {
      out.push({ kind, url, title: att.name ?? null });
      continue;
    }
    if (kind === 'audio' && att.file_url) {
      out.push({ kind: 'audio', url: att.file_url, title: att.name ?? null });
      continue;
    }
    if (kind && !url) {
      out.push({ kind, title: att.name ?? null });
    }
  }
  for (const share of m.shares?.data ?? []) {
    out.push(classifyShareItem(share));
  }
  if (m.story?.link) {
    out.push({ kind: 'story', url: m.story.link, title: 'Story reply' });
  }
  return out;
}

export function extractReactionsFromRow(m: IgMessageRow): InboxMessageReaction[] {
  const items: InboxMessageReaction[] = [];
  for (const r of m.reactions?.data ?? []) {
    if (!r.reaction) continue;
    for (const u of r.users ?? []) {
      items.push({ reaction: r.reaction, username: u.username ?? null });
    }
    if (!r.users?.length) items.push({ reaction: r.reaction });
  }
  return items;
}

/** Build display text for inbox bubbles from a Meta message row. */
export function messageBodyFromRow(m: IgMessageRow): string {
  const text = (m.message ?? '').trim();
  if (text) return text;

  const media = extractMediaFromRow(m);
  if (media.some((x) => x.url)) {
    const titles = media.filter((x) => x.title && !x.url).map((x) => x.title as string);
    return titles.join(' ') || '';
  }
  if (media.length > 0 && media.every((x) => x.kind === 'sticker')) {
    return '';
  }

  const parts = [attachmentLabel(m), shareLabel(m), storyLabel(m), reactionLabel(m)].filter(Boolean);
  if (m.is_unsupported) parts.push('(Unsupported message type)');
  if (parts.length > 0) return parts.join(' ');

  return '';
}

function rowNeedsHydration(m: IgMessageRow): boolean {
  if (!(m.attachments?.data?.length || m.shares?.data?.length)) return false;
  if ((m.message ?? '').trim()) return false;
  return !extractMediaFromRow(m).some((x) => x.url);
}

async function hydrateMessageRow(msgId: string, accessToken: string): Promise<IgMessageRow | null> {
  try {
    const r = await axios.get<IgMessageRow>(`${fbBaseUrl}/${msgId}`, {
      params: { fields: META_INBOX_MESSAGE_FIELDS, access_token: accessToken },
      timeout: 12_000,
    });
    noteMetaUsageFromHeaders(r.headers);
    return r.data?.error ? null : r.data ?? null;
  } catch {
    return null;
  }
}

async function hydrateRowsMissingMedia(
  rows: IgMessageRow[],
  accessToken: string
): Promise<IgMessageRow[]> {
  const need = rows.filter((m) => m.id && rowNeedsHydration(m)).slice(0, 16);
  if (need.length === 0) return rows;
  const hydrated = await Promise.all(need.map((m) => hydrateMessageRow(m.id, accessToken)));
  const byId = new Map<string, IgMessageRow>();
  for (const h of hydrated) {
    if (h?.id) byId.set(h.id, h);
  }
  return rows.map((m) => (m.id && byId.has(m.id) ? byId.get(m.id)! : m));
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
      media: extractMediaFromRow(m),
      reactions: extractReactionsFromRow(m),
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

/** Instagram Business Login: prefer one expanded conversation request; fall back to per-message hydration. */
export async function loadInstagramBusinessConversationMessages(
  conversationId: string,
  accessToken: string,
  ourIds: Set<string>
): Promise<{ messages: ConversationUiMessage[]; error?: string }> {
  try {
    const convoRes = await axios.get<{
      messages?: { data?: IgMessageRow[] };
      error?: { message?: string };
    }>(`${igBaseUrl}/${conversationId}`, {
      params: { fields: IG_CONVERSATION_MESSAGES_FIELDS, access_token: accessToken },
      timeout: 18_000,
    });
    noteMetaUsageFromHeaders(convoRes.headers);
    if (convoRes.data?.error) {
      return { messages: [], error: convoRes.data.error.message ?? 'Could not load messages.' };
    }
    let expandedRows = convoRes.data?.messages?.data ?? [];
    if (expandedRows.some((m) => m?.id && (m.message || m.attachments || m.shares || m.story))) {
      expandedRows = await hydrateRowsMissingMedia(expandedRows, accessToken);
      return { messages: mapRows(expandedRows, ourIds) };
    }

    // Fallback: list ids then hydrate (older API behavior or empty nested payload).
    const idRes = await axios.get<{
      messages?: { data?: Array<{ id: string }> };
      error?: { message?: string };
    }>(`${igBaseUrl}/${conversationId}`, {
      params: { fields: 'messages', access_token: accessToken },
      timeout: 10_000,
    });
    noteMetaUsageFromHeaders(idRes.headers);
    if (idRes.data?.error) {
      return { messages: [], error: idRes.data.error.message ?? 'Could not load messages.' };
    }
    const messageIds = (idRes.data?.messages?.data ?? []).map((m) => m.id).filter(Boolean);
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
      params: { ...params, limit: '50' },
      timeout: 18_000,
    });

    if (res.data?.error) {
      return { messages: [], error: res.data.error.message };
    }

    const rawRows = await hydrateRowsMissingMedia(res.data?.data ?? [], accessToken);
    const list = mapRows(rawRows, ourIds);
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
