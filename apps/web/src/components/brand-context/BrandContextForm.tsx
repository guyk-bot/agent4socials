'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle, MessagesSquare, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { GlassButton } from '@/components/ui/GlassButton';
import {
  brandContextToFormFields,
  BRAND_CONTEXT_CLEARED_EVENT,
  EMPTY_BRAND_CONTEXT,
  hasComposerBrandContext,
  parseBrandContextApiPayload,
  readBrandContextCache,
  readBrandContextCacheHasContent,
  writeBrandContextCache,
  writeComposerBrandReadyCache,
  markBrandContextSaved,
  shouldApplyRemoteBrandContext,
  type BrandContextRecord,
} from '@/lib/brand-context-utils';
import HashtagPoolSection from '@/components/brand-context/HashtagPoolSection';

const MAX_LENGTH = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
  inboxReplyExamples: 1000,
  commentReplyExamples: 1000,
} as const;

function formFromCache(userId?: string | null): Required<BrandContextRecord> {
  const cached = readBrandContextCache(userId);
  if (!cached) return EMPTY_BRAND_CONTEXT;
  return brandContextToFormFields(cached);
}

type BrandContextVariant = 'page' | 'drawer' | 'full';

type Props = {
  variant?: BrandContextVariant;
};

function isDarkVariant(variant: BrandContextVariant) {
  return variant === 'drawer' || variant === 'full';
}

function labelClass(variant: BrandContextVariant) {
  return isDarkVariant(variant)
    ? 'text-sm font-medium text-neutral-200'
    : 'text-sm font-medium text-gray-700';
}

function counterClass(variant: BrandContextVariant) {
  return isDarkVariant(variant)
    ? 'text-xs font-normal text-neutral-500'
    : 'text-xs font-normal text-gray-500';
}

function textareaClass(variant: BrandContextVariant, minH: string) {
  const base = `w-full rounded-lg border px-3 py-2.5 text-sm ${minH}`;
  return isDarkVariant(variant)
    ? `${base} border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]`
    : `${base} border-gray-300`;
}

function sectionClass(variant: BrandContextVariant) {
  return isDarkVariant(variant)
    ? 'rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5'
    : 'card p-6';
}

function headingClass(variant: BrandContextVariant) {
  return isDarkVariant(variant)
    ? 'font-semibold text-neutral-100'
    : 'font-semibold text-gray-900';
}

function bodyTextClass(variant: BrandContextVariant) {
  return isDarkVariant(variant) ? 'text-sm text-neutral-400' : 'text-sm text-gray-500';
}

function messageBoxClass(type: 'success' | 'warning' | 'error', variant: BrandContextVariant) {
  if (isDarkVariant(variant)) {
    if (type === 'success') return 'rounded-lg px-4 py-3 text-sm mb-4 bg-emerald-950/50 text-emerald-200 border border-emerald-900';
    if (type === 'warning') return 'rounded-lg px-4 py-3 text-sm mb-4 bg-amber-950/50 text-amber-200 border border-amber-900';
    return 'rounded-lg px-4 py-3 text-sm mb-4 bg-red-950/50 text-red-200 border border-red-900';
  }
  if (type === 'success') return 'rounded-lg px-4 py-3 text-sm mb-4 bg-green-50 text-green-800';
  if (type === 'warning') return 'rounded-lg px-4 py-3 text-sm mb-4 bg-amber-50 text-amber-800';
  return 'rounded-lg px-4 py-3 text-sm mb-4 bg-red-50 text-red-800';
}

export default function BrandContextForm({ variant = 'page' }: Props) {
  const { user } = useAuth();
  const [form, setForm] = useState<Required<BrandContextRecord>>(() => formFromCache());
  const [hydratedFromCache, setHydratedFromCache] = useState(() => readBrandContextCacheHasContent());
  const [loadFailed, setLoadFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const saveSeqRef = useRef(0);
  const lastEditAtRef = useRef(0);

  const touchEdit = useCallback(() => {
    lastEditAtRef.current = Date.now();
  }, []);

  const applyBrandContext = useCallback(
    (data: ReturnType<typeof parseBrandContextApiPayload>) => {
      setForm(brandContextToFormFields(data));
      writeComposerBrandReadyCache(hasComposerBrandContext(data));
      if (user?.id) writeBrandContextCache(data, user.id);
      setHydratedFromCache(true);
    },
    [user?.id]
  );

  useEffect(() => {
    const onCleared = () => {
      setForm(EMPTY_BRAND_CONTEXT);
      setHydratedFromCache(false);
      setMessage(null);
    };
    window.addEventListener(BRAND_CONTEXT_CLEARED_EVENT, onCleared);
    return () => window.removeEventListener(BRAND_CONTEXT_CLEARED_EVENT, onCleared);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const fetchStartedAt = Date.now();
    const cached = readBrandContextCache(user.id);
    if (cached) applyBrandContext(cached);

    fetchAbortRef.current?.abort();
    const ctrl = new AbortController();
    fetchAbortRef.current = ctrl;
    api
      .get('/ai/brand-context', { signal: ctrl.signal, timeout: 30_000 })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        if (lastEditAtRef.current > fetchStartedAt) return;
        if (!shouldApplyRemoteBrandContext(fetchStartedAt)) return;
        setLoadFailed(false);
        applyBrandContext(parseBrandContextApiPayload(res.data));
      })
      .catch((err: { response?: { status?: number }; code?: string; name?: string }) => {
        if (err.code === 'ERR_CANCELED' || err.name === 'CanceledError') return;
        if (readBrandContextCacheHasContent(user.id)) {
          setLoadFailed(false);
          return;
        }
        setLoadFailed(true);
        if (err.response?.status === 401) {
          setMessage({ type: 'error', text: 'Please log in again to load your saved context.' });
        } else {
          setMessage({
            type: 'warning',
            text: 'Could not refresh from the server. Your last saved copy is shown. Try again later or refresh the page.',
          });
        }
      });
    return () => ctrl.abort();
  }, [user?.id, applyBrandContext]);

  const savePayload = (source: Required<BrandContextRecord>): BrandContextRecord => ({
    targetAudience: source.targetAudience || null,
    toneOfVoice: source.toneOfVoice || null,
    toneExamples: source.toneExamples || null,
    productDescription: source.productDescription || null,
    additionalContext: source.additionalContext || null,
    inboxReplyExamples: source.inboxReplyExamples || null,
    commentReplyExamples: source.commentReplyExamples || null,
  });

  const persistBrandContext = useCallback(
    (payload: BrandContextRecord, opts?: { successText?: string; nextForm?: Required<BrandContextRecord> }) => {
      const seq = ++saveSeqRef.current;
      setMessage(null);
      markBrandContextSaved();
      fetchAbortRef.current?.abort();

      if (opts?.nextForm) {
        setForm(opts.nextForm);
      }

      if (user?.id) {
        writeBrandContextCache(payload, user.id);
        writeComposerBrandReadyCache(hasComposerBrandContext(payload));
        setHydratedFromCache(true);
      }

      setMessage({ type: 'success', text: opts?.successText ?? 'Saved.' });
      setSyncing(true);

      const doPut = () => api.put('/ai/brand-context', payload, { timeout: 30_000 });

      const finishSync = () => {
        if (seq === saveSeqRef.current) setSyncing(false);
      };

      doPut()
        .then((res) => {
          if (seq !== saveSeqRef.current) return;
          markBrandContextSaved();
          if (user?.id) {
            writeBrandContextCache(parseBrandContextApiPayload(res.data), user.id);
          }
        })
        .catch((err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
          if (seq !== saveSeqRef.current) return;
          const status = err.response?.status;
          const msg =
            err.response?.data?.message ||
            (status === 401
              ? 'Please log in again.'
              : status === 503
                ? 'Service unavailable. Try again later.'
                : status === 500
                  ? 'Server error. Try again in a moment or log out and back in.'
                  : err.message || 'Failed to sync to the server.');

          if (status === 500 || status === undefined) {
            window.setTimeout(() => {
              if (seq !== saveSeqRef.current) return;
              doPut()
                .then((res) => {
                  if (seq !== saveSeqRef.current) return;
                  markBrandContextSaved();
                  if (user?.id) writeBrandContextCache(parseBrandContextApiPayload(res.data), user.id);
                  setMessage({ type: 'success', text: opts?.successText ?? 'Saved.' });
                })
                .catch((retryErr: { response?: { data?: { message?: string } }; message?: string }) => {
                  if (seq !== saveSeqRef.current) return;
                  const retryMsg = retryErr.response?.data?.message || retryErr.message || msg;
                  setMessage({
                    type: 'error',
                    text: `${retryMsg} Your edits are kept on this device. Click Save to retry.`,
                  });
                })
                .finally(finishSync);
            }, 1500);
            return;
          }

          setMessage({
            type: 'error',
            text: `${msg} Your edits are kept on this device. Click Save to retry.`,
          });
        })
        .finally(finishSync);
    },
    [user?.id]
  );

  const handleSave = () => {
    if (loadFailed && !hydratedFromCache) {
      setMessage({
        type: 'warning',
        text: 'Your saved context did not load. Refresh the page first so you do not overwrite existing data.',
      });
      return;
    }
    persistBrandContext(savePayload(form));
  };

  const handleDeleteAll = () => {
    if (
      !window.confirm(
        'Delete all brand context? This clears product, audience, tone, reply examples, and related AI settings.'
      )
    ) {
      return;
    }
    touchEdit();
    persistBrandContext(savePayload(EMPTY_BRAND_CONTEXT), {
      nextForm: EMPTY_BRAND_CONTEXT,
      successText: 'All brand context deleted.',
    });
  };

  const footerClass = `pt-6 mt-6 border-t flex flex-wrap items-center justify-end gap-3 ${
    isDarkVariant(variant) ? 'border-neutral-800' : 'border-gray-100'
  }`;

  const updateField = <K extends keyof BrandContextRecord>(key: K, value: string | null) => {
    touchEdit();
    setForm((f) => ({ ...f, [key]: value }));
  };

  return (
    <div className={isDarkVariant(variant) ? 'space-y-5' : 'flex flex-col flex-1 min-h-0'}>
      {variant !== 'page' ? (
        <p className={bodyTextClass(variant)}>
          Teach the AI about your brand voice, audience, reply style, and saved hashtags. Brand and reply settings apply to
          iZop AI, Composer, and Inbox drafts.
        </p>
      ) : null}

      {message ? (
        <div className={messageBoxClass(message.type, variant)}>
          <p>{message.text}</p>
          {message.type === 'error' ? (
            <GlassButton variant="secondary" size="sm" className="mt-3" onClick={handleSave} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Try again'}
            </GlassButton>
          ) : null}
        </div>
      ) : null}

      <div className={`${sectionClass(variant)} ${variant === 'page' ? 'flex-1 flex flex-col min-h-0' : ''}`}>
        <h2 className={`${headingClass(variant)} mb-4`}>Brand context</h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
          <div className="flex flex-col">
            <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
              Target audience
              <span className={counterClass(variant)}>
                {(form.targetAudience ?? '').length}/{MAX_LENGTH.targetAudience}
              </span>
            </label>
            <textarea
              value={form.targetAudience ?? ''}
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_LENGTH.targetAudience);
                updateField('targetAudience', v || null);
              }}
              placeholder="e.g. Small business owners, 25-45..."
              rows={7}
              maxLength={MAX_LENGTH.targetAudience}
              className={textareaClass(variant, 'min-h-[160px]')}
            />
          </div>
          <div className="flex flex-col">
            <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
              Product or service description
              <span className={counterClass(variant)}>
                {(form.productDescription ?? '').length}/{MAX_LENGTH.productDescription}
              </span>
            </label>
            <textarea
              value={form.productDescription ?? ''}
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_LENGTH.productDescription);
                updateField('productDescription', v || null);
              }}
              placeholder="What you offer in one or two sentences"
              rows={7}
              maxLength={MAX_LENGTH.productDescription}
              className={textareaClass(variant, 'min-h-[160px]')}
            />
          </div>

          <div className="flex flex-col">
            <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
              Tone of voice
              <span className={counterClass(variant)}>
                {(form.toneOfVoice ?? '').length}/{MAX_LENGTH.toneOfVoice}
              </span>
            </label>
            <textarea
              value={form.toneOfVoice ?? ''}
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_LENGTH.toneOfVoice);
                updateField('toneOfVoice', v || null);
              }}
              placeholder="e.g. Professional but friendly, concise"
              rows={5}
              maxLength={MAX_LENGTH.toneOfVoice}
              className={textareaClass(variant, 'min-h-[120px]')}
            />
          </div>
          <div className="flex flex-col">
            <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
              Tone examples (optional)
              <span className={counterClass(variant)}>
                {(form.toneExamples ?? '').length}/{MAX_LENGTH.toneExamples}
              </span>
            </label>
            <textarea
              value={form.toneExamples ?? ''}
              onChange={(e) => {
                const v = e.target.value.slice(0, MAX_LENGTH.toneExamples);
                updateField('toneExamples', v || null);
              }}
              placeholder="Paste 1-3 example phrases that match the tone you want"
              rows={5}
              maxLength={MAX_LENGTH.toneExamples}
              className={textareaClass(variant, 'min-h-[120px]')}
            />
          </div>
        </div>

        <div className="mt-6">
          <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
            Additional context (optional)
            <span className={counterClass(variant)}>
              {(form.additionalContext ?? '').length}/{MAX_LENGTH.additionalContext}
            </span>
          </label>
          <textarea
            value={form.additionalContext ?? ''}
            onChange={(e) => {
              const v = e.target.value.slice(0, MAX_LENGTH.additionalContext);
              updateField('additionalContext', v || null);
            }}
            placeholder="Brand values, key messages, hashtags you often use..."
            rows={4}
            maxLength={MAX_LENGTH.additionalContext}
            className={textareaClass(variant, 'min-h-[100px]')}
          />
        </div>
      </div>

      <div className={sectionClass(variant)}>
        <div className="flex items-start gap-3 mb-4">
          <MessageCircle size={22} className="text-[var(--button)] shrink-0 mt-0.5" />
          <div>
            <h2 className={headingClass(variant)}>Inbox reply examples</h2>
            <p className={`${bodyTextClass(variant)} mt-0.5`}>
              Paste 2-5 example DM replies you would send to customers. The AI will match your style when drafting inbox
              replies. <strong className={isDarkVariant(variant) ? 'text-neutral-200' : 'text-gray-700'}>Required</strong>{' '}
              to enable the AI draft button in the Inbox.
            </p>
          </div>
        </div>
        <div className="flex flex-col">
          <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
            Example inbox replies
            <span className={counterClass(variant)}>
              {(form.inboxReplyExamples ?? '').length}/{MAX_LENGTH.inboxReplyExamples}
            </span>
          </label>
          <textarea
            value={form.inboxReplyExamples ?? ''}
            onChange={(e) => {
              const v = e.target.value.slice(0, MAX_LENGTH.inboxReplyExamples);
              updateField('inboxReplyExamples', v || null);
            }}
            placeholder={
              "Example 1: Hi! Thanks for reaching out. We ship within 2-3 business days.\nExample 2: Hey, so glad you love it! Let us know if you need anything else.\nExample 3: Thanks for your message! We'll get back to you shortly."
            }
            rows={7}
            maxLength={MAX_LENGTH.inboxReplyExamples}
            className={textareaClass(variant, 'min-h-[160px]')}
          />
        </div>
        {!form.inboxReplyExamples?.trim() ? (
          <p
            className={`mt-2 text-xs rounded-lg px-3 py-2 border ${
              isDarkVariant(variant)
                ? 'text-amber-200 bg-amber-950/40 border-amber-900'
                : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}
          >
            AI draft replies in the Inbox are disabled until you add examples here and save.
          </p>
        ) : null}
      </div>

      <div className={sectionClass(variant)}>
        <div className="flex items-start gap-3 mb-4">
          <MessagesSquare size={22} className="text-[var(--button)] shrink-0 mt-0.5" />
          <div>
            <h2 className={headingClass(variant)}>Comment reply examples</h2>
            <p className={`${bodyTextClass(variant)} mt-0.5`}>
              Paste 2-5 example comment replies you would post. The AI will match your style when drafting comment replies
              in the Inbox. <strong className={isDarkVariant(variant) ? 'text-neutral-200' : 'text-gray-700'}>Required</strong>{' '}
              to enable AI drafts for comments.
            </p>
          </div>
        </div>
        <div className="flex flex-col">
          <label className={`flex items-center justify-between ${labelClass(variant)} mb-2`}>
            Example comment replies
            <span className={counterClass(variant)}>
              {(form.commentReplyExamples ?? '').length}/{MAX_LENGTH.commentReplyExamples}
            </span>
          </label>
          <textarea
            value={form.commentReplyExamples ?? ''}
            onChange={(e) => {
              const v = e.target.value.slice(0, MAX_LENGTH.commentReplyExamples);
              updateField('commentReplyExamples', v || null);
            }}
            placeholder={
              "Example 1: Thank you so much! We're really happy to hear that.\nExample 2: Great question! Feel free to DM us for details.\nExample 3: Love the support! Stay tuned for more updates."
            }
            rows={7}
            maxLength={MAX_LENGTH.commentReplyExamples}
            className={textareaClass(variant, 'min-h-[160px]')}
          />
        </div>
        {!form.commentReplyExamples?.trim() ? (
          <p
            className={`mt-2 text-xs rounded-lg px-3 py-2 border ${
              isDarkVariant(variant)
                ? 'text-amber-200 bg-amber-950/40 border-amber-900'
                : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}
          >
            AI draft replies for comments are disabled until you add examples here and save.
          </p>
        ) : null}
      </div>

      <HashtagPoolSection variant={variant} />

      <div className={footerClass}>
        {syncing ? (
          <span className={`text-xs ${isDarkVariant(variant) ? 'text-neutral-500' : 'text-gray-500'}`}>
            Syncing to server…
          </span>
        ) : null}
        <GlassButton variant="secondary" size="md" onClick={handleDeleteAll} disabled={syncing}>
          <Trash2 size={16} />
          Delete all
        </GlassButton>
        <GlassButton variant="primary" size="md" onClick={handleSave} disabled={syncing}>
          Save
        </GlassButton>
      </div>
    </div>
  );
}
