'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

type InboxFeedArtifact = Extract<AysopArtifact, { type: 'inbox_feed' }>;

export function AysopInChatInboxFeedCard({ artifact }: { artifact: InboxFeedArtifact }) {
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

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm">
      <p className="font-medium text-neutral-800 dark:text-neutral-200 mb-2">Recent inbox</p>
      <ul className="space-y-2 max-h-80 overflow-y-auto">
        {artifact.items.map((item) => {
          const sent = sentIds.has(item.commentId);
          const isReplying = replyingId === item.commentId;
          return (
            <li
              key={item.commentId}
              className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2.5"
            >
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 mb-1">
                {item.platform} · {item.postPreview.slice(0, 48)}
              </p>
              <p className="text-xs">
                <span className="font-medium text-neutral-800 dark:text-neutral-200">{item.authorName ?? 'User'}:</span>{' '}
                <span className="text-neutral-600 dark:text-neutral-400">{item.text}</span>
              </p>
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
                    className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={!replyText.trim() || sendingId === item.commentId}
                      onClick={() => void handleReply(item.accountId, item.commentId)}
                      className="inline-flex items-center gap-1 rounded-lg bg-[var(--dark)] text-chrome-text px-2.5 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {sendingId === item.commentId ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Send size={12} />
                      )}
                      Send reply
                    </button>
                    <button
                      type="button"
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
                    setReplyingId(item.commentId);
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
      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
