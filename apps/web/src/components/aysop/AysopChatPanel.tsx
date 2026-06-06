'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import Link from 'next/link';
import { Bot, Loader2, Send, Sparkles, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  artifacts?: AysopArtifact[];
};

type AysopArtifact =
  | { type: 'accounts'; accounts: Array<{ id: string; platform: string; username: string | null }> }
  | { type: 'analytics'; accountId: string; platform: string; username: string | null; summary: Record<string, unknown> }
  | { type: 'posts'; accountId: string; posts: Array<Record<string, unknown>> }
  | { type: 'comments'; accountId: string; postPreview: string; comments: Array<Record<string, unknown>> }
  | { type: 'automation'; keywordSteps: unknown[]; dmWelcomeEnabled: boolean }
  | { type: 'composer_link'; url: string; caption?: string }
  | { type: 'action_result'; action: string; ok: boolean; detail: string };

const STORAGE_KEY = 'agent4socials_aysop_chat_v1';

const STARTERS = [
  'How is my latest post performing?',
  'How many comments did my last post get?',
  'Draft a carousel caption for my brand',
  'Set up keyword automation for "LINK"',
  'Summarize my account analytics',
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
        if (a.type === 'analytics') {
          const s = a.summary;
          return (
            <div key={i} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <p className="font-medium text-neutral-800">
                {a.platform} {a.username ? `@${a.username}` : ''}
              </p>
              <p className="text-neutral-600 mt-1">
                Followers: {s.followers != null ? String(s.followers) : 'n/a'} · Posts synced:{' '}
                {String(s.postsSynced ?? 0)}
              </p>
              {s.last30PostsTotals && typeof s.last30PostsTotals === 'object' ? (
                <p className="text-neutral-500 text-xs mt-1">
                  Recent totals: {JSON.stringify(s.last30PostsTotals)}
                </p>
              ) : null}
            </div>
          );
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

export default function AysopChatPanel() {
  const { user } = useAuth();
  const cache = useAccountsCache();
  const accounts = cache?.cachedAccounts ?? [];
  const [accountId, setAccountId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = sessionStorage.getItem(`${STORAGE_KEY}:${user.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as ChatMessage[];
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      /* ignore */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      sessionStorage.setItem(`${STORAGE_KEY}:${user.id}`, JSON.stringify(messages.slice(-30)));
    } catch {
      /* ignore */
    }
  }, [messages, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (accountId || !accounts.length) return;
    setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;
      setError(null);
      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: 'user', content: trimmed };
      const next = [...messages, userMsg];
      setMessages(next);
      setInput('');
      setLoading(true);
      try {
        const payload = next.map((m) => ({ role: m.role, content: m.content }));
        const res = await api.post<{ reply: string; artifacts?: AysopArtifact[] }>(
          '/ai/aysop-chat',
          { messages: payload, accountId: accountId || null },
          { timeout: 90_000 }
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: res.data.reply,
            artifacts: res.data.artifacts,
          },
        ]);
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          'Something went wrong. Try again.';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [accountId, loading, messages]
  );

  const clearChat = () => {
    setMessages([]);
    setError(null);
    if (user?.id) sessionStorage.removeItem(`${STORAGE_KEY}:${user.id}`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-h-[820px] rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-neutral-100 bg-[var(--dark)] text-chrome-text">
        <div className="flex items-center gap-2">
          <Bot size={22} className="text-[#53BEFA]" />
          <span className="font-semibold">{BRAND_NAME} AI</span>
        </div>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="ml-auto text-sm rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 text-chrome-text max-w-[220px]"
          aria-label="Account context"
        >
          {accounts.length === 0 ? (
            <option value="">No accounts connected</option>
          ) : (
            accounts.map((a) => (
              <option key={a.id} value={a.id} className="text-neutral-900">
                {a.platform} {a.username ? `@${a.username}` : ''}
              </option>
            ))
          )}
        </select>
        <button
          type="button"
          onClick={clearChat}
          className="text-xs text-chrome-text/70 hover:text-chrome-text underline"
        >
          New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#fafafa]">
        {messages.length === 0 ? (
          <div className="text-center py-8 px-4">
            <Sparkles className="mx-auto text-[var(--primary)] mb-3" size={32} />
            <p className="text-neutral-700 font-medium">Your social copilot</p>
            <p className="text-sm text-neutral-500 mt-1 max-w-md mx-auto">
              Ask about analytics, comments, automations, or draft posts for images, video, and carousels.
              Upload media in Composer when ready to publish.
            </p>
            <div className="flex flex-wrap justify-center gap-2 mt-6">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-xs px-3 py-2 rounded-full border border-neutral-200 bg-white hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
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
        <p className="px-4 py-2 text-sm text-red-600 bg-red-50 border-t border-red-100">{error}</p>
      ) : null}

      <form
        className="p-3 border-t border-neutral-100 flex gap-2 bg-white"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about posts, comments, analytics, automations…"
          className="flex-1 rounded-xl border border-neutral-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/40"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-xl bg-[var(--dark)] text-chrome-text px-4 py-3 hover:opacity-90 disabled:opacity-40 transition-opacity"
          aria-label="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}
