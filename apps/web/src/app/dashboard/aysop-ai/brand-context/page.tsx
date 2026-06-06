'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import BrandContextForm from '@/components/brand-context/BrandContextForm';
import AysopChatSidebar from '@/components/aysop/AysopChatSidebar';
import AysopChatSidebarToggle from '@/components/aysop/AysopChatSidebarToggle';
import { useAuth } from '@/context/AuthContext';
import {
  readCachedSessionList,
  readLastActiveChatId,
  writeCachedSessionList,
} from '@/lib/ai/aysop-chat-local-cache';
import type { AysopChatSessionSummary } from '@/lib/ai/aysop-chat-sessions';

const FETCH_TIMEOUT_MS = 8_000;

function BrandContextContent() {
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const returnChat =
    searchParams.get('c') ?? (user?.id ? readLastActiveChatId(user.id) : null);

  const [sessions, setSessions] = useState<AysopChatSessionSummary[]>(() =>
    user?.id ? readCachedSessionList(user.id) ?? [] : []
  );
  const [listLoading, setListLoading] = useState(sessions.length === 0);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(true);

  useEffect(() => {
    if (!user?.id) return;
    const cached = readCachedSessionList(user.id) ?? [];
    if (cached.length) {
      setSessions(cached);
      setListLoading(false);
    }
    void api
      .get<{ sessions: AysopChatSessionSummary[] }>('/ai/aysop-chats', {
        timeout: FETCH_TIMEOUT_MS,
      })
      .then((res) => {
        const next = res.data.sessions ?? [];
        setSessions(next);
        writeCachedSessionList(user.id, next);
      })
      .catch(() => {
        /* keep cache */
      })
      .finally(() => setListLoading(false));
  }, [user?.id]);

  const brandContextHref = useMemo(() => {
    if (returnChat) {
      return `/dashboard/aysop-ai/brand-context?c=${encodeURIComponent(returnChat)}`;
    }
    return '/dashboard/aysop-ai/brand-context';
  }, [returnChat]);

  const handleSelect = useCallback(
    (id: string) => {
      router.push(`/dashboard/aysop-ai?c=${encodeURIComponent(id)}`);
    },
    [router]
  );

  const handleNewChat = useCallback(() => {
    router.push('/dashboard/aysop-ai');
  }, [router]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!window.confirm('Delete this chat?')) return;
      try {
        if (!id.startsWith('offline-')) {
          await api.delete(`/ai/aysop-chats/${id}`);
        }
        const remaining = sessions.filter((s) => s.id !== id);
        setSessions(remaining);
        writeCachedSessionList(user?.id, remaining);
      } catch {
        /* ignore */
      }
    },
    [sessions, user?.id]
  );

  return (
    <div className="flex h-full min-h-0 bg-white dark:bg-neutral-950">
      <div className="relative flex flex-1 min-w-0 flex-col overflow-y-auto">
        {!chatSidebarOpen ? (
          <AysopChatSidebarToggle
            onOpen={() => setChatSidebarOpen(true)}
            className="absolute left-3 top-3 z-10"
          />
        ) : null}
        <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8">
          <BrandContextForm variant="full" />
        </div>
      </div>
      {chatSidebarOpen ? (
        <AysopChatSidebar
          sessions={sessions}
          activeId={returnChat}
          loading={listLoading && sessions.length === 0}
          onSelect={handleSelect}
          onDelete={(id) => void handleDelete(id)}
          side="right"
          navActive="brand-context"
          brandContextHref={brandContextHref}
          onNewChat={handleNewChat}
          onClose={() => setChatSidebarOpen(false)}
        />
      ) : null}
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="flex items-center justify-center gap-2 h-64 text-neutral-500">
      <Loader2 className="animate-spin" size={22} />
      Loading…
    </div>
  );
}

export default function AysopBrandContextPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <BrandContextContent />
    </Suspense>
  );
}
