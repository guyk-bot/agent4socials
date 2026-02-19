'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import api from '@/lib/api';

type BrandContextPayload = {
  id?: string;
  targetAudience: string | null;
  toneOfVoice: string | null;
  toneExamples: string | null;
  productDescription: string | null;
  additionalContext: string | null;
};

const defaultForm: BrandContextPayload = {
  targetAudience: null,
  toneOfVoice: null,
  toneExamples: null,
  productDescription: null,
  additionalContext: null,
};

const MAX_LENGTH = {
  targetAudience: 500,
  toneOfVoice: 200,
  toneExamples: 1500,
  productDescription: 2000,
  additionalContext: 1000,
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

  const handleSave = () => {
    setSaving(true);
    setMessage(null);
    api
      .put('/ai/brand-context', {
        targetAudience: form.targetAudience || null,
        toneOfVoice: form.toneOfVoice || null,
        toneExamples: form.toneExamples || null,
        productDescription: form.productDescription || null,
        additionalContext: form.additionalContext || null,
      })
      .then(() => setMessage({ type: 'success', text: 'Brand context saved. You can use "Generate with AI" in the Composer.' }))
      .catch((err: { response?: { data?: { message?: string }; status?: number }; message?: string }) => {
        const msg = err.response?.data?.message
          || (err.response?.status === 401 ? 'Please log in again.' : err.response?.status === 503 ? 'Service unavailable. Try again later.' : err.response?.status === 500 ? 'Server error. Try again in a moment or log out and back in.' : err.message || 'Failed to save. Check your connection and try again.');
        setMessage({ type: 'error', text: msg });
      })
      .finally(() => setSaving(false));
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
            Set your brand context once. Then in the Composer use &quot;Generate with AI&quot; for post descriptions.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm mb-4 ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : message.type === 'warning' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
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
    </div>
  );
}
