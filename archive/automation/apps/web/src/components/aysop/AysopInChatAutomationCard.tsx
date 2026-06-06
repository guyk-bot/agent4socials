'use client';

import React, { useState } from 'react';
import { CheckCircle2, Loader2, Plus } from 'lucide-react';
import api from '@/lib/api';
import type { AysopArtifact } from '@/lib/ai/aysop-artifacts';

type AutomationArtifact = Extract<AysopArtifact, { type: 'automation' }>;

type KeywordStep = { keyword?: string; replyTemplate?: string; platforms?: string[] };

export function AysopInChatAutomationCard({ artifact: initial }: { artifact: AutomationArtifact }) {
  const [steps, setSteps] = useState<KeywordStep[]>(
    Array.isArray(initial.keywordSteps) ? (initial.keywordSteps as KeywordStep[]) : []
  );
  const [welcomeOn, setWelcomeOn] = useState(initial.dmWelcomeEnabled);
  const [keyword, setKeyword] = useState('');
  const [replyTemplate, setReplyTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persistSteps = async (nextSteps: KeywordStep[]) => {
    await api.patch('/automation/settings', { keywordAutomationSteps: nextSteps });
    setSteps(nextSteps);
  };

  const handleToggleWelcome = async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    const next = !welcomeOn;
    try {
      await api.patch('/automation/settings', {
        dmWelcomeEnabled: next,
        dmWelcomeEnabledByPlatform: next ? { Instagram: true, Facebook: true } : {},
      });
      setWelcomeOn(next);
      setSavedMsg(next ? 'Welcome DM turned on for Instagram and Facebook.' : 'Welcome DM turned off.');
    } catch {
      setError('Could not update welcome DM.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRule = async () => {
    const kw = keyword.trim();
    const reply = replyTemplate.trim();
    if (!kw || !reply) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    const nextSteps = [...steps, { keyword: kw, replyTemplate: reply, platforms: ['Instagram', 'Facebook'], enabled: true }];
    try {
      await persistSteps(nextSteps);
      setKeyword('');
      setReplyTemplate('');
      setSavedMsg(`Saved keyword rule for "${kw}".`);
    } catch {
      setError('Could not save automation rule.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-3 text-sm space-y-3">
      <div>
        <p className="font-medium text-neutral-800 dark:text-neutral-200">Keyword automation</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
          Set up rules here without leaving chat.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 px-3 py-2">
        <div>
          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Welcome DM</p>
          <p className="text-[10px] text-neutral-500 dark:text-neutral-400">First message to new conversations</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleToggleWelcome()}
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${welcomeOn ? 'bg-[var(--primary)]' : 'bg-neutral-300 dark:bg-neutral-600'}`}
          aria-pressed={welcomeOn}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${welcomeOn ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
      </div>

      {steps.length > 0 ? (
        <ul className="space-y-1.5 max-h-32 overflow-y-auto text-xs">
          {steps.map((s, j) => (
            <li
              key={`${s.keyword}-${j}`}
              className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-2 py-1.5 border border-neutral-100 dark:border-neutral-700"
            >
              <span className="font-medium text-neutral-800 dark:text-neutral-200">{String(s.keyword ?? 'Keyword')}</span>
              <span className="text-neutral-500 dark:text-neutral-400"> → {String(s.replyTemplate ?? '').slice(0, 80)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-950 p-2.5 space-y-2">
        <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">Add keyword rule</p>
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="Keyword (e.g. price)"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        <textarea
          value={replyTemplate}
          onChange={(e) => setReplyTemplate(e.target.value)}
          rows={2}
          placeholder="Auto-reply message"
          className="w-full rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        <button
          type="button"
          disabled={saving || !keyword.trim() || !replyTemplate.trim()}
          onClick={() => void handleAddRule()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--dark)] text-chrome-text px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Save rule
        </button>
      </div>

      {savedMsg ? (
        <p className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={12} />
          {savedMsg}
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-600 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
