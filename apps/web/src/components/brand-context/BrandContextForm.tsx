'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Sparkles, Loader2, MessageCircle, MessagesSquare } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  brandContextToFormFields,
  hasComposerBrandContext,
  parseBrandContextApiPayload,
  readBrandContextCache,
  readBrandContextCacheHasContent,
  writeBrandContextCache,
  writeComposerBrandReadyCache,
  type BrandContextRecord,
} from '@/lib/brand-context-utils';

const MAX_LENGTH = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
  inboxReplyExamples: 1000,
  commentReplyExamples: 1000,
} as const;

const defaultForm: Required<BrandContextRecord> = {
  targetAudience: null,
  toneOfVoice: null,
  toneExamples: null,
  productDescription: null,
  additionalContext: null,
  inboxReplyExamples: null,
  commentReplyExamples: null,
};

function formFromCache(userId?: string | null): Required<BrandContextRecord> {
  const cached = readBrandContextCache(userId);
  if (!cached) return defaultForm;
  return brandContextToFormFields(cached);
}

type Props = {
  variant?: 'page' | 'drawer';
};

function labelClass(variant: 'page' | 'drawer') {
  return variant === 'drawer'
    ? 'text-sm font-medium text-neutral-200'
    : 'text-sm font-medium text-gray-700';
}

function counterClass(variant: 'page' | 'drawer') {
  return variant === 'drawer'
    ? 'text-xs font-normal text-neutral-500'
    : 'text-xs font-normal text-gray-500';
}

function textareaClass(variant: 'page' | 'drawer', minH: string) {
  const base = `w-full rounded-lg border px-3 py-2.5 text-sm ${minH}`;
  return variant === 'drawer'
    ? `${base} border-neutral-700 bg-neutral-900 text-neutral-100 placeholder:text-neutral-500 focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]`
    : `${base} border-gray-300`;
}

function sectionClass(variant: 'page' | 'drawer') {
  return variant === 'drawer'
    ? 'rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:p-5'
    : 'card p-6';
}

function headingClass(variant: 'page' | 'drawer') {
  return variant === 'drawer'
    ? 'font-semibold text-neutral-100'
    : 'font-semibold text-gray-900';
}

function bodyTextClass(variant: 'page' | 'drawer') {
  return variant === 'drawer' ? 'text-sm text-neutral-400' : 'text-sm text-gray-500';
}

function messageBoxClass(type: 'success' | 'warning' | 'error', variant: 'page' | 'drawer') {
  if (variant === 'drawer') {
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

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
    if (!user?.id) return;
    const cached = readBrandContextCache(user.id);
    if (cached) applyBrandContext(cached);

    const ctrl = new AbortController();
    api
      .get('/ai/brand-context', { signal: ctrl.signal, timeout: 30_000 })
      .then((res) => {
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

  const savePayload = () => ({
    targetAudience: form.targetAudience || null,
    toneOfVoice: form.toneOfVoice || null,
    toneExamples: form.toneExamples || null,
    productDescription: form.productDescription || null,
    additionalContext: form.additionalContext || null,
    inboxReplyExamples: form.inboxReplyExamples || null,
    commentReplyExamples: form.commentReplyExamples || null,
  });

  const handleSave = () => {
    if (loadFailed && !hydratedFromCache) {
      setMessage({
        type: 'warning',
        text: 'Your saved context did not load. Refresh the page first so you do not overwrite existing data.',
      });
      return;
    }
    setSaving(true);
    setMessage(null);
    const payload = savePayload();
    if (user?.id) {
      writeBrandContextCache(payload, user.id);
      writeComposerBrandReadyCache(hasComposerBrandContext(payload));
      setHydratedFromCache(true);
    }
    let willRetry = false;
    const doPut = () => api.put('/ai/brand-context', payload);
    doPut()
      .then((res) => {
        const data = parseBrandContextApiPayload(res.data);
        applyBrandContext(data);
        setMessage({
          type: 'success',
          text:
            variant === 'drawer'
              ? 'Brand context saved.'
              : 'Brand context saved. You can use "Generate with AI" in the Composer.',
        });
      })
      .catch((err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
        const status = err.response?.status;
        const msg =
          err.response?.data?.message ||
          (status === 401
            ? 'Please log in again.'
            : status === 503
              ? 'Service unavailable. Try again later.'
              : status === 500
                ? 'Server error. Try again in a moment or log out and back in.'
                : err.message || 'Failed to save. Check your connection and try again.');
        if ((status === 500 || status === undefined) && !willRetry) {
          willRetry = true;
          setMessage({ type: 'error', text: msg + ' Retrying once in a moment…' });
          window.setTimeout(() => {
            doPut()
              .then((res) => {
                applyBrandContext(parseBrandContextApiPayload(res.data));
                setMessage({ type: 'success', text: 'Brand context saved.' });
              })
              .catch((retryErr: { response?: { data?: { message?: string } }; message?: string }) => {
                const retryMsg = retryErr.response?.data?.message || retryErr.message || msg;
                setMessage({ type: 'error', text: retryMsg + ' Click "Save brand context" again to retry.' });
              })
              .finally(() => setSaving(false));
          }, 2000);
          return;
        }
        setMessage({
          type: 'error',
          text: msg + (status === 401 ? '' : ' Click "Save brand context" again to retry.'),
        });
      })
      .finally(() => {
        if (!willRetry) setSaving(false);
      });
  };

  const saveButtonClass =
    'inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-chrome-text bg-[var(--button)] hover:bg-[var(--button-hover)] disabled:opacity-50';

  return (
    <div className={variant === 'drawer' ? 'space-y-5' : 'flex flex-col flex-1 min-h-0'}>
      {variant === 'page' ? (
        <p className={`${bodyTextClass(variant)} mb-4`}>
          Set your brand context once. Then in the Composer use &quot;Generate with AI&quot; for post descriptions, and
          use the sparkle button in the Inbox to draft replies.
        </p>
      ) : (
        <p className={bodyTextClass(variant)}>
          Teach the AI about your brand voice, audience, and reply style. Saved context applies to iZop AI, Composer, and
          Inbox drafts.
        </p>
      )}

      {message ? (
        <div className={messageBoxClass(message.type, variant)}>
          <p>{message.text}</p>
          {message.type === 'error' ? (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className={`mt-3 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ${
                variant === 'drawer'
                  ? 'bg-red-950 text-red-200 hover:bg-red-900'
                  : 'bg-red-100 hover:bg-red-200 text-red-800'
              }`}
            >
              {saving ? 'Saving…' : 'Try again'}
            </button>
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
                setForm((f) => ({ ...f, targetAudience: v || null }));
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
                setForm((f) => ({ ...f, productDescription: v || null }));
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
                setForm((f) => ({ ...f, toneOfVoice: v || null }));
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
                setForm((f) => ({ ...f, toneExamples: v || null }));
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
              setForm((f) => ({ ...f, additionalContext: v || null }));
            }}
            placeholder="Brand values, key messages, hashtags you often use..."
            rows={4}
            maxLength={MAX_LENGTH.additionalContext}
            className={textareaClass(variant, 'min-h-[100px]')}
          />
        </div>

        <div className={`pt-6 mt-4 border-t ${variant === 'drawer' ? 'border-neutral-800' : 'border-gray-100'}`}>
          <button type="button" onClick={handleSave} disabled={saving} className={saveButtonClass}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save brand context
          </button>
        </div>
      </div>

      <div className={sectionClass(variant)}>
        <div className="flex items-start gap-3 mb-4">
          <MessageCircle size={22} className="text-[var(--button)] shrink-0 mt-0.5" />
          <div>
            <h2 className={headingClass(variant)}>Inbox reply examples</h2>
            <p className={`${bodyTextClass(variant)} mt-0.5`}>
              Paste 2-5 example DM replies you would send to customers. The AI will match your style when drafting inbox
              replies. <strong className={variant === 'drawer' ? 'text-neutral-200' : 'text-gray-700'}>Required</strong>{' '}
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
              setForm((f) => ({ ...f, inboxReplyExamples: v || null }));
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
              variant === 'drawer'
                ? 'text-amber-200 bg-amber-950/40 border-amber-900'
                : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}
          >
            AI draft replies in the Inbox are disabled until you add examples here and save.
          </p>
        ) : null}
        <div className={`pt-4 mt-2 border-t ${variant === 'drawer' ? 'border-neutral-800' : 'border-gray-100'}`}>
          <button type="button" onClick={handleSave} disabled={saving} className={saveButtonClass}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save
          </button>
        </div>
      </div>

      <div className={sectionClass(variant)}>
        <div className="flex items-start gap-3 mb-4">
          <MessagesSquare size={22} className="text-[var(--button)] shrink-0 mt-0.5" />
          <div>
            <h2 className={headingClass(variant)}>Comment reply examples</h2>
            <p className={`${bodyTextClass(variant)} mt-0.5`}>
              Paste 2-5 example comment replies you would post. The AI will match your style when drafting comment replies
              in the Inbox. <strong className={variant === 'drawer' ? 'text-neutral-200' : 'text-gray-700'}>Required</strong>{' '}
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
              setForm((f) => ({ ...f, commentReplyExamples: v || null }));
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
              variant === 'drawer'
                ? 'text-amber-200 bg-amber-950/40 border-amber-900'
                : 'text-amber-700 bg-amber-50 border-amber-200'
            }`}
          >
            AI draft replies for comments are disabled until you add examples here and save.
          </p>
        ) : null}
        <div className={`pt-4 mt-2 border-t ${variant === 'drawer' ? 'border-neutral-800' : 'border-gray-100'}`}>
          <button type="button" onClick={handleSave} disabled={saving} className={saveButtonClass}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
