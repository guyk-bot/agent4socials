'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import { ComposerOpenLink } from '@/components/izop/ComposerOpenLink';
import { draftMediaDisplayUrl } from '@/lib/ai/izop-draft-media-display';

type Draft = Extract<IzopArtifact, { type: 'composer_post_draft' }>;

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

export function IzopComposerPostDraftCard({ draft }: { draft: Draft }) {
  const [confirming, setConfirming] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accent = PLATFORM_ACCENT[draft.platform.toUpperCase()] ?? 'bg-[var(--primary)] text-chrome-text';
  const displayName = draft.username?.trim() || 'Your account';
  const handle = draft.username?.trim() ? `@${draft.username.replace(/^@/, '')}` : '@account';
  const avatarUrl = draftMediaDisplayUrl(draft.profilePicture);
  const previewMedia =
    draft.sessionDraft?.mediaList?.[0] ??
    (draft.previewMediaUrls?.[0]
      ? {
          fileUrl: draft.previewMediaUrls[0],
          type: /\.(mp4|mov|webm|m4v|avi|mkv)(\?|$)/i.test(draft.previewMediaUrls[0])
            ? ('VIDEO' as const)
            : ('IMAGE' as const),
        }
      : null);
  const previewMediaUrl = previewMedia ? draftMediaDisplayUrl(previewMedia.fileUrl) : '';

  const handlePublish = async () => {
    if (!draft.canPublishFromChat || publishing || published || scheduled) return;
    setPublishing(true);
    setError(null);
    setStatus(null);
    const media = draft.sessionDraft?.mediaList ?? [];
    const resolvedMediaType =
      media.length > 0
        ? media[0].type === 'VIDEO'
          ? 'video'
          : 'photo'
        : draft.mediaType;
    try {
      const createRes = await api.post<{ id: string }>('/posts', {
        content: draft.caption,
        mediaType: resolvedMediaType === 'text' ? 'text' : resolvedMediaType,
        media,
        targets: [{ platform: draft.platform, socialAccountId: draft.accountId }],
      });
      const postId = createRes.data.id;
      await api.post(`/posts/${postId}/publish`, {});
      setPublished(true);
      setConfirming(false);
      setScheduling(false);
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

  const handleSchedule = async () => {
    if (!draft.canPublishFromChat || publishing || published || scheduled || !scheduleAt) return;
    setPublishing(true);
    setError(null);
    setStatus(null);
    const media = draft.sessionDraft?.mediaList ?? [];
    const resolvedMediaType =
      media.length > 0
        ? media[0].type === 'VIDEO'
          ? 'video'
          : 'photo'
        : draft.mediaType;
    try {
      const iso = new Date(scheduleAt).toISOString();
      await api.post('/posts', {
        content: draft.caption,
        mediaType: resolvedMediaType === 'text' ? 'text' : resolvedMediaType,
        media,
        targets: [{ platform: draft.platform, socialAccountId: draft.accountId }],
        scheduledAt: iso,
        scheduleDelivery: 'auto',
      });
      setScheduled(true);
      setConfirming(false);
      setScheduling(false);
      setStatus(
        `Scheduled for ${new Date(scheduleAt).toLocaleString()}. Preview on Calendar or History anytime.`
      );
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not schedule. Try Calendar or Composer.';
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
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                {displayName}
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{handle}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap leading-relaxed">
            {draft.caption}
          </p>
          {previewMedia && previewMediaUrl ? (
            <div className="mt-3 rounded-lg overflow-hidden border border-neutral-200 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-900">
              {previewMedia.type === 'VIDEO' ? (
                <video
                  src={previewMediaUrl}
                  controls
                  className="w-full max-h-48 object-contain"
                />
              ) : (
                <img
                  src={previewMediaUrl}
                  alt=""
                  className="w-full max-h-48 object-contain"
                />
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-3 flex flex-wrap items-center gap-2">
        {draft.canPublishFromChat ? (
          published || scheduled ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 size={14} />
              {scheduled ? 'Scheduled' : 'Approved and publishing'}
            </span>
          ) : confirming || scheduling ? (
            <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2.5 space-y-2">
              <p className="text-xs text-neutral-700 dark:text-neutral-300">
                {scheduling
                  ? `Schedule this post to ${draft.platformLabel}?`
                  : `Publish this post to ${draft.platformLabel} now?`}
              </p>
              {scheduling ? (
                <input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-xs"
                />
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void (scheduling ? handleSchedule() : handlePublish())}
                  disabled={publishing || (scheduling && !scheduleAt)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : scheduling ? (
                    <CalendarClock size={14} />
                  ) : (
                    <Send size={14} />
                  )}
                  {scheduling ? 'Confirm schedule' : 'Yes, publish'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(false);
                    setScheduling(false);
                  }}
                  disabled={publishing}
                  className="rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setConfirming(true);
                  setScheduling(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-2 text-xs font-medium hover:opacity-90"
              >
                <Send size={14} />
                Allow
              </button>
              <button
                type="button"
                onClick={() => {
                  setScheduling(true);
                  setConfirming(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 dark:border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                <CalendarClock size={14} />
                Schedule
              </button>
            </>
          )
        ) : (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {draft.platformLabel} needs media before you can publish from chat. Use inline Composer below.
          </p>
        )}
        {!draft.canPublishFromChat ? (
          <ComposerOpenLink
            href={draft.composerUrl}
            draft={draft.sessionDraft ?? null}
            label="Open Composer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline"
          />
        ) : null}
      </div>

      {status ? (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{status}</p>
          {scheduled ? (
            <div className="flex flex-wrap gap-3 text-xs">
              <Link href="/calendar" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline">
                Open Calendar <ExternalLink size={12} />
              </Link>
              <Link href="/posts" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline">
                Open History <ExternalLink size={12} />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="px-3 pb-3 text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
