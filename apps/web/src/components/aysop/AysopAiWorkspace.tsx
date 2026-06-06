'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { API_AYSOP_SESSION_PERSIST_TIMEOUT_MS } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatHeader from '@/components/aysop/AysopChatHeader';
import AysopChatPanel, { type ChatMessage } from '@/components/aysop/AysopChatPanel';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  readCachedMessages,
  readCachedSessionList,
  readLastActiveChatId,
  writeCachedMessages,
  writeCachedSessionList,
  writeLastActiveChatId,
  clearCachedMessagesForSessions,
} from '@/lib/ai/aysop-chat-local-cache';
import {
  visibleChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';
import { pickBestStoredMessages } from '@/lib/ai/aysop-chat-persist';

type SessionDetail = AysopChatSessionSummary & { messages: ChatMessage[] };

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

const FETCH_TIMEOUT_MS = 8_000;
const LOAD_SESSION_TIMEOUT_MS = 45_000;
const PERSIST_DEBOUNCE_MS = 1_500;

function sessionSummaryFromDetail(s: SessionDetail): AysopChatSessionSummary {
  return {
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt,
    createdAt: s.createdAt,
    preview: s.preview ?? null,
  };
}

function isEphemeralOfflineSession(id: string, userId: string | undefined): boolean {
  if (!id.startsWith('offline-')) return false;
  const cached = readCachedMessages(userId, id);
  return !cached?.length;
}

function pickRestoreChatId(
  userId: string,
  sessions: AysopChatSessionSummary[]
): string | null {
  const lastId = readLastActiveChatId(userId);
  const byId = new Map(sessions.map((s) => [s.id, s]));

  if (lastId && !isEphemeralOfflineSession(lastId, userId)) {
    if (byId.has(lastId)) return lastId;
    const cached = readCachedMessages(userId, lastId);
    if (cached?.length) return lastId;
  }

  const real = sessions.filter((s) => !s.id.startsWith('offline-'));
  if (real.length) return real[0]!.id;

  const offlineWithMessages = sessions.find(
    (s) => s.id.startsWith('offline-') && !isEphemeralOfflineSession(s.id, userId)
  );
  if (offlineWithMessages) return offlineWithMessages.id;

  return null;
}

function chatParamFromWindow(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('c');
}

function resolveInstantChatState(
  userId: string | undefined,
  chatParam: string | null
): {
  sessions: AysopChatSessionSummary[];
  activeId: string | null;
  messages: ChatMessage[];
} {
  if (!userId) {
    return { sessions: [], activeId: null, messages: [] };
  }
  const sessions = readCachedSessionList(userId) ?? [];
  let activeId: string | null = null;

  if (chatParam && !isEphemeralOfflineSession(chatParam, userId)) {
    activeId = chatParam;
  } else if (chatParam) {
    activeId = pickRestoreChatId(userId, sessions) ?? chatParam;
  } else {
    activeId = pickRestoreChatId(userId, sessions);
  }

  const messages =
    activeId && userId ? ((readCachedMessages(userId, activeId) ?? []) as ChatMessage[]) : [];

  return { sessions, activeId, messages };
}

export default function AysopAiWorkspace() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chatParam = searchParams.get('c');

  const instantBoot = useMemo(
    () => resolveInstantChatState(user?.id, chatParam ?? chatParamFromWindow()),
    [user?.id, chatParam]
  );

  const [sessions, setSessions] = useState<AysopChatSessionSummary[]>(instantBoot.sessions);
  const [activeId, setActiveId] = useState<string | null>(instantBoot.activeId);
  const [messages, setMessages] = useState<ChatMessage[]>(instantBoot.messages);
  const [listLoading, setListLoading] = useState(instantBoot.sessions.length === 0);
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [settingsToast, setSettingsToast] = useState<string | null>(null);

  const initRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(instantBoot.messages);
  const activeIdRef = useRef<string | null>(instantBoot.activeId);
  const persistInFlightRef = useRef<Promise<boolean> | null>(null);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ id: string; messages: ChatMessage[] } | null>(null);
  const actionLockRef = useRef(false);

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

  const cacheSessionList = useCallback(
    (next: AysopChatSessionSummary[]) => {
      writeCachedSessionList(user?.id, next);
    },
    [user?.id]
  );

  const upsertSessionSummary = useCallback(
    (summary: AysopChatSessionSummary, bumpToTop = true) => {
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== summary.id);
        const merged = bumpToTop ? [summary, ...rest] : [...rest, summary].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        cacheSessionList(merged);
        return merged;
      });
    },
    [cacheSessionList]
  );

  const setActiveChat = useCallback(
    (id: string, opts?: { remember?: boolean }) => {
      setActiveId(id);
      activeIdRef.current = id;
      const shouldRemember =
        opts?.remember !== false &&
        Boolean(user?.id) &&
        !isEphemeralOfflineSession(id, user?.id);
      if (shouldRemember && user?.id) {
        writeLastActiveChatId(user.id, id);
      }
      router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(id)}`, { scroll: false });
    },
    [router, user?.id]
  );

  const hydrateMessages = useCallback(
    (id: string): ChatMessage[] => {
      const cached = readCachedMessages(user?.id, id);
      const next = (cached ?? []) as ChatMessage[];
      setMessages(next);
      messagesRef.current = next;
      return next;
    },
    [user?.id]
  );

  const createSession = useCallback(async (): Promise<SessionDetail> => {
    try {
      const res = await api.post<{ session: SessionDetail }>('/ai/aysop-chats', {}, {
        timeout: FETCH_TIMEOUT_MS,
      });
      const s = res.data.session;
      upsertSessionSummary(sessionSummaryFromDetail(s));
      return s;
    } catch {
      return makeOfflineSession();
    }
  }, [upsertSessionSummary]);

  const persistSessionNow = useCallback(
    async (id: string, nextMessages: ChatMessage[]): Promise<boolean> => {
      if (nextMessages.length === 0 && !id.startsWith('offline-')) {
        return true;
      }

      writeCachedMessages(user?.id, id, nextMessages);

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
            const merged = [summary, ...prev.filter((s) => s.id !== id && s.id !== targetId)];
            cacheSessionList(merged);
            return merged;
          });
          if (activeIdRef.current === id) {
            setActiveChat(targetId);
          }
        } catch {
          return false;
        }
      }

      try {
        const res = await api.patch<{ session: SessionDetail }>(
          `/ai/aysop-chats/${targetId}`,
          { messages: nextMessages },
          { timeout: API_AYSOP_SESSION_PERSIST_TIMEOUT_MS }
        );
        upsertSessionSummary(sessionSummaryFromDetail(res.data.session));
        return true;
      } catch {
        return false;
      }
    },
    [user?.id, setActiveChat, upsertSessionSummary, cacheSessionList]
  );

  const schedulePersist = useCallback(
    (id: string, nextMessages: ChatMessage[]) => {
      writeCachedMessages(user?.id, id, nextMessages);
      pendingPersistRef.current = { id, messages: nextMessages };
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = setTimeout(() => {
        persistDebounceRef.current = null;
        const pending = pendingPersistRef.current;
        if (!pending) return;
        const task = persistSessionNow(pending.id, pending.messages);
        persistInFlightRef.current = task;
        void task.finally(() => {
          if (persistInFlightRef.current === task) persistInFlightRef.current = null;
        });
      }, PERSIST_DEBOUNCE_MS);
    },
    [persistSessionNow, user?.id]
  );

  const flushPersist = useCallback(async (): Promise<boolean> => {
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = null;
    }
    if (persistInFlightRef.current) {
      await persistInFlightRef.current;
    }
    const pending = pendingPersistRef.current;
    if (!pending || pending.messages.length === 0) return true;
    pendingPersistRef.current = null;
    const task = persistSessionNow(pending.id, pending.messages);
    persistInFlightRef.current = task;
    try {
      return await task;
    } finally {
      if (persistInFlightRef.current === task) persistInFlightRef.current = null;
    }
  }, [persistSessionNow]);

  const loadSession = useCallback(
    async (id: string, opts?: { background?: boolean }) => {
      const cached = (readCachedMessages(user?.id, id) ?? []) as ChatMessage[];
      if (!opts?.background) {
        setMessages(cached);
        messagesRef.current = cached;
      }
      try {
        const res = await api.get<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`, {
          timeout: LOAD_SESSION_TIMEOUT_MS,
        });
        const serverMessages = (res.data.session.messages ?? []) as ChatMessage[];
        const best = pickBestStoredMessages(cached, serverMessages) as ChatMessage[];
        if (activeIdRef.current === id) {
          setMessages(best);
          messagesRef.current = best;
        }
        writeCachedMessages(user?.id, id, best);
        upsertSessionSummary(sessionSummaryFromDetail({ ...res.data.session, messages: best }));

        if (cached.length > serverMessages.length && best.length > 0 && !id.startsWith('offline-')) {
          void persistSessionNow(id, best);
        }
      } catch {
        if (!opts?.background && cached.length) {
          setMessages(cached);
          messagesRef.current = cached;
        }
      }
    },
    [persistSessionNow, upsertSessionSummary, user?.id]
  );

  const renameSession = useCallback(
    (id: string, title: string) => {
      const trimmed = title.trim().slice(0, 120);
      if (!trimmed) return;

      setSessions((prev) => {
        const merged = prev.map((s) =>
          s.id === id ? { ...s, title: trimmed, updatedAt: new Date().toISOString() } : s
        );
        cacheSessionList(merged);
        return merged;
      });

      if (id.startsWith('offline-')) return;

      void api
        .patch<{ session: SessionDetail }>(`/ai/aysop-chats/${id}`, { title: trimmed })
        .then((res) => upsertSessionSummary(sessionSummaryFromDetail(res.data.session)))
        .catch(() => {
          /* optimistic title stays */
        });
    },
    [cacheSessionList, upsertSessionSummary]
  );

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
        cacheSessionList(merged);
        return merged;
      });
    },
    [cacheSessionList]
  );

  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    const cachedList = readCachedSessionList(user.id) ?? [];
    if (cachedList.length) {
      setSessions(cachedList);
      setListLoading(false);
    }

    const instantId =
      chatParam && !isEphemeralOfflineSession(chatParam, user.id)
        ? chatParam
        : pickRestoreChatId(user.id, cachedList);

    if (instantId) {
      setActiveId(instantId);
      activeIdRef.current = instantId;
      const cachedMsgs = (readCachedMessages(user.id, instantId) ?? []) as ChatMessage[];
      setMessages(cachedMsgs);
      messagesRef.current = cachedMsgs;
      if (!instantId.startsWith('offline-')) {
        writeLastActiveChatId(user.id, instantId);
      }
      if (!chatParam || chatParam !== instantId) {
        router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(instantId)}`, { scroll: false });
      }
      void loadSession(instantId, { background: true });
    }

    void (async () => {
      const listPromise = api
        .get<{ sessions: AysopChatSessionSummary[] }>('/ai/aysop-chats', {
          timeout: FETCH_TIMEOUT_MS,
        })
        .catch(() => ({ data: { sessions: [] as AysopChatSessionSummary[] } }));

      const listRes = await listPromise;
      const serverSessions = listRes.data.sessions ?? [];

      if (chatParam) {
        const mergedForPick = (() => {
          const map = new Map<string, AysopChatSessionSummary>();
          for (const s of cachedList) map.set(s.id, s);
          for (const s of serverSessions) map.set(s.id, s);
          return [...map.values()].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
        })();

        const restoreId = isEphemeralOfflineSession(chatParam, user.id)
          ? pickRestoreChatId(user.id, mergedForPick) ?? chatParam
          : chatParam;

        if (restoreId !== activeIdRef.current) {
          setActiveChat(restoreId);
          hydrateMessages(restoreId);
          void loadSession(restoreId, { background: true });
        }
        mergeSessions(serverSessions, restoreId);
        setListLoading(false);
        return;
      }

      const mergedLocal = (() => {
        const map = new Map<string, AysopChatSessionSummary>();
        for (const s of cachedList) map.set(s.id, s);
        for (const s of serverSessions) map.set(s.id, s);
        return [...map.values()].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      })();

      const restoreId = pickRestoreChatId(user.id, mergedLocal);
      if (restoreId) {
        setSessions(mergedLocal);
        cacheSessionList(mergedLocal);
        if (restoreId !== activeIdRef.current) {
          setActiveChat(restoreId);
          hydrateMessages(restoreId);
          void loadSession(restoreId, { background: true });
        }
        mergeSessions(serverSessions, restoreId);
        setListLoading(false);
        return;
      }

      if (activeIdRef.current) {
        mergeSessions(serverSessions, activeIdRef.current);
        setListLoading(false);
        return;
      }

      const quick = makeOfflineSession();
      setSessions((prev) => {
        const map = new Map<string, AysopChatSessionSummary>();
        for (const s of serverSessions) map.set(s.id, s);
        for (const s of prev) {
          if (!map.has(s.id) && !s.id.startsWith('offline-')) map.set(s.id, s);
        }
        map.set(quick.id, sessionSummaryFromDetail(quick));
        const merged = [...map.values()].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        cacheSessionList(merged);
        return merged;
      });
      setActiveChat(quick.id, { remember: false });
      setMessages([]);
      setListLoading(false);

      void (async () => {
        const created = await createSession();
        if (created.id !== quick.id && activeIdRef.current === quick.id) {
          setSessions((prev) => {
            const offline = prev.find((s) => s.id === quick.id);
            const summary: AysopChatSessionSummary = {
              ...sessionSummaryFromDetail(created),
              title: offline?.title && offline.title !== 'New chat' ? offline.title : created.title,
            };
            const merged = [summary, ...prev.filter((s) => s.id !== quick.id && s.id !== created.id)];
            cacheSessionList(merged);
            return merged;
          });
          setActiveChat(created.id, { remember: false });
          setMessages([]);
        }
      })();
    })();
  }, [
    user?.id,
    chatParam,
    createSession,
    loadSession,
    mergeSessions,
    setActiveChat,
    hydrateMessages,
    cacheSessionList,
    router,
  ]);

  useEffect(() => {
    if (!user?.id) {
      initRef.current = false;
      setListLoading(true);
      setActiveId(null);
      activeIdRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    if (!chatParam || chatParam === activeIdRef.current) return;
    setActiveId(chatParam);
    activeIdRef.current = chatParam;
    hydrateMessages(chatParam);
    void loadSession(chatParam, { background: true });
  }, [chatParam, hydrateMessages, loadSession]);

  useEffect(() => {
    return () => {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    };
  }, []);

  const handleNewChat = () => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;

    const prevId = activeIdRef.current;
    const prevMsgs = [...messagesRef.current];
    const quick = makeOfflineSession();

    setSessions((prev) => {
      const merged = [quick, ...prev.filter((s) => !s.id.startsWith('offline-') || s.id === prevId)];
      cacheSessionList(merged);
      return merged;
    });
    setMessages([]);
    messagesRef.current = [];
    setActiveChat(quick.id, { remember: false });

    void (async () => {
      try {
        if (prevId && prevMsgs.length > 0) {
          pendingPersistRef.current = { id: prevId, messages: prevMsgs };
          await flushPersist();
        }
        const created = await createSession();
        if (created.id !== quick.id && activeIdRef.current === quick.id) {
          setSessions((prev) => {
            const offline = prev.find((s) => s.id === quick.id);
            const summary: AysopChatSessionSummary = {
              ...sessionSummaryFromDetail(created),
              title: offline?.title && offline.title !== 'New chat' ? offline.title : created.title,
            };
            const merged = [summary, ...prev.filter((s) => s.id !== quick.id && s.id !== created.id)];
            cacheSessionList(merged);
            return merged;
          });
          setActiveChat(created.id, { remember: false });
          setMessages([]);
        }
      } finally {
        actionLockRef.current = false;
      }
    })();
  };

  const handleSelect = (id: string) => {
    if (id === activeIdRef.current || actionLockRef.current) return;

    const prevId = activeIdRef.current;
    const prevMsgs = [...messagesRef.current];

    hydrateMessages(id);
    setActiveChat(id);

    void (async () => {
      if (prevId && prevMsgs.length > 0) {
        pendingPersistRef.current = { id: prevId, messages: prevMsgs };
        await flushPersist();
      }
      await loadSession(id, { background: true });
    })();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this chat?')) return;
    try {
      if (!id.startsWith('offline-')) {
        await api.delete(`/ai/aysop-chats/${id}`);
      }
      writeCachedMessages(user?.id, id, []);
      const remaining = sessions.filter((s) => s.id !== id);
      setSessions(remaining);
      cacheSessionList(remaining);
      if (activeId === id) {
        const next = visibleChatSessions(remaining, null);
        if (next.length) {
          handleSelect(next[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch {
      /* ignore */
    }
  };

  const handleMessagesChange = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      messagesRef.current = next;
      const id = activeIdRef.current;
      if (!id) return;
      schedulePersist(id, next);
    },
    [schedulePersist]
  );

  const handleClearHistory = async () => {
    setClearingHistory(true);
    try {
      await flushPersist();
      const ids = sessions.map((s) => s.id);
      await Promise.allSettled(
        ids.filter((id) => !id.startsWith('offline-')).map((id) => api.delete(`/ai/aysop-chats/${id}`))
      );
      clearCachedMessagesForSessions(user?.id, ids);
      writeCachedSessionList(user?.id, []);
      setSessions([]);
      setMessages([]);
      messagesRef.current = [];
      setActiveId(null);
      activeIdRef.current = null;
      setClearHistoryOpen(false);
      handleNewChat();
    } finally {
      setClearingHistory(false);
    }
  };

  useEffect(() => {
    if (!settingsToast) return;
    const t = window.setTimeout(() => setSettingsToast(null), 2500);
    return () => window.clearTimeout(t);
  }, [settingsToast]);

  return (
    <div className="flex flex-col h-full min-h-0 bg-white dark:bg-neutral-950">
      <AysopChatHeader
        onNewChat={handleNewChat}
        onOpenBrandContext={() => {
          const chatId = activeIdRef.current;
          const suffix =
            chatId && !chatId.startsWith('offline-')
              ? `?c=${encodeURIComponent(chatId)}`
              : '';
          router.push(`/dashboard/aysop-ai/brand-context${suffix}`);
        }}
        onOpenSettings={() => setSettingsToast('Settings coming soon.')}
        onClearHistory={() => setClearHistoryOpen(true)}
      />
      {settingsToast ? (
        <div className="shrink-0 px-4 py-2 text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800">
          {settingsToast}
        </div>
      ) : null}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col">
          <AysopChatPanel
            key={activeId ?? 'none'}
            messages={messages}
            onMessagesChange={handleMessagesChange}
          />
        </div>
        <AysopChatSidebar
          sessions={visibleSessions}
          activeId={activeId}
          loading={listLoading && visibleSessions.length === 0}
          onSelect={handleSelect}
          onDelete={(id) => void handleDelete(id)}
          onRename={renameSession}
          side="right"
        />
      </div>
      <ConfirmModal
        open={clearHistoryOpen}
        onClose={() => {
          if (!clearingHistory) setClearHistoryOpen(false);
        }}
        title="Clear chat history?"
        message="This will delete all iZop AI conversations. This cannot be undone."
        confirmLabel="Clear history"
        cancelLabel="Cancel"
        variant="danger"
        confirmLoading={clearingHistory}
        confirmLoadingLabel="Clearing…"
        dismissible={!clearingHistory}
        onConfirm={() => void handleClearHistory()}
      />
    </div>
  );
}
