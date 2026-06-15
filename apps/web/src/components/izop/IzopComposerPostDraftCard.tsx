'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, CheckCircle2, ExternalLink, Loader2, Send } from 'lucide-react';
import api from '@/lib/api';
import type { IzopArtifact } from '@/lib/ai/izop-artifacts';
import { ComposerOpenLink } from '@/components/izop/ComposerOpenLink';
import { ChatDraftStoryOption } from '@/components/izop/ChatDraftStoryOption';
import { IzopPostDraftPreview } from '@/components/izop/IzopPostDraftPreview';
import { draftMediaDisplayUrl } from '@/lib/ai/izop-draft-media-display';
import {
  findCachedAccountForDraft,
  isGenericAccountUsername,
  resolveDraftAccountDisplay,
} from '@/lib/composer/draft-account-display';
import {
  THREADS_INSTAGRAM_STORY_DESCRIPTION,
  THREADS_INSTAGRAM_STORY_LABEL,
  metaAlsoStoryDescription,
  metaAlsoStoryEligible,
  metaAlsoStoryLabel,
  threadsInstagramStoryEligible,
} from '@/lib/composer/story-share-options';
import type { IzopComposerDraftPayload } from '@/lib/composer/izop-composer-draft-bridge';
import { mediaListFromUrls } from '@/lib/composer/izop-composer-draft-bridge';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import { friendlyIzopChatError } from '@/lib/ai/izop-chat-errors';
import {
  markComposerDraftPublishState,
  readComposerDraftPublishState,
  type ComposerDraftPublishPatch,
} from '@/lib/ai/composer-draft-artifact-state';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAuth } from '@/context/AuthContext';

type Draft = Extract<IzopArtifact, { type: 'composer_post_draft' }>;

function resolveDraftMediaForPublish(draft: Draft): { fileUrl: string; type: 'IMAGE' | 'VIDEO' }[] {
  if (draft.sessionDraft?.mediaList?.length) {
    return draft.sessionDraft.mediaList.map((m) => ({
      fileUrl: m.fileUrl,
      type: m.type,
    }));
  }
  if (draft.previewMediaUrls?.length) {
    return mediaListFromUrls(draft.previewMediaUrls);
  }
  return [];
}

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

export function IzopComposerPostDraftCard({
  draft,
  messageId,
  artifactIndex = 0,
  onArtifactResolved,
}: {
  draft: Draft;
  messageId?: string;
  artifactIndex?: number;
  onArtifactResolved?: (patch: ComposerDraftPublishPatch) => void;
}) {
  const { user } = useAuth();
  const accountsCache = useAccountsCache();
  const storedPublish = useMemo(() => {
    if (draft.publishedAt || draft.scheduledAt || draft.publishError || draft.publishStatusMessage) {
      return {
        publishedAt: draft.publishedAt ?? undefined,
        publishedPostId: draft.publishedPostId ?? undefined,
        scheduledAt: draft.scheduledAt ?? undefined,
        publishStatusMessage: draft.publishStatusMessage ?? undefined,
        publishError: draft.publishError ?? undefined,
      };
    }
    if (messageId) {
      return readComposerDraftPublishState(user?.id, messageId, artifactIndex);
    }
    return null;
  }, [
    draft.publishedAt,
    draft.publishedPostId,
    draft.scheduledAt,
    draft.publishStatusMessage,
    draft.publishError,
    messageId,
    user?.id,
    artifactIndex,
  ]);

  const persistPublishState = (patch: ComposerDraftPublishPatch) => {
    if (messageId) {
      markComposerDraftPublishState(user?.id, messageId, artifactIndex, patch);
    }
    onArtifactResolved?.(patch);
  };
  const allCachedAccounts = accountsCache?.allCachedAccounts ?? [];
  const [confirming, setConfirming] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(Boolean(storedPublish?.publishedAt));
  const [publishedPostId, setPublishedPostId] = useState<string | null>(
    storedPublish?.publishedPostId ?? null
  );
  const [scheduled, setScheduled] = useState(Boolean(storedPublish?.scheduledAt));
  const [status, setStatus] = useState<string | null>(storedPublish?.publishStatusMessage ?? null);
  const [error, setError] = useState<string | null>(storedPublish?.publishError ?? null);
  const [threadsShareToInstagram, setThreadsShareToInstagram] = useState(false);
  const [alsoPostToStory, setAlsoPostToStory] = useState(false);
  const [liveAccount, setLiveAccount] = useState<{
    username?: string;
    profilePicture?: string | null;
  } | null>(null);

  const cachedAccount = useMemo(
    () => findCachedAccountForDraft(draft, allCachedAccounts),
    [draft, allCachedAccounts]
  );

  useEffect(() => {
    const merged = resolveDraftAccountDisplay(draft, cachedAccount);
    const needsProfile =
      isGenericAccountUsername(merged.username, draft.platform) || !merged.profilePicture;
    if (!needsProfile) {
      setLiveAccount(null);
      return;
    }

    let cancelled = false;
    void api
      .get<Array<{ id: string; platform: string; username?: string; profilePicture?: string | null }>>(
        '/social/accounts'
      )
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        const acc = findCachedAccountForDraft(draft, rows);
        if (!acc) return;
        setLiveAccount({
          username: acc.username,
          profilePicture: acc.profilePicture ?? null,
        });
      })
      .catch(() => {
        /* keep cache-only display */
      });

    return () => {
      cancelled = true;
    };
  }, [draft, cachedAccount]);

  const accent = PLATFORM_ACCENT[draft.platform.toUpperCase()] ?? 'bg-[var(--primary)] text-chrome-text';
  const accountDisplay = useMemo(
    () => resolveDraftAccountDisplay(draft, liveAccount ?? cachedAccount),
    [draft, cachedAccount, liveAccount]
  );
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
  const previewMediaForCard =
    previewMedia && previewMedia.fileUrl
      ? {
          fileUrl: previewMedia.fileUrl,
          type: previewMedia.type,
        }
      : null;

  const hasMedia = Boolean(
    (draft.sessionDraft?.mediaList?.length ?? 0) > 0 || (draft.previewMediaUrls?.length ?? 0) > 0
  );

  const threadsStoryOption = useMemo(
    () =>
      threadsInstagramStoryEligible({
        platform: draft.platform,
        mediaType: draft.mediaType,
        hasMedia,
      }),
    [draft.platform, draft.mediaType, hasMedia]
  );

  const metaStoryOption = useMemo(
    () =>
      metaAlsoStoryEligible({
        platform: draft.platform,
        mediaType: draft.mediaType,
        hasMedia,
      }),
    [draft.platform, draft.mediaType, hasMedia]
  );

  useEffect(() => {
    if (!threadsStoryOption.eligible && threadsShareToInstagram) {
      setThreadsShareToInstagram(false);
    }
  }, [threadsStoryOption.eligible, threadsShareToInstagram]);

  useEffect(() => {
    if (!metaStoryOption.eligible && alsoPostToStory) {
      setAlsoPostToStory(false);
    }
  }, [metaStoryOption.eligible, alsoPostToStory]);

  const composerDraftWithStoryFlags = useMemo((): IzopComposerDraftPayload | null => {
    if (!draft.sessionDraft) return null;
    return {
      ...draft.sessionDraft,
      ...(threadsShareToInstagram ? { threadsShareToInstagram: true } : {}),
      ...(alsoPostToStory ? { alsoPostToStory: true } : {}),
    };
  }, [draft.sessionDraft, threadsShareToInstagram, alsoPostToStory]);

  const watchPublishOutcome = (postId: string) => {
    void (async () => {
      const platformUpper = draft.platform.toUpperCase();
      for (let attempt = 0; attempt < 45; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
        try {
          const res = await api.get<{
            status?: string;
            targets?: Array<{ platform?: string; status?: string; error?: string | null }>;
          }>(`/posts/${postId}`);
          const target = (res.data?.targets ?? []).find(
            (t) => String(t.platform ?? '').toUpperCase() === platformUpper
          );
          if (target?.status === 'POSTED') {
            const msg = `Published to ${draft.platformLabel}. Check History for details.`;
            setStatus(msg);
            persistPublishState({
              publishedAt: new Date().toISOString(),
              publishedPostId: postId,
              publishStatusMessage: msg,
              publishError: undefined,
            });
            return;
          }
          if (target?.status === 'FAILED') {
            const err =
              target.error?.trim() ||
              `Publish failed on ${draft.platformLabel}. Reconnect the account and try Allow again.`;
            setPublished(false);
            setPublishedPostId(null);
            setError(err);
            setStatus(null);
            persistPublishState({
              publishedAt: undefined,
              publishedPostId: undefined,
              publishStatusMessage: undefined,
              publishError: err,
            });
            return;
          }
          const postStatus = String(res.data?.status ?? '').toUpperCase();
          if (postStatus === 'FAILED') {
            const err = `Publish failed on ${draft.platformLabel}. Open History for details.`;
            setPublished(false);
            setPublishedPostId(null);
            setError(err);
            setStatus(null);
            persistPublishState({
              publishError: err,
              publishStatusMessage: undefined,
              publishedAt: undefined,
              publishedPostId: undefined,
            });
            return;
          }
        } catch {
          /* keep polling */
        }
      }
    })();
  };

  const buildPostPayload = (resolvedMediaType: string, media: { fileUrl: string; type: string }[]) => {
    const platformUpper = draft.platform.toUpperCase();
    return {
      content: draft.caption,
      mediaType: resolvedMediaType === 'text' ? 'text' : resolvedMediaType,
      media,
      targets: [{ platform: draft.platform, socialAccountId: draft.accountId }],
      ...(platformUpper === 'THREADS' && threadsShareToInstagram
        ? { threadsShareToInstagram: true }
        : {}),
      ...((platformUpper === 'INSTAGRAM' || platformUpper === 'FACEBOOK') && alsoPostToStory
        ? { alsoPostToStory: true }
        : {}),
    };
  };

  const handlePublish = async () => {
    console.log('[AI Chat Publish Debug]', {
      canPublishFromChat: draft.canPublishFromChat,
      publishing,
      published,
      scheduled,
      platform: draft.platform,
      caption: draft.caption?.slice(0, 50),
      storedPublish,
    });
    if (!draft.canPublishFromChat || publishing || published || scheduled) {
      console.log('[AI Chat Publish] Blocked by conditions:', {
        canPublishFromChat: draft.canPublishFromChat,
        publishing,
        published,
        scheduled,
      });
      return;
    }
    console.log('[AI Chat Publish] Starting publish...');
    setPublishing(true);
    setError(null);
    setStatus(null);
    const media = resolveDraftMediaForPublish(draft);
    console.log('[AI Chat Publish] Media check:', {
      mediaLength: media.length,
      platform: draft.platform.toUpperCase(),
      mediaType: draft.mediaType,
      requiresMedia: (draft.platform.toUpperCase() === 'THREADS' || draft.mediaType === 'photo' || draft.mediaType === 'video'),
      media: media.map(m => ({ fileUrl: m.fileUrl?.slice(0, 50), type: m.type })),
    });
    if (
      (draft.mediaType === 'photo' || draft.mediaType === 'video') &&
      media.length === 0
    ) {
      console.log('[AI Chat Publish] BLOCKED: Media missing for photo/video post');
      setError(
        'Media is missing from this draft. Re-attach the image in chat or use Open Composer, then try again.'
      );
      setPublishing(false);
      return;
    }
    const resolvedMediaType =
      media.length > 0
        ? media[0].type === 'VIDEO'
          ? 'video'
          : 'photo'
        : draft.mediaType;
    try {
      console.log('[AI Chat Publish] Creating post via API...');
      const createRes = await api.post<{ id: string }>('/posts', buildPostPayload(resolvedMediaType, media));
      console.log('[AI Chat Publish] Post created:', { postId: createRes.data?.id });
      const postId = createRes.data?.id;
      if (!postId) {
        throw new Error('Post was created but no id was returned. Try History or Composer.');
      }
      console.log('[AI Chat Publish] Starting publish via API...');
      await api.post(`/posts/${postId}/publish`, {
        ...(threadsShareToInstagram ? { threadsShareToInstagram: true } : {}),
        ...(alsoPostToStory ? { alsoPostToStory: true } : {}),
      });
      console.log('[AI Chat Publish] Publish API call completed');
      setPublishedPostId(postId);
      setPublished(true);
      setConfirming(false);
      setScheduling(false);
      const statusMessage =
        threadsShareToInstagram || alsoPostToStory
          ? 'Publishing started (including Story). Check History for live status.'
          : 'Publishing started. Check History for live status.';
      setStatus(statusMessage);
      persistPublishState({
        publishedAt: new Date().toISOString(),
        publishedPostId: postId,
        publishStatusMessage: statusMessage,
        publishError: undefined,
      });
      watchPublishOutcome(postId);
    } catch (e) {
      const msg = friendlyIzopChatError(e, 'Could not publish. Try Open Composer or History.');
      const displayMsg =
        /threads session expired|invalid oauth|reconnect threads/i.test(msg)
          ? `${msg} Go to Account, disconnect Threads, reconnect, then try Allow again.`
          : msg;
      setError(displayMsg);
      persistPublishState({
        publishError: displayMsg,
        publishStatusMessage: undefined,
      });
    } finally {
      setPublishing(false);
    }
  };

  const handleSchedule = async () => {
    if (!draft.canPublishFromChat || publishing || published || scheduled || !scheduleAt) return;
    setPublishing(true);
    setError(null);
    setStatus(null);
    const media = resolveDraftMediaForPublish(draft);
    const resolvedMediaType =
      media.length > 0
        ? media[0].type === 'VIDEO'
          ? 'video'
          : 'photo'
        : draft.mediaType;
    try {
      const iso = new Date(scheduleAt).toISOString();
      await api.post('/posts', {
        ...buildPostPayload(resolvedMediaType, media),
        scheduledAt: iso,
        scheduleDelivery: 'auto',
      });
      setScheduled(true);
      setConfirming(false);
      setScheduling(false);
      const statusMessage = `Scheduled for ${new Date(scheduleAt).toLocaleString()}.${
        threadsShareToInstagram || alsoPostToStory ? ' Story sharing is included.' : ''
      } Preview on Calendar or History anytime.`;
      setStatus(statusMessage);
      persistPublishState({
        scheduledAt: new Date(scheduleAt).toISOString(),
        publishStatusMessage: statusMessage,
        publishError: undefined,
      });
    } catch (e) {
      const msg = friendlyIzopChatError(e, 'Could not schedule. Try Calendar or Composer.');
      setError(msg);
      persistPublishState({
        publishError: msg,
        publishStatusMessage: undefined,
      });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 overflow-hidden text-sm shadow-sm">
      <div className={`px-3 py-2 flex items-center justify-between gap-2 ${accent}`}>
        <div className="min-w-0 flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-white/15 overflow-hidden shrink-0 flex items-center justify-center text-xs font-semibold">
            {(() => {
              const src =
                avatarDisplayUrl(draft.platform, accountDisplay.profilePicture) ||
                draftMediaDisplayUrl(accountDisplay.profilePicture) ||
                undefined;
              return src ? (
                <img src={src} alt="" className="w-full h-full object-cover" />
              ) : (
                accountDisplay.username.slice(0, 1).toUpperCase()
              );
            })()}
          </div>
          <div className="min-w-0">
            <p className="font-semibold truncate">{accountDisplay.username}</p>
            <p className="text-[11px] opacity-90 truncate">
              {accountDisplay.handle} · {draft.platformLabel}
            </p>
          </div>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide font-semibold opacity-90">
          {draft.mediaType === 'text' ? 'Text post' : draft.mediaType}
        </span>
      </div>

      <div className="p-3 border-b border-neutral-100 dark:border-neutral-800">
        <p className="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500 mb-1.5">
          Preview
        </p>
        <IzopPostDraftPreview
          platform={draft.platform}
          account={accountDisplay}
          caption={draft.caption}
          mediaType={draft.mediaType}
          media={previewMediaForCard}
        />
      </div>

      {draft.canPublishFromChat && !published && !scheduled ? (
        <div className="px-3 pb-2 space-y-2 border-b border-neutral-100 dark:border-neutral-800">
          {draft.platform.toUpperCase() === 'THREADS' && draft.mediaType !== 'text' ? (
            <ChatDraftStoryOption
              checked={threadsShareToInstagram}
              disabled={publishing}
              eligible={threadsStoryOption.eligible}
              label={THREADS_INSTAGRAM_STORY_LABEL}
              description={THREADS_INSTAGRAM_STORY_DESCRIPTION}
              hint={threadsStoryOption.hint}
              onChange={setThreadsShareToInstagram}
            />
          ) : null}
          {draft.platform.toUpperCase() === 'INSTAGRAM' || draft.platform.toUpperCase() === 'FACEBOOK' ? (
            <ChatDraftStoryOption
              checked={alsoPostToStory}
              disabled={publishing}
              eligible={metaStoryOption.eligible}
              label={metaAlsoStoryLabel(draft.platform)}
              description={metaAlsoStoryDescription(draft.platform)}
              hint={metaStoryOption.hint}
              onChange={setAlsoPostToStory}
            />
          ) : null}
        </div>
      ) : null}

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
                {threadsShareToInstagram ? (
                  <span className="block mt-1 text-[11px] text-neutral-500">
                    Instagram Story sharing is enabled for this Threads post.
                  </span>
                ) : null}
                {alsoPostToStory ? (
                  <span className="block mt-1 text-[11px] text-neutral-500">
                    {metaAlsoStoryLabel(draft.platform)} is enabled.
                  </span>
                ) : null}
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
            draft={composerDraftWithStoryFlags ?? draft.sessionDraft ?? null}
            label="Open Composer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--primary)] hover:underline"
          />
        ) : null}
      </div>

      {status ? (
        <div className="px-3 pb-3 space-y-1.5">
          <p className="text-xs text-emerald-700 dark:text-emerald-300">{status}</p>
          {published || scheduled ? (
            <div className="flex flex-wrap gap-3 text-xs">
              {scheduled ? (
                <Link href="/calendar" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline">
                  Open Calendar <ExternalLink size={12} />
                </Link>
              ) : null}
              <Link
                href={publishedPostId ? `/posts?highlight=${encodeURIComponent(publishedPostId)}` : '/posts'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 font-medium text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/40"
              >
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
