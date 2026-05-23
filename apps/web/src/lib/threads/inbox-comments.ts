/**
 * Threads inbox: replies on your posts + @mentions (threads_read_replies, threads_manage_mentions).
 * Threads DMs are not exposed on the official Threads Graph API for third-party apps.
 */

import type { InboxCommentRow } from '@/lib/inbox/inbox-db-cache';
import { threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';

export type ThreadsPostSource = {
  platformPostId: string;
  postPreview: string;
  postTargetId: string;
  postPublishedAt?: string | null;
  postImageUrl?: string | null;
  postUrl?: string | null;
};

export type ThreadsInboxFetchMeta = {
  sourcesTried: number;
  repliesFound: number;
  mentionsFound: number;
  skippedOwn: number;
  apiErrors: string[];
};

type ThreadsReplyRow = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  is_reply_owned_by_me?: boolean;
  is_reply?: boolean;
  replied_to?: { id?: string } | string;
  root_post?: { id?: string } | string;
  hide_status?: string;
  profile_picture_url?: string;
};

type ThreadsMentionRow = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  media_type?: string;
};

const CONVERSATION_FIELDS =
  'id,text,username,timestamp,is_reply_owned_by_me,is_reply,replied_to,root_post,hide_status,profile_picture_url';

function mediaIdFromRef(ref?: { id?: string } | string | null): string | null {
  if (!ref) return null;
  if (typeof ref === 'string') {
    const trimmed = ref.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  const id = ref.id;
  return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
}

async function fetchThreadsPagedRows<T extends { id?: string }>(
  path: string,
  token: string,
  params: Record<string, string | number | undefined>,
  pageLimit = 3
): Promise<{ rows: T[]; error?: string }> {
  const rows: T[] = [];
  let nextPath: string | null = path.replace(/^\//, '');
  let nextParams: Record<string, string | number | undefined> | undefined = params;
  let pages = 0;
  let firstError: string | undefined;

  type ThreadsPagePayload = {
    data?: T[];
    paging?: { next?: string };
    error?: { message?: string };
  };

  while (nextPath && pages < pageLimit) {
    const response: { status: number; data: ThreadsPagePayload } = await threadsGet<ThreadsPagePayload>(
      nextPath,
      token,
      nextParams
    );
    const { status, data } = response;
    if (status !== 200) {
      const msg = data?.error?.message;
      if (msg && !firstError) firstError = msg;
      break;
    }
    rows.push(...(data?.data ?? []));
    const nextUrl = data?.paging?.next;
    if (!nextUrl) break;
    try {
      const parsed = new URL(String(nextUrl));
      nextPath = parsed.pathname.replace(/^\/v1\.0\//, '').replace(/^\//, '');
      nextParams = undefined;
    } catch {
      break;
    }
    pages += 1;
  }

  return { rows, error: firstError };
}

function pushReplyRow(
  accountId: string,
  src: ThreadsPostSource,
  r: ThreadsReplyRow,
  comments: InboxCommentRow[],
  stats: { repliesFound: number; skippedOwn: number }
): void {
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!id) return;
  if (r.is_reply_owned_by_me === true) {
    stats.skippedOwn += 1;
    return;
  }
  const author = (r.username ?? 'Threads user').replace(/^@/, '');
  const repliedToId = mediaIdFromRef(r.replied_to);
  const parentCommentId =
    repliedToId && repliedToId !== src.platformPostId ? repliedToId : null;
  comments.push({
    commentId: id,
    accountId,
    platform: 'THREADS',
    authorName: author || 'Threads user',
    authorPictureUrl: r.profile_picture_url ?? null,
    text: typeof r.text === 'string' ? r.text : '',
    createdAt: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
    isFromMe: false,
    parentCommentId,
    postTargetId: src.postTargetId,
    platformPostId: src.platformPostId,
    postPreview: src.postPreview,
    postImageUrl: src.postImageUrl ?? null,
    postPublishedAt: src.postPublishedAt ?? null,
    postUrl: src.postUrl ?? null,
  });
  stats.repliesFound += 1;
}

export async function fetchThreadsInboxComments(
  account: {
    id: string;
    accessToken: string;
    expiresAt?: Date | null;
    platformUserId?: string;
    username?: string | null;
  },
  sources: ThreadsPostSource[],
  maxSources: number
): Promise<{ comments: InboxCommentRow[]; error?: string; hint?: string; meta: ThreadsInboxFetchMeta }> {
  const token = await getValidThreadsToken(account);
  const comments: InboxCommentRow[] = [];
  const meta: ThreadsInboxFetchMeta = {
    sourcesTried: 0,
    repliesFound: 0,
    mentionsFound: 0,
    skippedOwn: 0,
    apiErrors: [],
  };
  let firstError: string | undefined;

  const triedSources = sources.slice(0, maxSources);
  meta.sourcesTried = triedSources.length;

  for (const src of triedSources) {
    const conversation = await fetchThreadsPagedRows<ThreadsReplyRow>(
      `${src.platformPostId}/conversation`,
      token,
      { fields: CONVERSATION_FIELDS, limit: 50, reverse: 'true' },
      2
    );
    if (conversation.error) {
      if (!firstError) firstError = conversation.error;
      if (!meta.apiErrors.includes(conversation.error)) meta.apiErrors.push(conversation.error);
    }
    if (conversation.rows.length > 0) {
      for (const r of conversation.rows) {
        if (r.is_reply === false) continue;
        pushReplyRow(account.id, src, r, comments, meta);
      }
      continue;
    }

    const replies = await fetchThreadsPagedRows<ThreadsReplyRow>(
      `${src.platformPostId}/replies`,
      token,
      { fields: CONVERSATION_FIELDS, limit: 50, reverse: 'true' },
      2
    );
    if (replies.error) {
      if (!firstError) firstError = replies.error;
      if (!meta.apiErrors.includes(replies.error)) meta.apiErrors.push(replies.error);
    }
    for (const r of replies.rows) {
      pushReplyRow(account.id, src, r, comments, meta);
    }
  }

  const mentionResult = await fetchThreadsPagedRows<ThreadsMentionRow>(
    'me/mentions',
    token,
    { fields: 'id,text,username,timestamp,media_type', limit: 50 },
    2
  );
  if (mentionResult.error) {
    if (!firstError) firstError = mentionResult.error;
    if (!meta.apiErrors.includes(mentionResult.error)) meta.apiErrors.push(mentionResult.error);
  }
  for (const m of mentionResult.rows) {
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!id) continue;
    const author = (m.username ?? 'Threads user').replace(/^@/, '');
    comments.push({
      commentId: `mention-${id}`,
      accountId: account.id,
      platform: 'THREADS',
      authorName: author || 'Threads user',
      text: typeof m.text === 'string' && m.text.trim() ? m.text : '@mention',
      createdAt: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      isFromMe: false,
      parentCommentId: null,
      postTargetId: `mention-${id}`,
      platformPostId: id,
      postPreview: 'Mentioned you on Threads',
      postImageUrl: null,
      postPublishedAt: null,
      postUrl: author ? `https://www.threads.net/@${encodeURIComponent(author)}` : 'https://www.threads.net/',
    });
    meta.mentionsFound += 1;
  }

  comments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  let error: string | undefined;
  if (comments.length === 0 && firstError) {
    const lower = firstError.toLowerCase();
    if (lower.includes('permission') || lower.includes('scope') || lower.includes('oauth')) {
      error =
        'Threads reply permissions required. Reconnect Threads from Account and approve threads_read_replies and threads_manage_mentions.';
    } else {
      error = firstError;
    }
  }

  let hint: string | undefined;
  if (comments.length === 0 && !error) {
    if (meta.sourcesTried === 0) {
      hint =
        'No Threads posts found to scan for replies. Open Dashboard with Threads selected to sync your threads, then return here.';
    } else if (meta.skippedOwn > 0 && meta.repliesFound === 0 && meta.mentionsFound === 0) {
      hint = `Scanned ${meta.sourcesTried} thread${meta.sourcesTried === 1 ? '' : 's'} and found ${meta.skippedOwn} repl${meta.skippedOwn === 1 ? 'y' : 'ies'} from your account (hidden). Incoming replies from other users and @mentions appear here.`;
    } else {
      hint =
        'No incoming replies or @mentions yet. Have someone else reply to your thread or @mention you from another account to test.';
    }
  }

  return { comments, error, hint, meta };
}

/** Legacy inbox cache stored post id as parentCommentId; normalize so rows appear in Comments tab. */
export { normalizeThreadsInboxCommentRow } from '@/lib/threads/normalize-threads-inbox-comment';

export async function postThreadsReply(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  parentMediaId: string,
  message: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = await getValidThreadsToken(account);
  const { threadsPostForm } = await import('@/lib/threads/threads-api');
  const { status, data } = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    `${parentMediaId.replace(/^\//, '')}/replies`,
    token,
    { text: message.trim() }
  );
  if (status >= 200 && status < 300) {
    return { ok: true };
  }
  const msg = data?.error?.message ?? `Threads reply failed (HTTP ${status})`;
  return { ok: false, message: msg };
}
