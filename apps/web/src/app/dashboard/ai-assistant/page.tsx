'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, MessageCircle, MessagesSquare } from 'lucide-react';
import api from '@/lib/api';

type BrandContextPayload = {
  id?: string;
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
  inboxReplyExamples: string | null;
  commentReplyExamples: string | null;
};

const defaultForm: BrandContextPayload = {
  targetAudience: null,
  toneOfVoice: null,
  toneExamples: null,
  productDescription: null,
  additionalContext: null,
  inboxReplyExamples: null,
  commentReplyExamples: null,
};

const MAX_LENGTH = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
  inboxReplyExamples: 2000,
  commentReplyExamples: 2000,
} as const;

export default function AIAssistantPage() {
  const [form, setForm] = useState<BrandContextPayload>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);

  useEffect(() => {
    api
      .get('/ai/brand-context')
      .then((res) => {
        const data = res.data;
        if (data && typeof data === 'object') {
          setForm({
            targetAudience: data.targetAudience ?? null,
            toneOfVoice: data.toneOfVoice ?? null,
            toneExamples: data.toneExamples ?? null,
            productDescription: data.productDescription ?? null,
            additionalContext: data.additionalContext ?? null,
            inboxReplyExamples: (data as { inboxReplyExamples?: string | null }).inboxReplyExamples ?? null,
            commentReplyExamples: (data as { commentReplyExamples?: string | null }).commentReplyExamples ?? null,
          });
        }
      })
      .catch((err: { response?: { status?: number } }) => {
        if (err.response?.status === 401) {
          setMessage({ type: 'error', text: 'Please log in again to load your saved context.' });
        } else {
          setMessage({ type: 'warning', text: 'Couldn\'t load your saved context. You can still fill the form and save.' });
        }
      })
      .finally(() => setLoading(false));
  }, []);

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
    setSaving(true);
    setMessage(null);
    let willRetry = false;
    const doPut = () => api.put('/ai/brand-context', savePayload());
    doPut()
      .then(() => setMessage({ type: 'success', text: 'Brand context saved. You can use "Generate with AI" in the Composer.' }))
      .catch((err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
        const status = err.response?.status;
        const msg = err.response?.data?.message
          || (status === 401 ? 'Please log in again.' : status === 503 ? 'Service unavailable. Try again later.' : status === 500 ? 'Server error. Try again in a moment or log out and back in.' : err.message || 'Failed to save. Check your connection and try again.');
        if ((status === 500 || status === undefined) && !willRetry) {
          willRetry = true;
          setMessage({ type: 'error', text: msg + ' Retrying once in a moment…' });
          window.setTimeout(() => {
            doPut()
              .then(() => setMessage({ type: 'success', text: 'Brand context saved. You can use "Generate with AI" in the Composer.' }))
              .catch((retryErr: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
                const retryMsg = retryErr.response?.data?.message || retryErr.message || msg;
                setMessage({ type: 'error', text: retryMsg + ' Click "Save brand context" again to retry.' });
              })
              .finally(() => setSaving(false));
          }, 2000);
          return;
        }
        setMessage({ type: 'error', text: msg + (status === 401 ? '' : ' Click "Save brand context" again to retry.') });
      })
      .finally(() => {
        if (!willRetry) setSaving(false);
      });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
      <div className="w-full min-h-[calc(100vh-5.5rem)] flex flex-col -mx-8 -my-8 px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles size={28} className="text-indigo-500" />
            AI Writing Assistant
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Set your brand context once. Then in the Composer use &quot;Generate with AI&quot; for post descriptions, and use the sparkle button in the Inbox to draft replies.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : message.type === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
          }`}
        >
          <p>{message.text}</p>
          {message.type === 'error' && (
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={saving}
              className="mt-3 px-3 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-800 text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Try again'}
            </button>
          )}
        </div>
      )}

      <div className="card p-6 flex-1 flex flex-col min-h-0">
        <h2 className="font-semibold text-gray-900 mb-4">Brand context</h2>

        {/* Row 1: Who you reach + What you offer (symmetrical) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
          <div className="flex flex-col">
            <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
              Target audience
              <span className="text-xs font-normal text-gray-500">{(form.targetAudience ?? '').length}/{MAX_LENGTH.targetAudience}</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[160px]"
            />
          </div>
          <div className="flex flex-col">
            <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
              Product or service description
              <span className="text-xs font-normal text-gray-500">{(form.productDescription ?? '').length}/{MAX_LENGTH.productDescription}</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[160px]"
            />
          </div>

          {/* Row 2: How you sound (tone + examples, symmetrical height) */}
          <div className="flex flex-col">
            <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
              Tone of voice
              <span className="text-xs font-normal text-gray-500">{(form.toneOfVoice ?? '').length}/{MAX_LENGTH.toneOfVoice}</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[120px]"
            />
          </div>
          <div className="flex flex-col">
            <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
              Tone examples (optional)
              <span className="text-xs font-normal text-gray-500">{(form.toneExamples ?? '').length}/{MAX_LENGTH.toneExamples}</span>
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[120px]"
            />
          </div>
        </div>

        {/* Row 3: Extra context (full width) */}
        <div className="mt-6">
          <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
            Additional context (optional)
            <span className="text-xs font-normal text-gray-500">{(form.additionalContext ?? '').length}/{MAX_LENGTH.additionalContext}</span>
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
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[100px]"
          />
        </div>

        <div className="pt-6 mt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save brand context
          </button>
        </div>
      </div>

      {/* Inbox reply examples */}
      <div className="card p-6 mt-6">
        <div className="flex items-start gap-3 mb-4">
          <MessageCircle size={22} className="text-indigo-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-900">Inbox reply examples</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste 2-5 example DM replies you would send to customers. The AI will match your style when drafting inbox replies. <strong className="text-gray-700">Required</strong> to enable the AI draft button in the Inbox.
            </p>
          </div>
        </div>
        <div className="flex flex-col">
          <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
            Example inbox replies
            <span className="text-xs font-normal text-gray-500">{(form.inboxReplyExamples ?? '').length}/{MAX_LENGTH.inboxReplyExamples}</span>
          </label>
          <textarea
            value={form.inboxReplyExamples ?? ''}
            onChange={(e) => {
              const v = e.target.value.slice(0, MAX_LENGTH.inboxReplyExamples);
              setForm((f) => ({ ...f, inboxReplyExamples: v || null }));
            }}
            placeholder={"Example 1: Hi! Thanks for reaching out. We ship within 2-3 business days.\nExample 2: Hey, so glad you love it! Let us know if you need anything else.\nExample 3: Thanks for your message! We'll get back to you shortly."}
            rows={7}
            maxLength={MAX_LENGTH.inboxReplyExamples}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[160px]"
          />
        </div>
        {!(form.inboxReplyExamples?.trim()) && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            AI draft replies in the Inbox are disabled until you add examples here and save.
          </p>
        )}
        <div className="pt-4 mt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save
          </button>
        </div>
      </div>

      {/* Comment reply examples */}
      <div className="card p-6 mt-6">
        <div className="flex items-start gap-3 mb-4">
          <MessagesSquare size={22} className="text-indigo-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold text-gray-900">Comment reply examples</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Paste 2-5 example comment replies you would post. The AI will match your style when drafting comment replies in the Inbox. <strong className="text-gray-700">Required</strong> to enable AI drafts for comments.
            </p>
          </div>
        </div>
        <div className="flex flex-col">
          <label className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
            Example comment replies
            <span className="text-xs font-normal text-gray-500">{(form.commentReplyExamples ?? '').length}/{MAX_LENGTH.commentReplyExamples}</span>
          </label>
          <textarea
            value={form.commentReplyExamples ?? ''}
            onChange={(e) => {
              const v = e.target.value.slice(0, MAX_LENGTH.commentReplyExamples);
              setForm((f) => ({ ...f, commentReplyExamples: v || null }));
            }}
            placeholder={"Example 1: Thank you so much! We're really happy to hear that.\nExample 2: Great question! Feel free to DM us for details.\nExample 3: Love the support! Stay tuned for more updates."}
            rows={7}
            maxLength={MAX_LENGTH.commentReplyExamples}
            className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm min-h-[160px]"
          />
        </div>
        {!(form.commentReplyExamples?.trim()) && (
          <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            AI draft replies for comments are disabled until you add examples here and save.
          </p>
        )}
        <div className="pt-4 mt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
