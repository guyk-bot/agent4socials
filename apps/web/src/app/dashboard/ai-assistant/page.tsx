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

export default function AIAssistantPage() {
  const [form, setForm] = useState<BrandContextPayload>(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
      .catch(() => setMessage({ type: 'error', text: 'Failed to load brand context' }))
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
      .catch(() => setMessage({ type: 'error', text: 'Failed to save' }))
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
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={28} className="text-indigo-500" />
          AI Writing Assistant
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Set your brand context once. Then in the Composer you can optionally use &quot;Generate with AI&quot; to get post descriptions that match your voice and audience.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="card space-y-6">
        <h2 className="font-semibold text-gray-900">Brand context</h2>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Target audience</label>
          <textarea
            value={form.targetAudience ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value || null }))}
            placeholder="e.g. Small business owners, 25-45, interested in productivity and marketing"
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tone of voice</label>
          <input
            type="text"
            value={form.toneOfVoice ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, toneOfVoice: e.target.value || null }))}
            placeholder="e.g. Professional but friendly, concise"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Tone examples</label>
          <textarea
            value={form.toneExamples ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, toneExamples: e.target.value || null }))}
            placeholder="Paste 1-3 example phrases or short posts that match the tone you want"
            rows={4}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Product or service description</label>
          <textarea
            value={form.productDescription ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, productDescription: e.target.value || null }))}
            placeholder="What you offer in one or two sentences"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Additional context (optional)</label>
          <textarea
            value={form.additionalContext ?? ''}
            onChange={(e) => setForm((f) => ({ ...f, additionalContext: e.target.value || null }))}
            placeholder="Brand values, key messages, hashtags you often use, etc."
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          Save brand context
        </button>
      </div>
    </div>
  );
}
