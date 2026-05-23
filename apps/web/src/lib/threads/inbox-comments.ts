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

type ThreadsReplyRow = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  is_reply_owned_by_me?: boolean;
};

type ThreadsMentionRow = {
  id?: string;
  text?: string;
  username?: string;
  timestamp?: string;
  media_type?: string;
};

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
): Promise<{ comments: InboxCommentRow[]; error?: string }> {
  const token = await getValidThreadsToken(account);
  const comments: InboxCommentRow[] = [];
  const myUsername = (account.username ?? '').trim().replace(/^@/, '').toLowerCase();
  let firstError: string | undefined;

  for (const src of sources.slice(0, maxSources)) {
    const { status, data } = await threadsGet<{ data?: ThreadsReplyRow[]; error?: { message?: string } }>(
      `${src.platformPostId}/replies`,
      token,
      { fields: 'id,text,username,timestamp,is_reply_owned_by_me', limit: 50 }
    );
    if (status !== 200) {
      const msg = data?.error?.message;
      if (msg && !firstError) firstError = msg;
      continue;
    }
    for (const r of data?.data ?? []) {
      const id = typeof r.id === 'string' ? r.id.trim() : '';
      if (!id) continue;
      const author = (r.username ?? 'Threads user').replace(/^@/, '');
      const isFromMe =
        r.is_reply_owned_by_me === true ||
        (myUsername.length > 0 && author.toLowerCase() === myUsername);
      comments.push({
        commentId: id,
        accountId: account.id,
        platform: 'THREADS',
        authorName: isFromMe ? 'You' : author || 'Threads user',
        text: typeof r.text === 'string' ? r.text : '',
        createdAt: r.timestamp ? new Date(r.timestamp).toISOString() : new Date().toISOString(),
        isFromMe,
        parentCommentId: src.platformPostId,
        postTargetId: src.postTargetId,
        platformPostId: src.platformPostId,
        postPreview: src.postPreview,
        postImageUrl: src.postImageUrl ?? null,
        postPublishedAt: src.postPublishedAt ?? null,
        postUrl: src.postUrl ?? null,
      });
    }
  }

  const { status: mentionStatus, data: mentionData } = await threadsGet<{
    data?: ThreadsMentionRow[];
    error?: { message?: string };
  }>('me/mentions', token, { fields: 'id,text,username,timestamp,media_type', limit: 50 });

  if (mentionStatus === 200) {
    for (const m of mentionData?.data ?? []) {
      const id = typeof m.id === 'string' ? m.id.trim() : '';
      if (!id) continue;
      const author = (m.username ?? 'Threads user').replace(/^@/, '');
      const isFromMe = myUsername.length > 0 && author.toLowerCase() === myUsername;
      if (isFromMe) continue;
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
    }
  } else {
    const msg = mentionData?.error?.message;
    if (msg && !firstError) firstError = msg;
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

  return { comments, error };
}

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
