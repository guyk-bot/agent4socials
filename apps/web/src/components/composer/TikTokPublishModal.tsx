'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import type { TikTokCreatorInfoData, TikTokDirectPostPayload } from '@/lib/tiktok/tiktok-publish-compliance';
import { TIKTOK_PRIVACY_LABELS } from '@/lib/tiktok/tiktok-publish-compliance';
import { X, Loader2 } from 'lucide-react';

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
  const [loadingCreator, setLoadingCreator] = useState(false);
  const [formById, setFormById] = useState<Record<string, FormState>>({});
  const [videoDurationSec, setVideoDurationSec] = useState<number | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeAccount = accounts[activeIdx];
  const activeId = activeAccount?.id;

  const loadCreator = useCallback(async (accountId: string) => {
    setLoadingCreator(true);
    setCreatorErrorById((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    try {
      const res = await api.get<{ creator?: TikTokCreatorInfoData; message?: string }>(`/social/accounts/${accountId}/tiktok-creator-info`);
      const c = res.data?.creator;
      if (!c) {
        setCreatorById((prev) => ({ ...prev, [accountId]: null }));
        setCreatorErrorById((prev) => ({ ...prev, [accountId]: res.data?.message || 'Could not load TikTok account options.' }));
        return;
      }
      setCreatorById((prev) => ({ ...prev, [accountId]: c }));
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? String((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? 'Request failed')
          : 'Could not load TikTok creator info.';
      setCreatorErrorById((prev) => ({ ...prev, [accountId]: msg }));
      setCreatorById((prev) => ({ ...prev, [accountId]: null }));
    } finally {
      setLoadingCreator(false);
    }
  }, []);

  useEffect(() => {
    if (!open || accounts.length === 0) return;
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
    void Promise.all(accounts.map((a) => loadCreator(a.id)));
  }, [open, accounts, defaultCaption, initialByAccountId, loadCreator]);

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
      if (typeof maxDur === 'number' && maxDur > 0 && typeof videoDurationSec === 'number' && videoDurationSec > maxDur + 0.5) {
        setSubmitError(`This video is longer than TikTok allows for this account (${maxDur}s). Use a shorter clip.`);
        return;
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
  const privacyOptions = ci?.privacy_level_options ?? [];

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
          className="pointer-events-auto relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-6 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 mb-4">
            <h2 id="tiktok-modal-title" className="text-lg font-semibold text-neutral-900">
              Post to TikTok
            </h2>
            <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-600 p-1" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <p className="text-sm text-neutral-600 mb-4">
            TikTok requires you to choose visibility, interaction settings, and commercial disclosure before we upload. Processing on TikTok&apos;s side can take a short time after upload.
          </p>

          {accounts.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {accounts.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${i === activeIdx ? 'bg-orange-700 text-white border-orange-700' : 'border-neutral-200 text-neutral-700 hover:bg-orange-50 hover:border-orange-200'}`}
                >
                  {a.username ? `@${a.username.replace(/^@/, '')}` : `Account ${i + 1}`}
                </button>
              ))}
            </div>
          )}

          {videoPreviewSrc ? (
            <div className="mb-4 rounded-lg overflow-hidden bg-neutral-100 border border-neutral-200 aspect-[9/16] max-h-48 mx-auto flex items-center justify-center">
              <video
                src={videoPreviewSrc}
                poster={videoPosterSrc || undefined}
                className="max-h-full max-w-full object-contain bg-neutral-900/5"
                muted
                playsInline
                controls
                preload="metadata"
              />
            </div>
          ) : null}

          {loadingCreator && !ci ? (
            <div className="flex items-center justify-center py-12 text-neutral-500 gap-2">
              <Loader2 className="animate-spin" size={22} />
              <span className="text-sm">Loading TikTok options…</span>
            </div>
          ) : creatorErrorById[activeId ?? ''] ? (
            <p className="text-sm text-red-600 py-4">{creatorErrorById[activeId ?? '']}</p>
          ) : f && activeId && ci ? (
            <div className="space-y-4">
              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Title / caption (TikTok)</span>
                <textarea
                  value={f.title}
                  onChange={(e) => updateForm(activeId, { title: e.target.value.slice(0, 2200) })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-neutral-700">Visibility</span>
                <select
                  value={f.privacyLevel}
                  onChange={(e) => updateForm(activeId, { privacyLevel: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm accent-orange-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 focus:border-orange-500 bg-white"
                >
                  <option value="">Choose visibility</option>
                  {privacyOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {TIKTOK_PRIVACY_LABELS[opt] ?? opt}
                    </option>
                  ))}
                </select>
              </label>

              <div className="space-y-2">
                <span className="text-xs font-medium text-neutral-700">Interactions (off by default)</span>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.allowComment}
                    disabled={Boolean(ci.comment_disabled)}
                    onChange={(e) => updateForm(activeId, { allowComment: e.target.checked })}
                    className="rounded border-neutral-300 accent-orange-600"
                  />
                  <span className={ci.comment_disabled ? 'text-neutral-400' : ''}>Allow comments</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.allowDuet}
                    disabled={Boolean(ci.duet_disabled)}
                    onChange={(e) => updateForm(activeId, { allowDuet: e.target.checked })}
                    className="rounded border-neutral-300 accent-orange-600"
                  />
                  <span className={ci.duet_disabled ? 'text-neutral-400' : ''}>Allow duet</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={f.allowStitch}
                    disabled={Boolean(ci.stitch_disabled)}
                    onChange={(e) => updateForm(activeId, { allowStitch: e.target.checked })}
                    className="rounded border-neutral-300 accent-orange-600"
                  />
                  <span className={ci.stitch_disabled ? 'text-neutral-400' : ''}>Allow stitch</span>
                </label>
              </div>

              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={f.commercialDisclosureOn}
                    onChange={(e) =>
                      updateForm(activeId, {
                        commercialDisclosureOn: e.target.checked,
                        ...(e.target.checked ? {} : { yourBrand: false, brandedContent: false }),
                      })
                    }
                    className="rounded border-neutral-300 accent-orange-600"
                  />
                  Commercial content disclosure
                </label>
                {f.commercialDisclosureOn ? (
                  <div className="pl-6 space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={f.yourBrand}
                        onChange={(e) => updateForm(activeId, { yourBrand: e.target.checked })}
                        className="rounded border-neutral-300 accent-orange-600"
                      />
                      Your brand
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={f.brandedContent}
                        onChange={(e) => updateForm(activeId, { brandedContent: e.target.checked })}
                        className="rounded border-neutral-300 accent-orange-600"
                      />
                      Branded content
                    </label>
                    <p className="text-[11px] text-neutral-500 leading-snug" title="TikTok Content Sharing Guidelines">
                      If you promote yourself, a third party, or a product, turn this on and select the options that match your video. Branded content cannot be set to Only me.
                    </p>
                  </div>
                ) : null}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={f.userConsentedToPublish}
                  onChange={(e) => updateForm(activeId, { userConsentedToPublish: e.target.checked })}
                  className="rounded border-neutral-300 accent-orange-600 mt-0.5"
                />
                <span>
                  {f.commercialDisclosureOn
                    ? 'I confirm the commercial disclosure above is accurate and I agree to TikTok terms for posting this content.'
                    : 'I agree to TikTok Music Usage Confirmation and terms for posting this content.'}
                </span>
              </label>
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
              disabled={loadingCreator || Boolean(activeId && creatorErrorById[activeId])}
              className="px-5 py-2.5 text-sm font-semibold rounded-full text-white shadow-md disabled:opacity-50 disabled:shadow-none gradient-cta-pro"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
