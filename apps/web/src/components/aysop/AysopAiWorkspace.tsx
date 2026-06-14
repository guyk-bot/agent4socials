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
  readDeletedChatIds,
  readLastActiveChatId,
  clearLastActiveChatId,
  markChatDeleted,
  readPendingNewChatId,
  writePendingNewChatId,
  clearPendingNewChatId,
  writeCachedMessages,
  writeCachedSessionList,
  writeLastActiveChatId,
} from '@/lib/ai/aysop-chat-local-cache';
import {
  dedupeChatSessions,
  mergeChatSessionsWithServer,
  pickRestoreChatId,
  previewFromMessages,
  sessionHasConversation,
  sessionHasUserMessages,
  sessionShouldShowInSidebar,
  withPendingNewChatSession,
  titleFromMessages,
  shouldReplaceChatTitle,
  visibleChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';
import { pickBestStoredMessages } from '@/lib/ai/aysop-chat-persist';
import { consumeFunnelOpenAysopChatId } from '@/lib/funnel-onboarding';
import { abortChatRunner } from '@/lib/ai/aysop-chat-runner';

function isEmptyServerChat(s: AysopChatSessionSummary, userId?: string): boolean {
  return !s.id.startsWith('offline-') && !sessionHasConversation(s, userId);
}

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
  if (userId && id === readPendingNewChatId(userId)) return false;
  const cached = readCachedMessages(userId, id);
  return !cached?.length;
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
  const sessions = withPendingNewChatSession(
    dedupeChatSessions(
      (readCachedSessionList(userId) ?? []).filter((s) =>
        sessionShouldShowInSidebar(s, userId) && !readDeletedChatIds(userId).has(s.id)
      )
    ),
    userId
  );
  const pendingId = readPendingNewChatId(userId);
  let activeId: string | null = pendingId ?? chatParam;

  if (!activeId) {
    activeId = pickRestoreChatId(userId, sessions);
  } else if (activeId.startsWith('offline-') && !sessions.some((s) => s.id === activeId)) {
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
  const newChatIntentRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const initRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(instantBoot.messages);
  const activeIdRef = useRef<string | null>(instantBoot.activeId);
  const persistInFlightRef = useRef<Promise<boolean> | null>(null);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ id: string; messages: ChatMessage[] } | null>(null);
  const actionLockRef = useRef(false);
  const offlineToServerPromiseRef = useRef<Map<string, Promise<SessionDetail>>>(new Map());
  const [panelResetKey, setPanelResetKey] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useLayoutEffect(() => {
    if (newChatIntentRef.current) return;
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

  const visibleSessions = useMemo(() => {
    return visibleChatSessions(sessions, user?.id).sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [sessions, user?.id]);

  const cacheSessionList = useCallback(
    (next: AysopChatSessionSummary[]) => {
      writeCachedSessionList(
        user?.id,
        next.filter((s) => sessionShouldShowInSidebar(s, user?.id))
      );
    },
    [user?.id]
  );

  const upsertSessionSummary = useCallback(
    (summary: AysopChatSessionSummary, bumpToTop = true) => {
      if (readDeletedChatIds(user?.id).has(summary.id)) return;
      setSessions((prev) => {
        const rest = prev.filter((s) => s.id !== summary.id);
        const merged = dedupeChatSessions(
          bumpToTop ? [summary, ...rest] : [...rest, summary]
        );
        cacheSessionList(merged);
        return merged;
      });
    },
    [cacheSessionList, user?.id]
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

  const restoreActiveChat = useCallback(
    (id: string) => {
      setActiveId(id);
      activeIdRef.current = id;
      if (!id.startsWith('offline-') && user?.id) {
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

  const persistSessionNow = useCallback(
    async (id: string, nextMessages: ChatMessage[]): Promise<boolean> => {
      if (nextMessages.length === 0 && !id.startsWith('offline-')) {
        return true;
      }

      writeCachedMessages(user?.id, id, nextMessages);

      let targetId = id;
      if (id.startsWith('offline-')) {
        try {
          let promise = offlineToServerPromiseRef.current.get(id);
          if (!promise) {
            promise = api
              .post<{ session: SessionDetail }>('/ai/aysop-chats', {})
              .then((res) => res.data.session);
            offlineToServerPromiseRef.current.set(id, promise);
            void promise.finally(() => {
              offlineToServerPromiseRef.current.delete(id);
            });
          }
          const created = await promise;
          targetId = created.id;
          setSessions((prev) => {
            const offline = prev.find((s) => s.id === id);
            const summary: AysopChatSessionSummary = {
              id: targetId,
              title: offline?.title ?? 'New chat',
              updatedAt: created.updatedAt,
              createdAt: created.createdAt,
              preview: null,
            };
            const merged = dedupeChatSessions([
              summary,
              ...prev.filter((s) => s.id !== id && s.id !== targetId),
            ]);
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
      if (readDeletedChatIds(user?.id).has(id)) return false;
      const gen = loadGenerationRef.current;
      const cached = (readCachedMessages(user?.id, id) ?? []) as ChatMessage[];
      if (id.startsWith('offline-')) {
        if (!opts?.background && gen === loadGenerationRef.current) {
          setMessages(cached);
          messagesRef.current = cached;
        }
        return true;
      }
      if (!opts?.background && gen === loadGenerationRef.current) {
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
        if (activeIdRef.current === id && gen === loadGenerationRef.current) {
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
          if (user?.id && activeIdRef.current === id) {
            const fallback = pickRestoreChatId(user.id, readCachedSessionList(user.id) ?? []);
            if (fallback && fallback !== id) {
              restoreActiveChat(fallback);
              hydrateMessages(fallback);
            } else {
              startEphemeralChat();
            }
          }
          return false;
        }
        if (!opts?.background && cached.length && gen === loadGenerationRef.current) {
          setMessages(cached);
          messagesRef.current = cached;
        }
        return cached.length > 0;
      }
    },
    [persistSessionNow, upsertSessionSummary, user?.id, cacheSessionList, startEphemeralChat, restoreActiveChat, hydrateMessages]
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

  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    const cachedList = withPendingNewChatSession(
      dedupeChatSessions(
        (readCachedSessionList(user.id) ?? []).filter(
          (s) =>
            sessionShouldShowInSidebar(s, user.id) && !readDeletedChatIds(user.id).has(s.id)
        )
      ),
      user.id
    );
    if (cachedList.length) {
      setSessions(cachedList);
    }

    const funnelImportedChatId = consumeFunnelOpenAysopChatId();
    const pendingNew = readPendingNewChatId(user.id);
    const instantId =
      funnelImportedChatId ??
      pendingNew ??
      chatParam ??
      pickRestoreChatId(user.id, cachedList);

    if (instantId && !newChatIntentRef.current) {
      setActiveId(instantId);
      activeIdRef.current = instantId;
      const cachedMsgs = (readCachedMessages(user.id, instantId) ?? []) as ChatMessage[];
      setMessages(cachedMsgs);
      messagesRef.current = cachedMsgs;
      if (!instantId.startsWith('offline-')) {
        writeLastActiveChatId(user.id, instantId);
      }
      if (!chatParam || chatParam !== instantId) {
        if (instantId.startsWith('offline-')) {
          router.replace('/dashboard/aysop-ai', { scroll: false });
        } else {
          router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(instantId)}`, { scroll: false });
        }
      }
      if (!instantId.startsWith('offline-')) {
        void loadSession(instantId, { background: true });
      }
    }

    void (async () => {
      const listPromise = api
        .get<{ sessions: AysopChatSessionSummary[] }>('/ai/aysop-chats', {
          timeout: FETCH_TIMEOUT_MS,
        })
        .catch(() => ({ data: { sessions: [] as AysopChatSessionSummary[] } }));

      const listRes = await listPromise;
      const serverSessions = listRes.data.sessions ?? [];

      let merged = mergeChatSessionsWithServer(
        user.id,
        serverSessions,
        readCachedSessionList(user.id) ?? cachedList
      );
      if (!newChatIntentRef.current) {
        setSessions((prev) => {
          const next = mergeChatSessionsWithServer(user.id, serverSessions, prev);
          writeCachedSessionList(user.id, next);
          return next;
        });
      }

      merged = mergeChatSessionsWithServer(
        user.id,
        serverSessions,
        readCachedSessionList(user.id) ?? merged
      );
      
      // Clear any cached messages for sessions that no longer exist on the server
      const serverIds = new Set(serverSessions.map(s => s.id));
      cachedList.forEach(session => {
        if (!session.id.startsWith('offline-') && !serverIds.has(session.id)) {
          writeCachedMessages(user.id, session.id, []);
        }
      });

      if (funnelImportedChatId) {
        const known = merged.some((s) => s.id === funnelImportedChatId);
        if (known) {
          if (!newChatIntentRef.current) {
            setActiveChat(funnelImportedChatId);
            hydrateMessages(funnelImportedChatId);
            void loadSession(funnelImportedChatId, { background: true });
          }
        } else if (!newChatIntentRef.current) {
          void loadSession(funnelImportedChatId).then((ok) => {
            if (ok) {
              setActiveChat(funnelImportedChatId);
            }
          });
        }
        return;
      }

      if (newChatIntentRef.current) {
        return;
      }

      const pendingNew = readPendingNewChatId(user.id);
      if (pendingNew && activeIdRef.current === pendingNew) {
        return;
      }

      if (chatParam) {
        const known = merged.some((s) => s.id === chatParam);
        if (!known && !isEphemeralOfflineSession(chatParam, user.id)) {
          restoreActiveChat(chatParam);
          hydrateMessages(chatParam);
          void loadSession(chatParam, { background: true });
          return;
        }

        const restoreId = isEphemeralOfflineSession(chatParam, user.id)
          ? pickRestoreChatId(user.id, merged) ?? chatParam
          : chatParam;

        if (restoreId !== activeIdRef.current) {
          setActiveChat(restoreId);
          hydrateMessages(restoreId);
          void loadSession(restoreId, { background: true });
        }
        return;
      }

      const restoreId = pickRestoreChatId(user.id, merged);
      if (restoreId) {
        if (restoreId !== activeIdRef.current) {
          setActiveChat(restoreId);
          hydrateMessages(restoreId);
          void loadSession(restoreId, { background: true });
        }
        return;
      }

      if (activeIdRef.current && merged.some((s) => s.id === activeIdRef.current)) {
        return;
      }

      startEphemeralChat();
    })();
  }, [
    user?.id,
    chatParam,
    loadSession,
    setActiveChat,
    hydrateMessages,
    cacheSessionList,
    router,
    restoreActiveChat,
    startEphemeralChat,
  ]);

  useEffect(() => {
    if (!user?.id) {
      initRef.current = false;
      setActiveId(null);
      activeIdRef.current = null;
    }
  }, [user?.id]);

  useEffect(() => {
    const pending = user?.id ? readPendingNewChatId(user.id) : null;
    if (pending && chatParam && chatParam !== pending) {
      restoreActiveChat(pending);
      hydrateMessages(pending);
      return;
    }

    if (chatParam === activeIdRef.current) return;
    if (newChatIntentRef.current) return;

    if (!chatParam) {
      const pending = user?.id ? readPendingNewChatId(user.id) : null;
      if (pending && activeIdRef.current === pending) return;
    }

    if (!chatParam || chatParam === activeIdRef.current) return;

    if (isEphemeralOfflineSession(chatParam, user?.id)) {
      if (!user?.id) return;
      const restoreId = pickRestoreChatId(user.id, readCachedSessionList(user.id) ?? []);
      if (restoreId) {
        restoreActiveChat(restoreId);
        hydrateMessages(restoreId);
        void loadSession(restoreId, { background: true });
      }
      return;
    }

    restoreActiveChat(chatParam);
    hydrateMessages(chatParam);
    void loadSession(chatParam, { background: true }).then((ok) => {
      if (ok) return;
      if (activeIdRef.current !== chatParam) return;
      const cached = readCachedMessages(user?.id, chatParam);
      if (cached?.length) return;
      if (!user?.id) return;
      const fallback = pickRestoreChatId(user.id, readCachedSessionList(user.id) ?? []);
      if (fallback && fallback !== chatParam) {
        restoreActiveChat(fallback);
        hydrateMessages(fallback);
      }
    });
  }, [chatParam, hydrateMessages, loadSession, restoreActiveChat, user?.id]);

  useEffect(() => {
    return () => {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
    };
  }, []);

  useEffect(() => {
    return () => {
      const uid = user?.id;
      const id = activeIdRef.current;
      if (!uid || !id || id.startsWith('offline-')) return;
      writeLastActiveChatId(uid, id);
    };
  }, [user?.id]);

  const handleNewChat = useCallback(() => {
    if (!user?.id) return;

    newChatIntentRef.current = true;
    loadGenerationRef.current += 1;

    const prevId = activeIdRef.current;
    if (prevId) abortChatRunner(prevId, true);
    if (persistDebounceRef.current) {
      clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = null;
    }
    pendingPersistRef.current = null;

    const prevPending = readPendingNewChatId(user.id);
    if (prevPending && !sessionHasUserMessages(user.id, prevPending)) {
      writeCachedMessages(user.id, prevPending, []);
    }

    const tempSession = makeOfflineSession();
    writePendingNewChatId(user.id, tempSession.id);
    writeCachedMessages(user.id, tempSession.id, []);

    setMessages([]);
    messagesRef.current = [];
    setPanelResetKey((k) => k + 1);

    const summary = sessionSummaryFromDetail(tempSession);
    setSessions((prev) => {
      const withoutStalePending =
        prevPending && !sessionHasUserMessages(user.id, prevPending)
          ? prev.filter((s) => s.id !== prevPending)
          : prev;
      const merged = dedupeChatSessions([summary, ...withoutStalePending]);
      cacheSessionList(merged);
      return merged;
    });

    setActiveId(tempSession.id);
    activeIdRef.current = tempSession.id;
    router.replace('/dashboard/aysop-ai', { scroll: false });

    queueMicrotask(() => {
      newChatIntentRef.current = false;
    });
  }, [user?.id, router, cacheSessionList]);

  const handleSelect = (id: string) => {
    if (id === activeIdRef.current || actionLockRef.current) return;
    newChatIntentRef.current = false;
    if (user?.id && id !== readPendingNewChatId(user.id)) {
      clearPendingNewChatId(user.id);
    }
    loadGenerationRef.current += 1;

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
    async (id: string) => {
      setPendingDeleteId(null);

      const wasActive = activeIdRef.current === id;
      if (!id.startsWith('offline-')) {
        markChatDeleted(user?.id, id);
      }

      writeCachedMessages(user?.id, id, []);
      abortChatRunner(id, true);

      if (readPendingNewChatId(user?.id) === id) {
        clearPendingNewChatId(user?.id);
      }

      if (readLastActiveChatId(user?.id) === id) {
        clearLastActiveChatId(user?.id);
      }

      let nextActiveId: string | null = null;
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        writeCachedSessionList(user?.id, filtered);
        if (wasActive && filtered.length > 0) {
          const sorted = [...filtered].sort(
            (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          nextActiveId = sorted[0]!.id;
        }
        return filtered;
      });

      if (wasActive) {
        if (nextActiveId) {
          setActiveId(nextActiveId);
          activeIdRef.current = nextActiveId;
          const cached = readCachedMessages(user?.id, nextActiveId) || [];
          setMessages(cached as ChatMessage[]);
          messagesRef.current = cached as ChatMessage[];
          writeLastActiveChatId(user?.id, nextActiveId);
          router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(nextActiveId)}`, {
            scroll: false,
          });
        } else {
          setMessages([]);
          messagesRef.current = [];
          startEphemeralChat();
        }
        setPanelResetKey((k) => k + 1);
      }

      if (!id.startsWith('offline-')) {
        try {
          await api.delete(`/ai/aysop-chats/${id}`, { timeout: 10000 });
        } catch (e) {
          console.warn('Server delete failed for chat', id, e);
        }
      }
    },
    [user?.id, router, startEphemeralChat]
  );

  const handleMessagesChange = useCallback(
    (next: ChatMessage[]) => {
      setMessages(next);
      messagesRef.current = next;
      const id = activeIdRef.current;
      if (!id) return;

      const now = new Date().toISOString();
      const stored = next.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        artifacts: m.artifacts,
        attachments: m.attachments,
      }));
      const nextTitle = titleFromMessages(stored);
      setSessions((prev) => {
        const existing = prev.find((s) => s.id === id);
        const title =
          existing && !shouldReplaceChatTitle(existing.title, nextTitle)
            ? existing.title
            : nextTitle;
        const summary: AysopChatSessionSummary = {
          id,
          title,
          preview: previewFromMessages(stored),
          updatedAt: now,
          createdAt: existing?.createdAt ?? now,
        };
        const hasUserMessage = stored.some(
          (m) =>
            m.role === 'user' && (m.content.trim() || (m.attachments?.length ?? 0) > 0)
        );
        if (!hasUserMessage) return prev;
        newChatIntentRef.current = false;
        if (user?.id) {
          if (!id.startsWith('offline-')) {
            writeLastActiveChatId(user.id, id);
          }
          clearPendingNewChatId(user.id);
        }
        const rest = prev.filter((s) => s.id !== id);
        const merged = dedupeChatSessions([summary, ...rest]);
        writeCachedSessionList(user?.id, merged);
        return merged;
      });

      schedulePersist(id, next);
    },
    [schedulePersist, user?.id]
  );

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-neutral-950">
      <div className="flex flex-1 min-w-0 flex-col">
        <AysopChatPanel
          panelResetKey={panelResetKey}
          messages={messages}
          onMessagesChange={handleMessagesChange}
          sessionId={activeId}
          userId={user?.id ?? null}
        />
      </div>
      <AysopChatSidebar
        sessions={visibleSessions}
        activeId={activeId}
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
          if (id) void executeDelete(id);
        }}
      />
    </div>
  );
}
