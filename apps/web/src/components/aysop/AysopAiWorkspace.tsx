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
  mergeChatSessionsWithServer,
  pickRestoreChatId,
  previewFromMessages,
  sessionHasConversation,
  sessionShouldShowInSidebar,
  titleFromMessages,
  visibleChatSessions,
  type AysopChatSessionSummary,
} from '@/lib/ai/aysop-chat-sessions';
import { pickBestStoredMessages } from '@/lib/ai/aysop-chat-persist';
import { consumeFunnelOpenAysopChatId } from '@/lib/funnel-onboarding';

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
  const sessions = (readCachedSessionList(userId) ?? []).filter((s) =>
    sessionShouldShowInSidebar(s, userId)
  );
  let activeId: string | null = null;

  if (chatParam && sessions.some((s) => s.id === chatParam)) {
    activeId = chatParam;
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
  const newChatIntentRef = useRef(false);
  const loadGenerationRef = useRef(0);

  const initRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>(instantBoot.messages);
  const activeIdRef = useRef<string | null>(instantBoot.activeId);
  const persistInFlightRef = useRef<Promise<boolean> | null>(null);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPersistRef = useRef<{ id: string; messages: ChatMessage[] } | null>(null);
  const actionLockRef = useRef(false);
  const lastNewChatClickRef = useRef(0);
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
    const base = visibleChatSessions(sessions, user?.id);
    
    // Always ensure proper chronological sorting (newest first)
    const sorted = base.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    
    if (!activeId || sorted.some((s) => s.id === activeId) || !activeId.startsWith('offline-')) {
      return sorted;
    }
    
    const hit = sessions.find((s) => s.id === activeId);
    const activeSummary: AysopChatSessionSummary = hit ?? {
      id: activeId,
      title: 'New chat',
      preview: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    return [activeSummary, ...sorted];
  }, [sessions, user?.id, activeId]);

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
      return res.data.session;
    } catch {
      return makeOfflineSession();
    }
  }, []);

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
      const gen = loadGenerationRef.current;
      const cached = (readCachedMessages(user?.id, id) ?? []) as ChatMessage[];
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
          if (activeIdRef.current === id) {
            startEphemeralChat();
          }
          return false;
        }
        if (!opts?.background && cached.length && gen === loadGenerationRef.current) {
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

  useEffect(() => {
    if (!user?.id || initRef.current) return;
    initRef.current = true;

    const cachedList = (readCachedSessionList(user.id) ?? []).filter((s) =>
      sessionShouldShowInSidebar(s, user.id)
    );
    if (cachedList.length) {
      setSessions(cachedList);
    }

    const funnelImportedChatId = consumeFunnelOpenAysopChatId();
    const instantId =
      funnelImportedChatId ??
      (chatParam && cachedList.some((s) => s.id === chatParam)
        ? chatParam
        : pickRestoreChatId(user.id, cachedList));

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

      const merged = mergeChatSessionsWithServer(user.id, serverSessions, cachedList);
      if (!newChatIntentRef.current) {
        // Ensure proper sorting when setting merged sessions
        const sortedMerged = merged.sort((a, b) => 
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setSessions(sortedMerged);
        writeCachedSessionList(user.id, sortedMerged);
      }
      
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

      if (chatParam) {
        const known = merged.some((s) => s.id === chatParam);
        if (!known && !isEphemeralOfflineSession(chatParam, user.id)) {
          clearLastActiveChatId(user.id);
          router.replace('/dashboard/aysop-ai', { scroll: false });
          startEphemeralChat();
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
    if (!chatParam || chatParam === activeIdRef.current) return;
    if (newChatIntentRef.current) return;
    if (isEphemeralOfflineSession(chatParam, user?.id)) {
      router.replace('/dashboard/aysop-ai', { scroll: false });
      startEphemeralChat();
      return;
    }
    const known = (readCachedSessionList(user?.id) ?? []).some((s) => s.id === chatParam);
    if (user?.id && !known) {
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

  const handleNewChat = useCallback(() => {
    if (!user?.id) {
      console.error('No user ID available for new chat');
      return;
    }

    // Prevent rapid successive clicks (but allow reasonable frequency)
    const now = Date.now();
    if (now - lastNewChatClickRef.current < 300) {
      return;
    }
    lastNewChatClickRef.current = now;
    
    // Create temporary offline session IMMEDIATELY for instant UI
    const tempSession = makeOfflineSession();
    
    // IMMEDIATELY update UI - no dependencies on current state
    setMessages([]);
    messagesRef.current = [];
    clearLastActiveChatId(user?.id);
    setPanelResetKey((k) => k + 1);

    // Add new chat to list IMMEDIATELY (always at top)
    setSessions((prev) => {
      const updated = [tempSession, ...prev];
      writeCachedSessionList(user?.id, updated);
      return updated;
    });
    
    // Set as active IMMEDIATELY
    setActiveId(tempSession.id);
    activeIdRef.current = tempSession.id;
    router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(tempSession.id)}`, { scroll: false });

    // Create server session in background (independent of UI state)
    void (async () => {
      try {
        const serverSession = await createSession();
        
        // Only replace temp session if it still exists and is the same one
        setSessions((currentSessions) => {
          const tempIndex = currentSessions.findIndex(s => s.id === tempSession.id);
          if (tempIndex === -1) return currentSessions; // Temp session already gone
          
          const updated = [...currentSessions];
          updated[tempIndex] = {
            id: serverSession.id,
            title: 'New chat',
            updatedAt: serverSession.updatedAt,
            createdAt: serverSession.createdAt,
            preview: null,
          };
          writeCachedSessionList(user?.id, updated);
          return updated;
        });
        
        // Update active reference only if this temp session is still active
        if (activeIdRef.current === tempSession.id) {
          setActiveId(serverSession.id);
          activeIdRef.current = serverSession.id;
          writeLastActiveChatId(user?.id, serverSession.id);
          router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(serverSession.id)}`, { scroll: false });
        }
        
      } catch (error) {
        console.error('Failed to create server session:', error);
        // Temp session remains - user can still use it
      }
    })();
  }, [user?.id, router]);

  const handleSelect = (id: string) => {
    if (id === activeIdRef.current || actionLockRef.current) return;
    newChatIntentRef.current = false;
    loadGenerationRef.current += 1;
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
    async (id: string) => {
      setPendingDeleteId(null);

      const wasActive = activeIdRef.current === id;

      // Immediately remove from local state and cache for instant UX
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== id);
        writeCachedSessionList(user?.id, filtered);
        return filtered;
      });

      // Clear cached messages
      writeCachedMessages(user?.id, id, []);

      // Clear from last active if needed
      if (readLastActiveChatId(user?.id) === id) {
        clearLastActiveChatId(user?.id);
      }

      // If this was the active chat, switch to another one
      if (wasActive) {
        // Find remaining sessions after deletion
        const currentSessions = sessions.filter((s) => s.id !== id);
        
        if (currentSessions.length > 0) {
          // Sort to ensure we get the most recent chat
          const sorted = currentSessions.sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
          );
          const next = sorted[0];
          setActiveId(next.id);
          activeIdRef.current = next.id;
          const cached = readCachedMessages(user?.id, next.id) || [];
          setMessages(cached as ChatMessage[]);
          messagesRef.current = cached as ChatMessage[];
          writeLastActiveChatId(user?.id, next.id);
          router.replace(`/dashboard/aysop-ai?c=${encodeURIComponent(next.id)}`, { scroll: false });
        } else {
          // No chats left, create a new one
          setMessages([]);
          messagesRef.current = [];
          setActiveId(null);
          activeIdRef.current = null;
          router.replace('/dashboard/aysop-ai', { scroll: false });
        }
        setPanelResetKey((k) => k + 1);
      }

      // Delete from server in background (after UI is already updated)
      if (!id.startsWith('offline-')) {
        try {
          await api.delete(`/ai/aysop-chats/${id}`, { timeout: 10000 });
        } catch (e) {
          console.warn('Server delete failed for chat', id, e);
          // The session is already gone from UI, so this is just a background cleanup
          // The server sync logic will handle any inconsistencies on next load
        }
      }
    },
    [sessions, user?.id, router]
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
      const summary: AysopChatSessionSummary = {
        id,
        title: titleFromMessages(stored),
        preview: previewFromMessages(stored),
        updatedAt: now,
        createdAt: now,
      };
      const hasUserMessage = stored.some(
        (m) =>
          m.role === 'user' && (m.content.trim() || (m.attachments?.length ?? 0) > 0)
      );
      if (hasUserMessage) {
        newChatIntentRef.current = false;
        upsertSessionSummary(summary);
      }

      schedulePersist(id, next);
    },
    [schedulePersist, upsertSessionSummary, user?.id]
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
