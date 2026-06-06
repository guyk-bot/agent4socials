'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import Link from 'next/link';
import { Bot, Loader2, Send, Sparkles, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { AysopAnalyticsReportCard, type ReportSnapshotArtifact } from '@/components/aysop/AysopAnalyticsReportCard';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
};

type AysopArtifact =
  | { type: 'accounts'; accounts: Array<{ id: string; platform: string; username: string | null }> }
  | ReportSnapshotArtifact
  | { type: 'posts'; accountId: string; posts: Array<Record<string, unknown>> }
  | { type: 'comments'; accountId: string; postPreview: string; comments: Array<Record<string, unknown>> }
  | { type: 'automation'; keywordSteps: unknown[]; dmWelcomeEnabled: boolean }
  | { type: 'composer_link'; url: string; caption?: string }
  | { type: 'action_result'; action: string; ok: boolean; detail: string };

const STARTERS = [
  'What is my brand about?',
  'Instagram analytics report for the last 30 days',
  'Summarize analytics across all my platforms',
  'Show me a chart of TikTok views this month',
  'Draft a carousel caption for my brand',
];

function ArtifactCards({ artifacts }: { artifacts: AysopArtifact[] }) {
  if (!artifacts.length) return null;
  return (
    <div className="mt-3 space-y-2">
      {artifacts.map((a, i) => {
        if (a.type === 'comments') {
          return (
            <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-2">Comments on: {a.postPreview}</p>
              <ul className="space-y-2 max-h-48 overflow-y-auto">
                {a.comments.map((c, j) => (
                  <li key={j} className="border-l-2 border-[var(--primary)] pl-2">
                    <span className="font-medium text-neutral-700">{String(c.authorName ?? 'User')}</span>
                    <p className="text-neutral-600">{String(c.text ?? '')}</p>
                  </li>
                ))}
              </ul>
            </div>
          );
        }
        if (a.type === 'report_snapshot') {
          return <AysopAnalyticsReportCard key={i} report={a} />;
        }
        if (a.type === 'composer_link') {
          return (
            <div key={i} className="rounded-xl border border-[var(--primary)]/30 bg-[#E8F4FF]/50 p-3 text-sm">
              <p className="font-medium text-neutral-800 mb-1">Draft ready for Composer</p>
              {a.caption ? <p className="text-neutral-600 whitespace-pre-wrap mb-2">{a.caption}</p> : null}
              <Link
                href={a.url}
                className="inline-flex items-center gap-1 text-[var(--primary)] font-medium hover:underline"
              >
                Open Composer <ExternalLink size={14} />
              </Link>
            </div>
          );
        }
        if (a.type === 'action_result') {
          return (
            <div
              key={i}
              className={`rounded-xl border p-3 text-sm ${a.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50'}`}
            >
              {a.detail}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

type Props = {
  messages: ChatMessage[];
  onMessagesChange: (messages: ChatMessage[]) => void;
  sessionLoading?: boolean;
  disabled?: boolean;
};

export default function AysopChatPanel({
  messages,
  onMessagesChange,
  sessionLoading,
  disabled,
}: Props) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, sessionLoading]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading || disabled) return;
      setError(null);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
      const next = [...messages, userMsg];
      onMessagesChange(next);
      setInput('');
      setLoading(true);
      try {
        const payload = next.map((m) => ({ role: m.role, content: m.content }));
        const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
          '/ai/aysop-chat',
          { messages: payload },
          { timeout: 90_000 }
        );
        const withAssistant: ChatMessage[] = [
          ...next,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.data.reply,
            artifacts: res.data.artifacts,
          },
        ];
        onMessagesChange(withAssistant);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Something went wrong. Try again.';
        setError(msg);
        onMessagesChange(next);
      } finally {
        setLoading(false);
      }
    },
    [disabled, loading, messages, onMessagesChange]
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-100 bg-[var(--dark)] text-chrome-text shrink-0">
        <Bot size={20} className="text-[#53BEFA]" />
        <span className="font-semibold text-sm">{BRAND_NAME} AI</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fafafa] min-h-0">
        {sessionLoading ? (
          <div className="flex items-center justify-center gap-2 text-neutral-500 text-sm py-12">
            <Loader2 size={18} className="animate-spin" />
            Loading chat…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Sparkles className="mx-auto text-[var(--primary)] mb-3" size={32} />
            <p className="text-neutral-700 font-medium">Your social copilot</p>
            <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
              Uses your AI Assistant brand context, all connected platforms, and saved chat history.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  disabled={disabled || loading}
                  className="text-xs px-3 py-2 rounded-full border border-neutral-200 bg-white hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[95%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-[var(--primary)] text-chrome-text rounded-br-md'
                    : 'bg-white border border-neutral-200 text-neutral-800 rounded-bl-md shadow-sm'
                }`}
              >
                {m.content}
                {m.role === 'assistant' && m.artifacts ? (
                  <ArtifactCards artifacts={m.artifacts} />
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-500 text-sm">
            <Loader2 size={16} className="animate-spin" />
            {BRAND_NAME} is thinking…
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100 shrink-0">{error}</p>
      ) : null}

      <form
        className="p-3 border-t border-neutral-100 flex gap-2 bg-white shrink-0"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about posts, comments, analytics, your brand…"
          className="flex-1 rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          disabled={loading || disabled}
        />
        <button
          type="submit"
          disabled={loading || disabled || !input.trim()}
          className="shrink-0 rounded-xl bg-[var(--dark)] text-chrome-text px-4 py-3 hover:opacity-90 disabled:opacity-40 transition-opacity"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
