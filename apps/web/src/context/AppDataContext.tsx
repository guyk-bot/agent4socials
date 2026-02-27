'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';

export type CachedPost = {
  id: string;
  content?: string | null;
  thumbnailUrl?: string | null;
  permalinkUrl?: string | null;
  impressions: number;
  interactions: number;
  publishedAt: string;
  mediaType?: string | null;
  platform: string;
};

export type CachedInsights = {
  platform: string;
  followers: number;
  impressionsTotal: number;
  impressionsTimeSeries: Array<{ date: string; value: number }>;
  pageViewsTotal?: number;
  reachTotal?: number;
  profileViewsTotal?: number;
  insightsHint?: string;
};

type NotificationsCache = { inbox: number; comments: number; messages: number };

type AppDataContextType = {
  notifications: NotificationsCache;
  postsByAccountId: Record<string, CachedPost[]>;
  insightsByAccountId: Record<string, CachedInsights>;
  prefetchStatus: 'idle' | 'loading' | 'done';
  getPosts: (accountId: string) => CachedPost[] | undefined;
  getInsights: (accountId: string) => CachedInsights | undefined;
  setPostsForAccount: (accountId: string, posts: CachedPost[]) => void;
  setInsightsForAccount: (accountId: string, insights: CachedInsights) => void;
  setNotifications: (n: NotificationsCache) => void;
  invalidate: () => void;
};

const defaultNotifications: NotificationsCache = { inbox: 0, comments: 0, messages: 0 };

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setCachedAccounts } = useAccountsCache() ?? { setCachedAccounts: () => {} };
  const [notifications, setNotificationsState] = useState<NotificationsCache>(defaultNotifications);
  const [postsByAccountId, setPostsByAccountId] = useState<Record<string, CachedPost[]>>({});
  const [insightsByAccountId, setInsightsByAccountId] = useState<Record<string, CachedInsights>>({});
  const [prefetchStatus, setPrefetchStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  const setPostsForAccount = useCallback((accountId: string, posts: CachedPost[]) => {
    setPostsByAccountId((prev) => ({ ...prev, [accountId]: posts }));
  }, []);

  const setInsightsForAccount = useCallback((accountId: string, insights: CachedInsights) => {
    setInsightsByAccountId((prev) => ({ ...prev, [accountId]: insights }));
  }, []);

  const setNotifications = useCallback((n: NotificationsCache) => {
    setNotificationsState(n);
  }, []);

  const getPosts = useCallback((accountId: string) => {
    return postsByAccountId[accountId];
  }, [postsByAccountId]);

  const getInsights = useCallback((accountId: string) => {
    return insightsByAccountId[accountId];
  }, [insightsByAccountId]);

  const invalidate = useCallback(() => {
    setPostsByAccountId({});
    setInsightsByAccountId({});
    setPrefetchStatus('idle');
  }, []);

  useEffect(() => {
    if (!user) {
      setPrefetchStatus('idle');
      return;
    }
    let cancelled = false;
    setPrefetchStatus('loading');

    (async () => {
      try {
        const accountsRes = await api.get<{ id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[]>('/social/accounts').catch(() => ({ data: [] }));
        const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        if (cancelled) return;
        setCachedAccounts(accounts);

        const dateRange = getDefaultDateRange();

        await Promise.all([
          api.get<{ inbox?: number; comments?: number; messages?: number }>('/social/notifications').then((r) => {
            if (!cancelled) setNotificationsState({ inbox: r.data?.inbox ?? 0, comments: r.data?.comments ?? 0, messages: r.data?.messages ?? 0 });
          }).catch(() => {}),
          ...accounts.map((acc) =>
            api.get<{ posts?: CachedPost[] }>(`/social/accounts/${acc.id}/posts`).then((r) => {
              if (!cancelled && r.data?.posts) setPostsByAccountId((prev) => ({ ...prev, [acc.id]: r.data!.posts! }));
            }).catch(() => {})
          ),
          ...accounts.map((acc) =>
            api.get<CachedInsights>(`/social/accounts/${acc.id}/insights`, { params: { since: dateRange.start, until: dateRange.end } }).then((r) => {
              if (!cancelled && r.data) setInsightsByAccountId((prev) => ({ ...prev, [acc.id]: r.data as CachedInsights }));
            }).catch(() => {})
          ),
        ]);
        if (!cancelled) setPrefetchStatus('done');
      } catch {
        if (!cancelled) setPrefetchStatus('done');
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, setCachedAccounts]);

  const value: AppDataContextType = {
    notifications,
    postsByAccountId,
    insightsByAccountId,
    prefetchStatus,
    getPosts,
    getInsights,
    setPostsForAccount,
    setInsightsForAccount,
    setNotifications,
    invalidate,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
