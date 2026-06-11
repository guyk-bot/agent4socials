/**
 * Threads inbox: replies on your posts + @mentions (threads_read_replies, threads_manage_mentions).
 * Threads DMs are not exposed on the official Threads Graph API for third-party apps.
 */

import type { InboxCommentRow } from '@/lib/inbox/inbox-db-cache';
import { threadsGet } from '@/lib/threads/threads-api';
import { getValidThreadsToken } from '@/lib/threads/threads-token';
import { waitForThreadsContainerReady } from '@/lib/threads/publish';

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
  media_url?: string;
  thumbnail_url?: string;
  profile_picture_url?: string;
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
    threadsReplyToId: id,
    inboxKind: 'threads_reply',
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
    {
      fields: 'id,text,username,timestamp,media_type,media_url,thumbnail_url,profile_picture_url',
      limit: 50,
    },
    3
  );
  if (mentionResult.error) {
    if (!firstError) firstError = mentionResult.error;
    if (!meta.apiErrors.includes(mentionResult.error)) meta.apiErrors.push(mentionResult.error);
  }
  for (const m of mentionResult.rows) {
    const id = typeof m.id === 'string' ? m.id.trim() : '';
    if (!id) continue;
    const author = (m.username ?? 'Threads user').replace(/^@/, '');
    const mentionPermalink = `https://www.threads.net/post/${encodeURIComponent(id)}`;
    comments.push({
      commentId: `mention-${id}`,
      accountId: account.id,
      platform: 'THREADS',
      authorName: author ? `@${author}` : 'Threads user',
      authorPictureUrl: m.profile_picture_url ?? null,
      threadsReplyToId: id,
      inboxKind: 'threads_mention',
      text: typeof m.text === 'string' && m.text.trim() ? m.text : 'Mentioned you on Threads',
      createdAt: m.timestamp ? new Date(m.timestamp).toISOString() : new Date().toISOString(),
      isFromMe: false,
      parentCommentId: null,
      postTargetId: `mention-${id}`,
      platformPostId: id,
      postPreview: 'Mentioned you on Threads',
      postImageUrl: m.thumbnail_url ?? m.media_url ?? null,
      postPublishedAt: null,
      postUrl: mentionPermalink,
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
export {
  isThreadsMentionComment,
  isThreadsReplyComment,
} from '@/lib/threads/threads-inbox-comment';

async function threadsMediaExists(
  mediaId: string,
  token: string
): Promise<boolean> {
  const id = mediaId.replace(/^\//, '').trim();
  if (!id) return false;
  const { status, data } = await threadsGet<{ id?: string }>(id, token, { fields: 'id' });
  return status === 200 && !!data?.id;
}

/** Pick a reply_to_id that exists for this token (reply media, else root thread). */
export async function resolveThreadsReplyToMediaId(
  token: string,
  args: {
    commentId: string;
    platformPostId?: string | null;
    threadsReplyToId?: string | null;
    parentCommentId?: string | null;
  }
): Promise<{ replyToId: string; usedRootFallback: boolean } | { error: string }> {
  const candidates = [
    args.threadsReplyToId,
    threadsReplyToMediaId(args),
    args.parentCommentId,
    args.platformPostId,
  ]
    .map((x) => (typeof x === 'string' ? x.replace(/^\//, '').trim() : ''))
    .filter((x) => x.length > 0);
  const unique = [...new Set(candidates)];

  for (let i = 0; i < unique.length; i++) {
    const id = unique[i]!;
    if (await threadsMediaExists(id, token)) {
      return { replyToId: id, usedRootFallback: i > 0 && id === (args.platformPostId ?? '').trim() };
    }
  }

  return {
    error:
      'This Threads comment could not be found. Refresh Comments in Inbox, then try again. If it still fails, reconnect Threads from Account.',
  };
}

function threadsReplyCreateErrorMessage(raw: string, httpStatus: number): string {
  const lower = raw.toLowerCase();
  if (lower.includes('does not exist') || lower.includes('not exist')) {
    return 'Threads could not find that comment or thread. Refresh Comments, then try again. Reconnect Threads if the problem continues.';
  }
  if (lower.includes('permission') || lower.includes('scope')) {
    return 'Threads reply permission missing. Reconnect Threads from Account and approve threads_manage_replies.';
  }
  return (raw || `Threads could not create reply (HTTP ${httpStatus})`).slice(0, 300);
}

async function publishThreadsReplyContainer(
  containerId: string,
  token: string
): Promise<{ ok: true } | { ok: false; message: string; retryable: boolean }> {
  const { threadsPostForm } = await import('@/lib/threads/threads-api');
  const pub = await threadsPostForm<{ id?: string; error?: { message?: string } }>(
    'me/threads_publish',
    token,
    { creation_id: containerId }
  );
  if (pub.status === 200 && pub.data?.id) {
    return { ok: true };
  }
  const raw = pub.data?.error?.message ?? `Threads could not publish reply (HTTP ${pub.status})`;
  const lower = raw.toLowerCase();
  const retryable =
    lower.includes('not ready') ||
    lower.includes('processing') ||
    lower.includes('in progress') ||
    lower.includes('try again');
  return { ok: false, message: raw.slice(0, 300), retryable };
}

export async function postThreadsReply(
  account: { id: string; accessToken: string; expiresAt?: Date | null },
  args: {
    commentId: string;
    message: string;
    platformPostId?: string | null;
    threadsReplyToId?: string | null;
    parentCommentId?: string | null;
  }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const token = await getValidThreadsToken(account);
  const { threadsPostForm } = await import('@/lib/threads/threads-api');

  const text = args.message.trim().slice(0, 500);
  if (!text) {
    return { ok: false, message: 'Reply text is required.' };
  }

  let replyToId = threadsReplyToMediaId({
    commentId: args.commentId,
    platformPostId: args.platformPostId,
    threadsReplyToId: args.threadsReplyToId,
    parentCommentId: args.parentCommentId,
  });

  const tryCreate = async (targetId: string) =>
    threadsPostForm<{ id?: string; error?: { message?: string } }>('me/threads', token, {
      media_type: 'TEXT',
      text,
      reply_to_id: targetId,
    });

  let create = replyToId ? await tryCreate(replyToId) : { status: 400, data: undefined };

  if ((create.status !== 200 || !create.data?.id) && replyToId) {
    const raw = create.data?.error?.message ?? '';
    if (raw.toLowerCase().includes('does not exist') || raw.toLowerCase().includes('not exist')) {
      const resolved = await resolveThreadsReplyToMediaId(token, {
        commentId: args.commentId,
        platformPostId: args.platformPostId,
        threadsReplyToId: args.threadsReplyToId,
        parentCommentId: args.parentCommentId,
      });
      if ('error' in resolved) {
        return { ok: false, message: resolved.error };
      }
      replyToId = resolved.replyToId;
      create = await tryCreate(replyToId);
    }
  }

  if (!replyToId) {
    const resolved = await resolveThreadsReplyToMediaId(token, {
      commentId: args.commentId,
      platformPostId: args.platformPostId,
      threadsReplyToId: args.threadsReplyToId,
      parentCommentId: args.parentCommentId,
    });
    if ('error' in resolved) {
      return { ok: false, message: resolved.error };
    }
    replyToId = resolved.replyToId;
    create = await tryCreate(replyToId);
  }

  if (create.status !== 200 || !create.data?.id) {
    const raw = create.data?.error?.message ?? `Threads could not create reply (HTTP ${create.status})`;
    return { ok: false, message: threadsReplyCreateErrorMessage(raw, create.status) };
  }

  const containerId = create.data.id;

  // TEXT replies are often publishable immediately; poll only if Meta says the container is not ready.
  let published = await publishThreadsReplyContainer(containerId, token);
  if (published.ok) {
    return { ok: true };
  }
  if (!published.retryable) {
    return { ok: false, message: published.message };
  }

  const ready = await waitForThreadsContainerReady(containerId, token, 35_000);
  if (!ready) {
    return {
      ok: false,
      message: 'Threads is still processing your reply. Wait a moment and try again.',
    };
  }

  published = await publishThreadsReplyContainer(containerId, token);
  if (published.ok) {
    return { ok: true };
  }
  return { ok: false, message: published.message };
}

/** Resolve the Threads media id passed as reply_to_id when posting a reply. */
export function threadsReplyToMediaId(args: {
  commentId: string;
  platformPostId?: string | null;
  threadsReplyToId?: string | null;
  parentCommentId?: string | null;
}): string {
  const explicit = args.threadsReplyToId?.trim();
  if (explicit) return explicit.replace(/^\//, '');
  const commentId = args.commentId.trim();
  if (commentId.startsWith('mention-')) {
    return commentId.replace(/^mention-/, '');
  }
  if (commentId) return commentId.replace(/^\//, '');
  const parent = args.parentCommentId?.trim();
  if (parent) return parent.replace(/^\//, '');
  return (args.platformPostId ?? '').trim().replace(/^\//, '');
}
