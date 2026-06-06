'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';
import { ComposerOpenLink } from '@/components/aysop/ComposerOpenLink';

type Draft = Extract<AysopArtifact, { type: 'composer_post_draft' }>;

const PLATFORM_ACCENT: Record<string, string> = {
  TWITTER: 'bg-neutral-900 text-white',
  FACEBOOK: 'bg-[#1877F2] text-white',
  LINKEDIN: 'bg-[#0A66C2] text-white',
  THREADS: 'bg-neutral-900 text-white',
  INSTAGRAM: 'bg-gradient-to-r from-[#E1306C] to-[#FCAF45] text-white',
  TIKTOK: 'bg-neutral-900 text-white',
  YOUTUBE: 'bg-[#FF0000] text-white',
  PINTEREST: 'bg-[#E60023] text-white',
};

export function AysopComposerPostDraftCard({ draft }: { draft: Draft }) {
  const [confirming, setConfirming] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accent = PLATFORM_ACCENT[draft.platform.toUpperCase()] ?? 'bg-[var(--primary)] text-chrome-text';
  const handle = draft.username ? `@${draft.username.replace(/^@/, '')}` : 'Your account';

  const handlePublish = async () => {
    if (!draft.canPublishFromChat || publishing || published) return;
    setPublishing(true);
    setError(null);
    setStatus(null);
    try {
      const createRes = await api.post<{ id: string }>('/posts', {
        content: draft.caption,
        mediaType: 'text',
        media: [],
        targets: [{ platform: draft.platform, socialAccountId: draft.accountId }],
      });
      const postId = createRes.data.id;
      await api.post(`/posts/${postId}/publish`, {});
      setPublished(true);
      setConfirming(false);
      setStatus('Publishing started. Check History for live status.');
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not publish. Try Open Composer or History.';
      setError(msg);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden text-sm shadow-sm">
      <div className={`px-3 py-2 flex items-center justify-between gap-2 ${accent}`}>
        <div className="min-w-0">
          <p className="font-semibold truncate">{draft.platformLabel}</p>
          <p className="text-[11px] opacity-90 truncate">{handle}</p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide font-semibold opacity-90">
          {draft.mediaType === 'text' ? 'Text post' : draft.mediaType}
        </span>
      </div>

      <div className="p-3 border-b border-neutral-100 dark:border-neutral-800">
        <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1.5">
          Preview
        </p>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold text-neutral-600 dark:text-neutral-300">
              {draft.profilePicture ? (
                <img src={draft.profilePicture} alt="" className="w-full h-full object-cover" />
              ) : (
                (draft.username ?? draft.platformLabel).slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {draft.username ?? draft.platformLabel}
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">{draft.platformLabel}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed">
            {draft.caption}
          </p>
        </div>
      </div>

      <div className="p-3 flex flex-wrap items-center gap-2">
        {draft.canPublishFromChat ? (
          published ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} />
              Approved and publishing
            </span>
          ) : confirming ? (
            <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2.5 space-y-2">
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                Publish this post to {draft.platformLabel}?
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handlePublish()}
                  disabled={publishing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {publishing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Yes, publish
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={publishing}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-2 text-xs font-medium hover:opacity-90"
            >
              <Send size={14} />
              Approve & publish
            </button>
          )
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {draft.platformLabel} needs media before you can publish.
          </p>
        )}
        {!draft.canPublishFromChat || draft.mediaType !== 'text' ? (
          <ComposerOpenLink
            href={draft.composerUrl}
            draft={draft.sessionDraft ?? null}
            label="Open Composer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline"
          />
        ) : null}
      </div>

      {status ? (
        <p className="px-3 pb-3 text-xs text-emerald-700 dark:text-emerald-300">{status}</p>
      ) : null}
      {error ? <p className="px-3 pb-3 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
