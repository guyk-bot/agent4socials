'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatTitleBar from '@/components/aysop/AysopChatTitleBar';
import AysopChatPanel, { type ChatMessage } from '@/components/aysop/AysopChatPanel';
import {
  visibleChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';

type SessionDetail = AysopChatSessionSummary & { messages: ChatMessage[] };

function localBackupKey(userId: string, sessionId: string) {
  return `izop_aysop_chat_${userId}_${sessionId}`;
}

function makeOfflineSession(): SessionDetail {
  const now = new Date().toISOString();
  return {
    id: `offline-${Date.now()}`,
    title: 'New chat',
    updatedAt: now,
    createdAt: now,
    preview: null,
    messages: [],
  };
}

const LIST_FETCH_TIMEOUT_MS = 8_000;

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

  const initRef = useRef(false);
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

  const loadSession = useCallback(
    async (id: string) => {
      setSessionLoading(true);
      try {
        const res = await api.get<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`, {
          timeout: LIST_FETCH_TIMEOUT_MS,
        });
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

  const createSession = useCallback(async (): Promise<SessionDetail> => {
    try {
      const res = await api.post<{ session: SessionDetail }>('/ai/aysop-chats', {}, {
        timeout: LIST_FETCH_TIMEOUT_MS,
      });
      const s = res.data.session;
      setSessions((prev) => [s, ...prev.filter((x) => x.id !== s.id)]);
      setSaveError(null);
      return s;
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Could not create a new chat. Using a temporary chat until save works.';
      const offline = makeOfflineSession();
      setSessions((prev) => [offline, ...prev.filter((x) => !x.id.startsWith('offline-'))]);
      setSaveError(msg);
      return offline;
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

      let targetId = id;
      if (id.startsWith('offline-')) {
        try {
          const created = await api.post<{ session: SessionDetail }>('/ai/aysop-chats', {});
          targetId = created.data.session.id;
          setSessions((prev) => {
            const offline = prev.find((s) => s.id === id);
            const summary: AysopChatSessionSummary = {
              id: targetId,
              title: offline?.title ?? 'New chat',
              updatedAt: created.data.session.updatedAt,
              createdAt: created.data.session.createdAt,
              preview: null,
            };
            return [summary, ...prev.filter((s) => s.id !== id)];
          });
          if (activeIdRef.current === id) {
            setActiveId(targetId);
            router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(targetId)}`, { scroll: false });
            activeIdRef.current = targetId;
          }
          setSaveError(null);
        } catch {
          setSaveError('Could not save this chat. Your messages are kept locally until save works.');
          return false;
        }
      }

      try {
        const res = await api.patch<{ session: SessionDetail }>(`/ai/aysop-chats/${targetId}`, {
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
          const rest = prev.filter((s) => s.id !== updated.id);
          return [summary, ...rest];
        });
        setSaveError(null);
        return true;
      } catch {
        setSaveError('Could not save this chat. Your messages are kept locally until save works.');
        return false;
      }
    },
    [user?.id, router]
  );

  const renameSession = useCallback(
    async (id: string, title: string) => {
      const trimmed = title.trim().slice(0, 120);
      if (!trimmed) return;

      if (id.startsWith('offline-')) {
        setSessions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, title: trimmed, updatedAt: new Date().toISOString() } : s))
        );
        return;
      }

      try {
        const res = await api.patch<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`, { title: trimmed });
        const updated = res.data.session;
        setSessions((prev) => {
          const summary: AysopChatSessionSummary = {
            id: updated.id,
            title: updated.title,
            updatedAt: updated.updatedAt,
            createdAt: updated.createdAt,
            preview: updated.preview ?? null,
          };
          return [summary, ...prev.filter((s) => s.id !== id)];
        });
        setSaveError(null);
      } catch {
        setSaveError('Could not rename this chat.');
      }
    },
    []
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

  const mergeSessions = useCallback(
    (serverSessions: AysopChatSessionSummary[], keepId: string | null) => {
      setSessions((prev) => {
        const map = new Map<string, AysopChatSessionSummary>();
        for (const s of serverSessions) map.set(s.id, s);
        for (const s of prev) {
          if (!map.has(s.id)) map.set(s.id, s);
        }
        const merged = [...map.values()].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        if (keepId && !merged.some((s) => s.id === keepId)) {
          const local = prev.find((s) => s.id === keepId);
          if (local) merged.unshift(local);
        }
        return merged;
      });
    },
    []
  );

  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    void (async () => {
      const listPromise = api
        .get<{ sessions: AysopChatSessionSummary[]; warning?: string }>('/ai/aysop-chats', {
          timeout: LIST_FETCH_TIMEOUT_MS,
        })
        .catch(() => ({ data: { sessions: [] as AysopChatSessionSummary[] } }));

      if (chatParam) {
        setActiveId(chatParam);
        activeIdRef.current = chatParam;
        setListLoading(false);
        const [listRes] = await Promise.all([listPromise, loadSession(chatParam)]);
        mergeSessions(listRes.data.sessions ?? [], chatParam);
        if (listRes.data.warning) setSaveError(listRes.data.warning);
        return;
      }

      const quick = makeOfflineSession();
      setSessions([quick]);
      setActiveChat(quick.id);
      activeIdRef.current = quick.id;
      setMessages([]);
      setListLoading(false);

      const created = await createSession();
      if (created.id !== quick.id) {
        setSessions((prev) => [created, ...prev.filter((s) => s.id !== quick.id && s.id !== created.id)]);
        setActiveChat(created.id);
        activeIdRef.current = created.id;
        setMessages([]);
      }

      const listRes = await listPromise;
      mergeSessions(listRes.data.sessions ?? [], activeIdRef.current);
      if (listRes.data.warning) setSaveError(listRes.data.warning);
    })();
  }, [user?.id, chatParam, createSession, loadSession, mergeSessions, setActiveChat]);

  useEffect(() => {
    if (!user?.id) {
      initRef.current = false;
      setListLoading(true);
      setActiveId(null);
      activeIdRef.current = null;
    }
  }, [user?.id]);

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

  const activeTitle = sessions.find((s) => s.id === activeId)?.title ?? 'New chat';

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-neutral-950">
      {saveError ? (
        <p className="shrink-0 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-2">
          {saveError}
        </p>
      ) : null}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          {activeId ? (
            <AysopChatTitleBar
              title={activeTitle}
              disabled={switching}
              onRename={(title) => renameSession(activeId, title)}
            />
          ) : null}
          <AysopChatPanel
            key={activeId ?? 'none'}
            messages={messages}
            onMessagesChange={handleMessagesChange}
            sessionLoading={sessionLoading}
            disabled={switching}
          />
        </div>
        <AysopChatSidebar
          sessions={visibleSessions}
          activeId={activeId}
          loading={listLoading}
          onSelect={(id) => void handleSelect(id)}
          onNewChat={() => void handleNewChat()}
          onDelete={(id) => void handleDelete(id)}
          onRename={(id, title) => void renameSession(id, title)}
          side="right"
        />
      </div>
    </div>
  );
}
