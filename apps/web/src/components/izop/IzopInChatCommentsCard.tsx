'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';

type CommentsArtifact = Extract<IzopArtifact, { type: 'comments' }>;

type CommentRow = {
  commentId?: string;
  authorName?: string;
  text?: string;
  createdAt?: string;
  platform?: string;
};

export function IzopInChatCommentsCard({ artifact }: { artifact: CommentsArtifact }) {
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const handleReply = async (commentId: string) => {
    const message = replyText.trim();
    if (!message || sendingId) return;
    setSendingId(commentId);
    setError(null);
    try {
      await api.post(`/social/accounts/${artifact.accountId}/comments/reply`, {
        commentId,
        message,
      });
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

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/80 p-3 text-sm">
      <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">
        Comments on: {artifact.postPreview}
      </p>
      <ul className="space-y-3 max-h-72 overflow-y-auto">
        {(artifact.comments as CommentRow[]).map((c, j) => {
          const commentId = String(c.commentId ?? j);
          const sent = sentIds.has(commentId);
          const isReplying = replyingId === commentId;
          return (
            <li key={commentId} className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-2.5">
              <div className="border-l-2 border-[var(--primary)] pl-2">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {String(c.authorName ?? 'User')}
                </span>
                {c.platform ? (
                  <span className="text-[10px] text-neutral-400 ml-1.5">{c.platform}</span>
                ) : null}
                <p className="text-neutral-600 dark:text-neutral-400 mt-0.5">{String(c.text ?? '')}</p>
              </div>
              {sent ? (
                <p className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={12} />
                  Reply sent
                </p>
              ) : isReplying ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    rows={2}
                    placeholder="Write your reply…"
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-950 px-2.5 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!replyText.trim() || sendingId === commentId}
                      onClick={() => void handleReply(commentId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--dark)] text-chrome-text px-2.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {sendingId === commentId ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      Send reply
                    </button>
                    <button
                      type="button"
                      disabled={sendingId === commentId}
                      onClick={() => {
                        setReplyingId(null);
                        setReplyText('');
                      }}
                      className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-600 dark:text-neutral-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setReplyingId(commentId);
                    setReplyText('');
                    setError(null);
                  }}
                  className="mt-2 text-xs font-medium text-[var(--primary)] hover:underline"
                >
                  Reply in chat
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 rounded-lg border border-[#7C3AED]/25 bg-[#7C3AED]/5 dark:bg-[#7C3AED]/10 px-3 py-2">
        <p className="text-xs text-neutral-800 dark:text-neutral-200">
          Would you like me to send replies to all comments above?
        </p>
        <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          Click Allow on each reply, or type allow in chat for bulk send when available.
        </p>
      </div>
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
