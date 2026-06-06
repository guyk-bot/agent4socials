'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatPanel, { type ChatMessage } from '@/components/aysop/AysopChatPanel';
import type { AysopChatSessionSummary } from '@/lib/ai/aysop-chat-sessions';

type SessionDetail = AysopChatSessionSummary & { messages: ChatMessage[] };

export default function AysopAiWorkspace() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatParam = searchParams.get('c');

  const [sessions, setSessions] = useState<AysopChatSessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const bootstrappedRef = useRef(false);

  const setActiveChat = useCallback(
    (id: string) => {
      setActiveId(id);
      router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  const loadSession = useCallback(async (id: string) => {
    setSessionLoading(true);
    try {
      const res = await api.get<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`);
      setMessages(res.data.session.messages ?? []);
    } catch {
      setMessages([]);
    } finally {
      setSessionLoading(false);
    }
  }, []);

  const createSession = useCallback(async (): Promise<SessionDetail | null> => {
    try {
      const res = await api.post<{ session: SessionDetail }>('/ai/aysop-chats');
      const s = res.data.session;
      setSessions((prev) => [s, ...prev]);
      return s;
    } catch {
      return null;
    }
  }, []);

  const persistSession = useCallback(async (id: string, nextMessages: ChatMessage[]) => {
    try {
      const res = await api.patch<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`, {
        messages: nextMessages,
      });
      const updated = res.data.session;
      setSessions((prev) => {
        const summary: AysopChatSessionSummary = {
          id: updated.id,
          title: updated.title,
          updatedAt: updated.updatedAt,
          createdAt: updated.createdAt,
          preview: updated.preview ?? null,
        };
        const rest = prev.filter((s) => s.id !== id);
        return [summary, ...rest];
      });
    } catch {
      /* non-fatal */
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    setListLoading(true);
    bootstrappedRef.current = false;
    void api
      .get<{ sessions: AysopChatSessionSummary[] }>('/ai/aysop-chats')
      .then((res) => setSessions(res.data.sessions ?? []))
      .catch(() => setSessions([]))
      .finally(() => setListLoading(false));
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || listLoading || bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void (async () => {
      if (chatParam) {
        setActiveId(chatParam);
        await loadSession(chatParam);
        return;
      }
      if (sessions.length > 0) {
        setActiveChat(sessions[0].id);
        await loadSession(sessions[0].id);
        return;
      }
      const created = await createSession();
      if (created) {
        setActiveChat(created.id);
        setMessages([]);
      }
    })();
  }, [user?.id, listLoading, chatParam, sessions, setActiveChat, loadSession, createSession]);

  useEffect(() => {
    if (!chatParam || chatParam === activeId) return;
    setActiveId(chatParam);
    void loadSession(chatParam);
  }, [chatParam, activeId, loadSession]);

  const handleNewChat = async () => {
    const created = await createSession();
    if (created) {
      setMessages([]);
      setActiveChat(created.id);
    }
  };

  const handleSelect = (id: string) => {
    if (id === activeId) return;
    setActiveChat(id);
    void loadSession(id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this chat?')) return;
    try {
      await api.delete(`/ai/aysop-chats/${id}`);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeId === id) {
        if (remaining.length) {
          setActiveChat(remaining[0].id);
          await loadSession(remaining[0].id);
        } else {
          await handleNewChat();
        }
      }
    } catch {
      /* ignore */
    }
  };

  const handleMessagesChange = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      if (activeId) void persistSession(activeId, next);
    },
    [activeId, persistSession]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] min-h-[520px] -mx-4 sm:-mx-6 lg:-mx-8">
      <div className="flex flex-1 min-h-0 px-4 sm:px-6 lg:px-8 gap-6 justify-end">
        <div className="hidden xl:flex flex-col justify-end flex-1 min-w-0 max-w-lg pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Bot size={26} className="text-[var(--primary)]" />
            <h1 className="text-xl font-bold text-neutral-900">{BRAND_NAME} AI</h1>
          </div>
          <p className="mt-2 text-sm text-neutral-500 leading-relaxed">
            Knows your connected platforms and{' '}
            <Link href="/dashboard/ai-assistant" className="text-[var(--primary)] hover:underline">
              AI Assistant brand context
            </Link>
            . Chats are saved so you can pick up anytime.
          </p>
        </div>

        <div className="flex flex-col flex-1 min-h-0 w-full max-w-4xl lg:max-w-[920px] lg:shrink-0">
          <div className="xl:hidden mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={24} className="text-[var(--primary)]" />
              <h1 className="text-lg font-bold text-neutral-900">{BRAND_NAME} AI</h1>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="flex-1 min-w-0 flex flex-col">
              <AysopChatPanel
                key={activeId ?? 'none'}
                messages={messages}
                onMessagesChange={handleMessagesChange}
                sessionLoading={sessionLoading}
                disabled={!activeId}
              />
            </div>
            <AysopChatSidebar
              sessions={sessions}
              activeId={activeId}
              loading={listLoading}
              onSelect={handleSelect}
              onNewChat={() => void handleNewChat()}
              onDelete={(id) => void handleDelete(id)}
              side="right"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
