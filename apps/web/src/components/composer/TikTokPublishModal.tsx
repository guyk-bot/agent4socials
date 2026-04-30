'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import type { TikTokCreatorInfoData, TikTokDirectPostPayload } from '@/lib/tiktok/tiktok-publish-compliance';
import { TIKTOK_PRIVACY_LABELS } from '@/lib/tiktok/tiktok-publish-compliance';
import { X, Loader2, ChevronDown } from 'lucide-react';

export type TikTokModalAccount = { id: string; username?: string | null };

type FormState = {
  title: string;
  privacyLevel: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  commercialDisclosureOn: boolean;
  yourBrand: boolean;
  brandedContent: boolean;
  userConsentedToPublish: boolean;
};

const defaultForm = (titleSeed: string): FormState => ({
  title: titleSeed.slice(0, 2200),
  privacyLevel: '',
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercialDisclosureOn: false,
  yourBrand: false,
  brandedContent: false,
  userConsentedToPublish: false,
});

function formToPayload(f: FormState): TikTokDirectPostPayload {
  return {
    title: f.title.trim().slice(0, 2200),
    privacyLevel: f.privacyLevel,
    allowComment: f.allowComment,
    allowDuet: f.allowDuet,
    allowStitch: f.allowStitch,
    commercialDisclosureOn: f.commercialDisclosureOn,
    yourBrand: f.yourBrand,
    brandedContent: f.brandedContent,
    userConsentedToPublish: f.userConsentedToPublish,
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (payloads: Record<string, TikTokDirectPostPayload>) => void;
  accounts: TikTokModalAccount[];
  defaultCaption: string;
  videoPreviewSrc: string;
  /** Optional poster (e.g. custom thumbnail) so preview shows an image before video loads. */
  videoPosterSrc?: string;
  initialByAccountId?: Record<string, TikTokDirectPostPayload>;
};

export function TikTokPublishModal({
  open,
  onClose,
  onConfirm,
  accounts,
  defaultCaption,
  videoPreviewSrc,
  videoPosterSrc,
  initialByAccountId,
}: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [creatorById, setCreatorById] = useState<Record<string, TikTokCreatorInfoData | null>>({});
  const [creatorErrorById, setCreatorErrorById] = useState<Record<string, string>>({});
  const [loadingCreatorById, setLoadingCreatorById] = useState<Record<string, boolean>>({});
  const [formById, setFormById] = useState<Record<string, FormState>>({});
  const [videoDurationSec, setVideoDurationSec] = useState<number | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const initializedAccountsKeyRef = useRef<string | null>(null);

  const activeAccount = accounts[activeIdx];
  const activeId = activeAccount?.id;
  const accountIdsKey = useMemo(() => accounts.map((a) => a.id).join(','), [accounts]);

  const loadCreator = useCallback(async (accountId: string) => {
    setLoadingCreatorById((prev) => ({ ...prev, [accountId]: true }));
    setCreatorErrorById((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    try {
      const res = await api.get<{ creator?: TikTokCreatorInfoData; message?: string; blockingCode?: string }>(`/social/accounts/${accountId}/tiktok-creator-info`);
      const c = res.data?.creator;
      if (!c) {
        setCreatorById((prev) => ({ ...prev, [accountId]: null }));
        const blockingMsg = res.data?.blockingCode
          ? 'TikTok says this account cannot post right now. Please try again later.'
          : undefined;
        setCreatorErrorById((prev) => ({ ...prev, [accountId]: blockingMsg || res.data?.message || 'Could not load TikTok account options.' }));
        return;
      }
      setCreatorById((prev) => ({ ...prev, [accountId]: c }));
    } catch (e: unknown) {
      const status = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { status?: number } }).response?.status
        : undefined;
      const responseMessage = e && typeof e === 'object' && 'response' in e
        ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
        : undefined;
      const msg = status === 429
        ? 'TikTok says this account cannot post right now. Please try again later.'
        : String(responseMessage ?? 'Could not load TikTok creator info.');
      setCreatorErrorById((prev) => ({ ...prev, [accountId]: msg }));
      setCreatorById((prev) => ({ ...prev, [accountId]: null }));
    } finally {
      setLoadingCreatorById((prev) => ({ ...prev, [accountId]: false }));
    }
  }, []);

  useEffect(() => {
    if (!open) {
      initializedAccountsKeyRef.current = null;
      return;
    }
    if (accounts.length === 0) return;
    if (initializedAccountsKeyRef.current === accountIdsKey) return;
    initializedAccountsKeyRef.current = accountIdsKey;
    setActiveIdx(0);
    setSubmitError(null);
    const seed = defaultCaption.trim().slice(0, 2200);
    const initial: Record<string, FormState> = {};
    for (const a of accounts) {
      const existing = initialByAccountId?.[a.id];
      initial[a.id] = existing
        ? {
            title: (existing.title || seed).slice(0, 2200),
            privacyLevel: existing.privacyLevel,
            allowComment: existing.allowComment,
            allowDuet: existing.allowDuet,
            allowStitch: existing.allowStitch,
            commercialDisclosureOn: existing.commercialDisclosureOn,
            yourBrand: existing.yourBrand,
            brandedContent: existing.brandedContent,
            userConsentedToPublish: existing.userConsentedToPublish,
          }
        : defaultForm(seed);
    }
    setFormById(initial);
    setCreatorById({});
    setCreatorErrorById({});
    setLoadingCreatorById({});
    void Promise.all(accounts.map((a) => loadCreator(a.id)));
  }, [open, accountIdsKey, accounts, defaultCaption, initialByAccountId, loadCreator]);

  useEffect(() => {
    if (!open || !videoPreviewSrc) return;
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = videoPreviewSrc;
    const onMeta = () => {
      if (Number.isFinite(v.duration) && v.duration > 0) setVideoDurationSec(v.duration);
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('error', () => setVideoDurationSec(undefined));
    return () => {
      v.removeEventListener('loadedmetadata', onMeta);
      v.remove();
    };
  }, [open, videoPreviewSrc]);

  const updateForm = (accountId: string, patch: Partial<FormState>) => {
    setFormById((prev) => ({
      ...prev,
      [accountId]: { ...(prev[accountId] ?? defaultForm(defaultCaption)), ...patch },
    }));
  };

  const handleConfirm = () => {
    setSubmitError(null);
    const out: Record<string, TikTokDirectPostPayload> = {};
    for (const a of accounts) {
      const f = formById[a.id];
      const ci = creatorById[a.id];
      if (!f) {
        setSubmitError('Form not ready. Wait for TikTok options to load.');
        return;
      }
      if (creatorErrorById[a.id] || !ci) {
        setSubmitError(creatorErrorById[a.id] || 'TikTok account options failed to load. Close, check the connection, and try again.');
        return;
      }
      if (!f.privacyLevel) {
        setSubmitError('Choose visibility for each TikTok account.');
        setActiveIdx(accounts.findIndex((x) => x.id === a.id));
        return;
      }
      const opts = ci.privacy_level_options ?? [];
      if (!opts.includes(f.privacyLevel)) {
        setSubmitError('Selected visibility is not allowed for this account. Pick another option.');
        return;
      }
      if (f.commercialDisclosureOn && !f.yourBrand && !f.brandedContent) {
        setSubmitError('Commercial content is on: choose Your brand and/or Branded content.');
        return;
      }
      if (f.brandedContent && f.privacyLevel === 'SELF_ONLY') {
        setSubmitError('Branded content cannot be set to Only me. Change visibility or turn off Branded content.');
        return;
      }
      if (f.allowComment && ci.comment_disabled) {
        setSubmitError('Comments are disabled for this TikTok account. Turn off Allow comments.');
        return;
      }
      if (f.allowDuet && ci.duet_disabled) {
        setSubmitError('Duets are disabled for this TikTok account. Turn off Allow duet.');
        return;
      }
      if (f.allowStitch && ci.stitch_disabled) {
        setSubmitError('Stitch is disabled for this TikTok account. Turn off Allow stitch.');
        return;
      }
      if (!f.userConsentedToPublish) {
        setSubmitError('Check the consent box to publish to TikTok.');
        return;
      }
      const maxDur = ci.max_video_post_duration_sec;
      if (typeof maxDur === 'number' && maxDur > 0) {
        if (!(typeof videoDurationSec === 'number' && videoDurationSec > 0)) {
          setSubmitError(`We could not read the video duration yet. TikTok requires duration check before upload (${maxDur}s max). Wait a moment and try again.`);
          return;
        }
        if (videoDurationSec > maxDur + 0.5) {
          setSubmitError(`This video is longer than TikTok allows for this account (${maxDur}s). Use a shorter clip.`);
          return;
        }
      }
      out[a.id] = {
        ...formToPayload(f),
        ...(typeof videoDurationSec === 'number' && videoDurationSec > 0 ? { videoDurationSec } : {}),
      };
    }
    onConfirm(out);
  };

  if (!open || typeof document === 'undefined') return null;

  const ci = activeId ? creatorById[activeId] : null;
  const f = activeId ? formById[activeId] : null;
  const activeLoadingCreator = Boolean(activeId && loadingCreatorById[activeId]);
  const anyLoadingCreator = accounts.some((a) => loadingCreatorById[a.id]);
  const privacyOptions = ci?.privacy_level_options ?? [];
  const creatorDisplayName =
    (ci?.creator_nickname && ci.creator_nickname.trim()) ||
    (ci?.creator_username && `@${ci.creator_username.replace(/^@/, '')}`) ||
    (activeAccount?.username && `@${activeAccount.username.replace(/^@/, '')}`) ||
    'this TikTok account';
  const captionLength = f?.title?.length ?? 0;
  const captionMax = 2200;

  return createPortal(
    <>
      <div
        className="fixed z-[10060] min-h-screen min-h-[100dvh] w-screen bg-neutral-900/50 backdrop-blur-sm"
        style={{ top: 0, left: 0, right: 0, bottom: 0 }}
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[10061] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true" aria-labelledby="tiktok-modal-title">
        <div
          className="pointer-events-auto relative w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 md:p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 id="tiktok-modal-title" className="text-lg font-semibold text-neutral-900">
              Upload to TikTok
            </h2>
            <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          {accounts.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {accounts.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${i === activeIdx ? 'bg-neutral-900 text-white border-neutral-900' : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'}`}
                >
                  {a.username ? `@${a.username.replace(/^@/, '')}` : `Account ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {activeLoadingCreator && !ci ? (
            <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
              <Loader2 className="animate-spin" size={22} />
              <span className="text-sm">Loading TikTok options...</span>
            </div>
          ) : creatorErrorById[activeId ?? ''] ? (
            <p className="text-sm text-red-600 py-4">{creatorErrorById[activeId ?? '']}</p>
          ) : f && activeId && ci ? (
            <div className="grid grid-cols-1 md:grid-cols-[300px_1fr] gap-4 md:gap-6">
              <div className="rounded-xl overflow-hidden border border-neutral-200 bg-neutral-950 flex items-center justify-center min-h-[300px] md:min-h-[560px]">
                {videoPreviewSrc ? (
                  <video
                    src={videoPreviewSrc}
                    poster={videoPosterSrc || undefined}
                    className="h-full w-full object-contain"
                    muted
                    playsInline
                    controls
                    preload="metadata"
                  />
                ) : (
                  <p className="text-xs text-neutral-400">No video preview</p>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {ci.creator_avatar_url ? (
                      <img src={ci.creator_avatar_url} alt="" className="h-6 w-6 rounded-full object-cover border border-neutral-200" />
                    ) : (
                      <div className="h-6 w-6 rounded-full bg-neutral-300" />
                    )}
                    <span className="text-sm font-medium text-neutral-900 truncate">{creatorDisplayName}</span>
                  </div>
                  <ChevronDown size={16} className="text-neutral-500" />
                </div>

                <label className="block">
                  <span className="text-sm font-semibold text-neutral-900">Caption</span>
                  <div className="relative mt-1">
                    <textarea
                      value={f.title}
                      onChange={(e) => updateForm(activeId, { title: e.target.value.slice(0, captionMax) })}
                      rows={3}
                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 pr-14 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-cyan-500"
                      placeholder="Add a title that describes your video"
                    />
                    <span className="absolute right-3 bottom-2 text-[11px] text-neutral-500">
                      {captionLength}/{captionMax}
                    </span>
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-neutral-900">Who can view this video</span>
                  <select
                    value={f.privacyLevel}
                    onChange={(e) => updateForm(activeId, { privacyLevel: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-300 focus:border-cyan-500 bg-white"
                  >
                    <option value="">Choose visibility</option>
                    {privacyOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {TIKTOK_PRIVACY_LABELS[opt] ?? opt}
                      </option>
                    ))}
                  </select>
                </label>

                <div>
                  <span className="text-sm font-semibold text-neutral-900">Allow users to</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className={`rounded-lg border px-2 py-2 text-sm flex items-center justify-center gap-1.5 ${ci.comment_disabled ? 'border-neutral-100 text-neutral-400' : 'border-neutral-200 text-neutral-700'}`}>
                      <input
                        type="checkbox"
                        checked={f.allowComment}
                        disabled={Boolean(ci.comment_disabled)}
                        onChange={(e) => updateForm(activeId, { allowComment: e.target.checked })}
                        className="rounded border-neutral-300 accent-cyan-500"
                      />
                      Comment
                    </label>
                    <label className={`rounded-lg border px-2 py-2 text-sm flex items-center justify-center gap-1.5 ${ci.duet_disabled ? 'border-neutral-100 text-neutral-400' : 'border-neutral-200 text-neutral-700'}`}>
                      <input
                        type="checkbox"
                        checked={f.allowDuet}
                        disabled={Boolean(ci.duet_disabled)}
                        onChange={(e) => updateForm(activeId, { allowDuet: e.target.checked })}
                        className="rounded border-neutral-300 accent-cyan-500"
                      />
                      Duet
                    </label>
                    <label className={`rounded-lg border px-2 py-2 text-sm flex items-center justify-center gap-1.5 ${ci.stitch_disabled ? 'border-neutral-100 text-neutral-400' : 'border-neutral-200 text-neutral-700'}`}>
                      <input
                        type="checkbox"
                        checked={f.allowStitch}
                        disabled={Boolean(ci.stitch_disabled)}
                        onChange={(e) => updateForm(activeId, { allowStitch: e.target.checked })}
                        className="rounded border-neutral-300 accent-cyan-500"
                      />
                      Stitch
                    </label>
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">Disclose video content</p>
                      <p className="text-xs text-neutral-500 mt-0.5">Turn on to disclose promotional or sponsored content.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateForm(activeId, {
                          commercialDisclosureOn: !f.commercialDisclosureOn,
                          ...(!f.commercialDisclosureOn ? {} : { yourBrand: false, brandedContent: false }),
                        })
                      }
                      className={`relative h-6 w-11 rounded-full transition-colors ${f.commercialDisclosureOn ? 'bg-cyan-500' : 'bg-neutral-300'}`}
                      aria-pressed={f.commercialDisclosureOn}
                      aria-label="Toggle commercial disclosure"
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${f.commercialDisclosureOn ? 'translate-x-5' : 'translate-x-0.5'}`}
                      />
                    </button>
                  </div>

                  {f.commercialDisclosureOn ? (
                    <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
                      <div className="rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-900">
                        Your video may be labeled as promotional content by TikTok.
                      </div>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={f.yourBrand}
                          onChange={(e) => updateForm(activeId, { yourBrand: e.target.checked })}
                          className="mt-0.5 rounded border-neutral-300 accent-cyan-500"
                        />
                        <span>
                          <span className="font-medium text-neutral-900">Your brand</span>
                          <span className="block text-neutral-500 text-xs">You are promoting yourself or your business.</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={f.brandedContent}
                          onChange={(e) => updateForm(activeId, { brandedContent: e.target.checked })}
                          className="mt-0.5 rounded border-neutral-300 accent-cyan-500"
                        />
                        <span>
                          <span className="font-medium text-neutral-900">Branded content</span>
                          <span className="block text-neutral-500 text-xs">You are promoting another brand or third party.</span>
                        </span>
                      </label>
                    </div>
                  ) : null}
                </div>

                {typeof ci.max_video_post_duration_sec === 'number' && ci.max_video_post_duration_sec > 0 ? (
                  <p className="text-xs text-neutral-500">
                    Max video length for this account: {Math.floor(ci.max_video_post_duration_sec)} seconds.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {submitError ? <p className="text-sm text-red-600 mt-3">{submitError}</p> : null}

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-neutral-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-neutral-200 hover:bg-neutral-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={anyLoadingCreator || Boolean(activeId && creatorErrorById[activeId])}
              className="px-6 py-2.5 text-sm font-semibold rounded-md text-white bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 disabled:shadow-none"
            >
              Upload
            </button>
          </div>
          <label className="mt-3 flex items-start gap-2 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={Boolean(f?.userConsentedToPublish)}
              onChange={(e) => activeId && updateForm(activeId, { userConsentedToPublish: e.target.checked })}
              className="rounded border-neutral-300 accent-cyan-500 mt-0.5"
            />
            <span>By posting, you agree to TikTok Music Usage Confirmation and terms for posting this content.</span>
          </label>
        </div>
      </div>
    </>,
    document.body
  );
}
