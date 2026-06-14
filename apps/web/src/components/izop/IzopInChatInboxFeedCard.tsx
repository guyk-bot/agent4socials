'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Loader2, MessageSquare, Send } from 'lucide-react';
import api from '@/lib/api';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import { prefetchInboxPostMediaBatch } from '@/lib/inbox/inbox-post-media-prefetch';
import { InboxCommentThumb } from '@/components/inbox/InboxCommentThumb';
import { ThreadsIcon } from '@/components/SocialPlatformIcons';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';

type InboxFeedArtifact = Extract<IzopArtifact, { type: 'inbox_feed' }>;

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function platformIcon(platformCode: string) {
  if (platformCode === 'THREADS') {
    return <ThreadsIcon size={14} className="shrink-0" />;
  }
  return null;
}

export function IzopInChatInboxFeedCard({ artifact }: { artifact: InboxFeedArtifact }) {
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleReply = async (accountId: string, commentId: string) => {
    const message = replyText.trim();
    if (!message || sendingId) return;
    setSendingId(commentId);
    setError(null);
    try {
      await api.post(`/social/accounts/${accountId}/comments/reply`, { commentId, message });
      setSentIds((prev) => new Set(prev).add(commentId));
      setReplyingId(null);
      setReplyText('');
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not send reply.';
      setError(msg);
    } finally {
      setSendingId(null);
    }
  };

  const title = artifact.title ?? 'Recent inbox';

  useEffect(() => {
    prefetchInboxPostMediaBatch(
      artifact.items
        .filter((i) => i.platformPostId)
        .map((i) => ({
          accountId: i.accountId,
          platformPostId: i.platformPostId!,
          platform: i.platformCode,
          postImageUrl: i.postImageUrl,
        }))
    );
  }, [artifact.items]);

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm shadow-sm">
      <p className="font-semibold text-neutral-900 dark:text-neutral-100 mb-3">{title}</p>
      <ul className="space-y-3 max-h-[28rem] overflow-y-auto pr-0.5">
        {artifact.items.map((item) => {
          const sent = sentIds.has(item.commentId);
          const isReplying = replyingId === item.commentId;
          const avatarSrc = avatarDisplayUrl(item.platformCode, item.authorPictureUrl);
          const dateLabel = formatCommentDate(item.createdAt);
          const canReply = item.canSuggestReply !== false;
          const postId = item.platformPostId ?? item.commentId.replace(/^mention-/, '');

          return (
            <li
              key={item.commentId}
              className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-950 overflow-hidden"
            >
              <div className="flex gap-3 p-3">
                {postId ? (
                  <InboxCommentThumb
                    accountId={item.accountId}
                    platformPostId={postId}
                    platform={item.platformCode}
                    fallbackImageUrl={item.postImageUrl}
                    textOnlyPost={!item.postImageUrl?.trim()}
                    size="md"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {platformIcon(item.platformCode)}
                      <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 truncate">
                        Reply on {item.platformCode === 'THREADS' ? 'Threads' : item.platform}
                      </span>
                    </div>
                    {dateLabel ? (
                      <span className="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">
                        {dateLabel}
                      </span>
                    ) : null}
                  </div>
                  {item.postText || item.postPreview ? (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-2 mb-2 leading-snug">
                      {item.postText ?? item.postPreview}
                    </p>
                  ) : null}
                  <div className="flex items-start gap-2">
                    <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center">
                      {avatarSrc ? (
                        <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <MessageSquare size={14} className="text-neutral-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-relaxed">
                        <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                          {item.authorName ?? 'User'}
                        </span>
                        <span className="text-neutral-600 dark:text-neutral-400"> {item.text}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-neutral-200/80 dark:border-neutral-800 px-3 py-2.5 bg-white/60 dark:bg-neutral-900/40">
                {sent ? (
                  <p className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={13} />
                    Reply sent
                  </p>
                ) : isReplying ? (
                  <div className="space-y-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      placeholder="Write your reply…"
                      className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!replyText.trim() || sendingId === item.commentId}
                        onClick={() => void handleReply(item.accountId, item.commentId)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50"
                      >
                        {sendingId === item.commentId ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Send size={13} />
                        )}
                        Send reply
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingId(null);
                          setReplyText('');
                        }}
                        className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {canReply ? (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyingId(item.commentId);
                          setReplyText('');
                          setError(null);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-100 shadow-sm hover:bg-neutral-50 dark:hover:bg-neutral-700"
                      >
                        Reply manually
                      </button>
                    ) : (
                      <p className="text-[11px] text-amber-800 dark:text-amber-200">
                        {item.replyBlockedReason ??
                          'Reply from the app is not available for this comment.'}
                      </p>
                    )}
                    {item.postUrl ? (
                      <a
                        href={item.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--primary)] hover:underline"
                      >
                        Open post
                        <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
