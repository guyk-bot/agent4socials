'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { API_AYSOP_SESSION_PERSIST_TIMEOUT_MS } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatPanel, { type ChatMessage } from '@/components/aysop/AysopChatPanel';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  readCachedMessages,
  readCachedSessionList,
  readLastActiveChatId,
  clearLastActiveChatId,
  writeCachedMessages,
  writeCachedSessionList,
  writeLastActiveChatId,
} from '@/lib/ai/aysop-chat-local-cache';
import {
  previewFromMessages,
  sessionHasConversation,
  titleFromMessages,
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

  if (!activeId) {
    activeId = `offline-${Date.now()}`;
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

  const initRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(instantBoot.messages);
  const activeIdRef = useRef<string | null>(instantBoot.activeId);
  const persistInFlightRef = useRef<Promise<boolean> | null>(null);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ id: string; messages: ChatMessage[] } | null>(null);
  const actionLockRef = useRef(false);
  const [panelResetKey, setPanelResetKey] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    if (!user?.id || !activeId) return;
    if (messages.length > 0) return;
    const cached = readCachedMessages(user.id, activeId);
    if (cached?.length) {
      setMessages(cached as ChatMessage[]);
      messagesRef.current = cached as ChatMessage[];
    }
  }, [user?.id, activeId, messages.length]);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  const visibleSessions = useMemo(() => visibleChatSessions(sessions), [sessions]);

  const cacheSessionList = useCallback(
    (next: AysopChatSessionSummary[]) => {
      writeCachedSessionList(user?.id, next.filter(sessionHasConversation));
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
      if (isEphemeralOfflineSession(id, user?.id)) {
        router.replace('/dashboard/aysop-ai', { scroll: false });
      } else {
        router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(id)}`, { scroll: false });
      }
    },
    [router, user?.id]
  );

  const startEphemeralChat = useCallback(() => {
    const quick = makeOfflineSession();
    setMessages([]);
    messagesRef.current = [];
    setActiveId(quick.id);
    activeIdRef.current = quick.id;
    router.replace('/dashboard/aysop-ai', { scroll: false });
    return quick.id;
  }, [router]);

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
          writeCachedMessages(user?.id, targetId, nextMessages);
          if (pendingPersistRef.current?.id === id) {
            pendingPersistRef.current = { id: targetId, messages: nextMessages };
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
    async (id: string, opts?: { background?: boolean }): Promise<boolean> => {
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
        let best = pickBestStoredMessages(cached, serverMessages) as ChatMessage[];
        if (best.length === 0 && cached.length > 0) best = cached;
        if (activeIdRef.current === id) {
          setMessages(best);
          messagesRef.current = best;
        }
        writeCachedMessages(user?.id, id, best);
        upsertSessionSummary(sessionSummaryFromDetail({ ...res.data.session, messages: best }));

        if (cached.length > serverMessages.length && best.length > 0 && !id.startsWith('offline-')) {
          void persistSessionNow(id, best);
        }
        return true;
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        if (status === 404) {
          setSessions((prev) => {
            const remaining = prev.filter((s) => s.id !== id);
            cacheSessionList(remaining);
            return remaining;
          });
          writeCachedMessages(user?.id, id, []);
          if (readLastActiveChatId(user?.id) === id) {
            clearLastActiveChatId(user?.id);
          }
          if (activeIdRef.current === id) {
            startEphemeralChat();
          }
          return false;
        }
        if (!opts?.background && cached.length) {
          setMessages(cached);
          messagesRef.current = cached;
        }
        return true;
      }
    },
    [persistSessionNow, upsertSessionSummary, user?.id, cacheSessionList, startEphemeralChat]
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

    const cachedList = (readCachedSessionList(user.id) ?? []).filter(sessionHasConversation);
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

        const knownIds = new Set(mergedForPick.map((s) => s.id));
        if (!knownIds.has(chatParam) && !isEphemeralOfflineSession(chatParam, user.id)) {
          clearLastActiveChatId(user.id);
          router.replace('/dashboard/aysop-ai', { scroll: false });
          mergeSessions(serverSessions, null);
          startEphemeralChat();
          setListLoading(false);
          return;
        }

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

      mergeSessions(serverSessions, null);
      startEphemeralChat();
      setListLoading(false);
    })();
  }, [
    user?.id,
    chatParam,
    loadSession,
    mergeSessions,
    setActiveChat,
    hydrateMessages,
    cacheSessionList,
    router,
    startEphemeralChat,
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
    if (isEphemeralOfflineSession(chatParam, user?.id)) {
      router.replace('/dashboard/aysop-ai', { scroll: false });
      startEphemeralChat();
      return;
    }
    setActiveId(chatParam);
    activeIdRef.current = chatParam;
    hydrateMessages(chatParam);
    void loadSession(chatParam, { background: true }).then((ok) => {
      if (!ok && activeIdRef.current === chatParam) {
        startEphemeralChat();
      }
    });
  }, [chatParam, hydrateMessages, loadSession, router, startEphemeralChat, user?.id]);

  useEffect(() => {
    return () => {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    };
  }, []);

  const handleNewChat = () => {
    setPanelResetKey((k) => k + 1);

    const prevId = activeIdRef.current;
    const prevMsgs = [...messagesRef.current];

    setSessions((prev) => {
      const kept = prev.filter(sessionHasConversation);
      cacheSessionList(kept);
      return kept;
    });
    startEphemeralChat();

    if (prevId && prevMsgs.length > 0) {
      pendingPersistRef.current = { id: prevId, messages: prevMsgs };
      void flushPersist();
    }
  };

  const handleSelect = (id: string) => {
    if (id === activeIdRef.current || actionLockRef.current) return;
    setPanelResetKey((k) => k + 1);

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

  const executeDelete = useCallback(
    (id: string) => {
      const wasActive = activeIdRef.current === id;
      writeCachedMessages(user?.id, id, []);

      if (readLastActiveChatId(user?.id) === id) {
        clearLastActiveChatId(user?.id);
      }

      let remaining: AysopChatSessionSummary[] = [];
      setSessions((prev) => {
        remaining = prev.filter((s) => s.id !== id);
        cacheSessionList(remaining);
        return remaining;
      });

      if (wasActive) {
        setPanelResetKey((k) => k + 1);
        const nextVisible = visibleChatSessions(remaining);
        if (nextVisible.length > 0) {
          const nextId = nextVisible[0]!.id;
          setMessages([]);
          messagesRef.current = [];
          hydrateMessages(nextId);
          setActiveChat(nextId);
          void loadSession(nextId, { background: true });
        } else {
          startEphemeralChat();
        }
      }

      if (!id.startsWith('offline-')) {
        void api.delete(`/ai/aysop-chats/${id}`).catch((e) => {
          const status = (e as { response?: { status?: number } })?.response?.status;
          if (status !== 404) {
            console.warn('[Aysop] server delete failed; removed chat locally', e);
          }
        });
      }
    },
    [cacheSessionList, hydrateMessages, loadSession, setActiveChat, startEphemeralChat, user?.id]
  );

  const handleMessagesChange = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      messagesRef.current = next;
      const id = activeIdRef.current;
      if (!id) return;

      if (next.length > 0) {
        const now = new Date().toISOString();
        const stored = next.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          artifacts: m.artifacts,
          attachments: m.attachments,
        }));
        upsertSessionSummary({
          id,
          title: titleFromMessages(stored),
          preview: previewFromMessages(stored),
          updatedAt: now,
          createdAt: now,
        });
      }

      schedulePersist(id, next);
    },
    [schedulePersist, upsertSessionSummary]
  );

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-neutral-950">
      <div className="flex flex-1 min-w-0 flex-col">
        <AysopChatPanel
          panelResetKey={panelResetKey}
          messages={messages}
          onMessagesChange={handleMessagesChange}
        />
      </div>
      <AysopChatSidebar
        sessions={visibleSessions}
        activeId={activeId}
        loading={listLoading && visibleSessions.length === 0}
        onSelect={handleSelect}
        onDelete={setPendingDeleteId}
        onRename={renameSession}
        side="right"
        onNewChat={handleNewChat}
      />
      <ConfirmModal
        open={pendingDeleteId !== null}
        onClose={() => setPendingDeleteId(null)}
        variant="danger"
        title="Delete chat?"
        message="This conversation will be removed from your history. This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => {
          const id = pendingDeleteId;
          if (id) executeDelete(id);
        }}
      />
    </div>
  );
}
