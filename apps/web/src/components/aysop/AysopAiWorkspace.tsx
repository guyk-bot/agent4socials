'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Bot } from 'lucide-react';
import { BRAND_NAME } from '@/lib/site-brand-assets';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatPanel, { type ChatMessage } from '@/components/aysop/AysopChatPanel';
import {
  visibleChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';

type SessionDetail = AysopChatSessionSummary & { messages: ChatMessage[] };

function localBackupKey(userId: string, sessionId: string) {
  return `izop_aysop_chat_${userId}_${sessionId}`;
}

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
  const [switching, setSwitching] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const bootstrappedRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  const activeIdRef = useRef<string | null>(null);
  const persistInFlightRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const visibleSessions = useMemo(
    () => visibleChatSessions(sessions, activeId),
    [sessions, activeId]
  );

  const setActiveChat = useCallback(
    (id: string) => {
      setActiveId(id);
      router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router]
  );

  const refreshSessions = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: AysopChatSessionSummary[] }>('/ai/aysop-chats');
      setSessions(res.data.sessions ?? []);
      setSaveError(null);
    } catch {
      /* keep local list */
    }
  }, []);

  const loadSession = useCallback(
    async (id: string) => {
      setSessionLoading(true);
      try {
        const res = await api.get<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`);
        setMessages(res.data.session.messages ?? []);
        setSaveError(null);
      } catch {
        if (user?.id) {
          try {
            const raw = localStorage.getItem(localBackupKey(user.id, id));
            if (raw) {
              const parsed = JSON.parse(raw) as ChatMessage[];
              if (Array.isArray(parsed)) {
                setMessages(parsed);
                return;
              }
            }
          } catch {
            /* ignore */
          }
        }
        setMessages([]);
      } finally {
        setSessionLoading(false);
      }
    },
    [user?.id]
  );

  const createSession = useCallback(async (): Promise<SessionDetail | null> => {
    try {
      const res = await api.post<{ session: SessionDetail }>('/ai/aysop-chats');
      const s = res.data.session;
      setSessions((prev) => [s, ...prev]);
      setSaveError(null);
      return s;
    } catch {
      setSaveError('Could not create a new chat. Try again in a moment.');
      return null;
    }
  }, []);

  const persistSession = useCallback(
    async (id: string, nextMessages: ChatMessage[]): Promise<boolean> => {
      if (user?.id && nextMessages.length > 0) {
        try {
          localStorage.setItem(localBackupKey(user.id, id), JSON.stringify(nextMessages));
        } catch {
          /* ignore quota errors */
        }
      }

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
        setSaveError(null);
        return true;
      } catch {
        setSaveError('Could not save this chat. Your messages are kept locally until save works.');
        return false;
      }
    },
    [user?.id]
  );

  const flushActiveSession = useCallback(async (): Promise<boolean> => {
    if (persistInFlightRef.current) {
      await persistInFlightRef.current;
    }
    const id = activeIdRef.current;
    const msgs = messagesRef.current;
    if (!id || msgs.length === 0) return true;
    const task = persistSession(id, msgs);
    persistInFlightRef.current = task;
    try {
      return await task;
    } finally {
      if (persistInFlightRef.current === task) persistInFlightRef.current = null;
    }
  }, [persistSession]);

  useEffect(() => {
    if (!user?.id) return;
    setListLoading(true);
    bootstrappedRef.current = false;
    void api
      .get<{ sessions: AysopChatSessionSummary[]; warning?: string }>('/ai/aysop-chats')
      .then((res) => {
        setSessions(res.data.sessions ?? []);
        if (res.data.warning) setSaveError(res.data.warning);
      })
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
      const initial = visibleChatSessions(sessions, null);
      if (initial.length > 0) {
        setActiveChat(initial[0].id);
        await loadSession(initial[0].id);
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
    if (!chatParam || chatParam === activeId || switching) return;
    setActiveId(chatParam);
    void loadSession(chatParam);
  }, [chatParam, activeId, loadSession, switching]);

  const handleNewChat = async () => {
    if (switching) return;
    setSwitching(true);
    try {
      await flushActiveSession();
      const created = await createSession();
      if (created) {
        setMessages([]);
        setActiveChat(created.id);
      }
    } finally {
      setSwitching(false);
    }
  };

  const handleSelect = async (id: string) => {
    if (id === activeId || switching) return;
    setSwitching(true);
    try {
      await flushActiveSession();
      setActiveChat(id);
      await loadSession(id);
    } finally {
      setSwitching(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this chat?')) return;
    try {
      await api.delete(`/ai/aysop-chats/${id}`);
      if (user?.id) {
        try {
          localStorage.removeItem(localBackupKey(user.id, id));
        } catch {
          /* ignore */
        }
      }
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      if (activeId === id) {
        const next = visibleChatSessions(remaining, null);
        if (next.length) {
          setActiveChat(next[0].id);
          await loadSession(next[0].id);
        } else {
          await handleNewChat();
        }
      }
    } catch {
      setSaveError('Could not delete this chat.');
    }
  };

  const handleMessagesChange = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      messagesRef.current = next;
      const id = activeIdRef.current;
      if (!id) return;
      const task = persistSession(id, next);
      persistInFlightRef.current = task;
      void task.finally(() => {
        if (persistInFlightRef.current === task) persistInFlightRef.current = null;
      });
    },
    [persistSession]
  );

  const activeTitle = sessions.find((s) => s.id === activeId)?.title;

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
            . Chats are saved and named from your first message.
          </p>
        </div>

        <div className="flex flex-col flex-1 min-h-0 w-full max-w-4xl lg:max-w-[920px] lg:shrink-0">
          <div className="xl:hidden mb-3 shrink-0">
            <div className="flex items-center gap-2">
              <Bot size={24} className="text-[var(--primary)]" />
              <h1 className="text-lg font-bold text-neutral-900">{BRAND_NAME} AI</h1>
            </div>
          </div>

          {saveError ? (
            <p className="mb-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
              {saveError}
            </p>
          ) : null}

          <div className="flex flex-1 min-h-0 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
            <div className="flex-1 min-w-0 flex flex-col">
              {activeTitle && activeTitle !== 'New chat' ? (
                <div className="shrink-0 border-b border-neutral-100 px-4 py-2.5">
                  <p className="text-sm font-medium text-neutral-800 truncate">{activeTitle}</p>
                </div>
              ) : null}
              <AysopChatPanel
                key={activeId ?? 'none'}
                messages={messages}
                onMessagesChange={handleMessagesChange}
                sessionLoading={sessionLoading || switching}
                disabled={!activeId || switching}
              />
            </div>
            <AysopChatSidebar
              sessions={visibleSessions}
              activeId={activeId}
              loading={listLoading}
              onSelect={(id) => void handleSelect(id)}
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
