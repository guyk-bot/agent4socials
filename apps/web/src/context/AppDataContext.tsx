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

type NotificationsCache = {
  inbox: number;
  comments: number;
  messages: number;
  byPlatform?: Record<string, { comments: number; messages: number }>;
};

export type CachedComment = {
  commentId: string;
  postTargetId: string;
  platformPostId: string;
  postPreview: string;
  postImageUrl?: string | null;
  text: string;
  authorName: string;
  authorPictureUrl?: string | null;
  createdAt: string;
  platform: string;
};

export type CachedConversation = {
  id: string;
  updatedTime: string | null;
  senders: Array<{ username?: string; name?: string }>;
};

/** Post from GET /posts (scheduled/draft/history) */
export type CachedScheduledPost = Record<string, unknown>;

type AppDataContextType = {
  notifications: NotificationsCache;
  postsByAccountId: Record<string, CachedPost[]>;
  insightsByAccountId: Record<string, CachedInsights>;
  commentsByAccountId: Record<string, CachedComment[]>;
  conversationsByAccountId: Record<string, CachedConversation[]>;
  scheduledPosts: CachedScheduledPost[];
  prefetchStatus: 'idle' | 'loading' | 'done';
  getPosts: (accountId: string) => CachedPost[] | undefined;
  getInsights: (accountId: string) => CachedInsights | undefined;
  getComments: (accountId: string) => CachedComment[] | undefined;
  getConversations: (accountId: string) => CachedConversation[] | undefined;
  getScheduledPosts: () => CachedScheduledPost[];
  setPostsForAccount: (accountId: string, posts: CachedPost[]) => void;
  setInsightsForAccount: (accountId: string, insights: CachedInsights) => void;
  setCommentsForAccount: (accountId: string, comments: CachedComment[]) => void;
  setConversationsForAccount: (accountId: string, conversations: CachedConversation[]) => void;
  setScheduledPosts: (posts: CachedScheduledPost[]) => void;
  setNotifications: (n: NotificationsCache) => void;
  invalidate: () => void;
};

const defaultNotifications: NotificationsCache = { inbox: 0, comments: 0, messages: 0 };

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

/** Shared default date range (2 years) used by prefetch and analytics. */
export function getDefaultDateRange() {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setCachedAccounts } = useAccountsCache() ?? { setCachedAccounts: () => {} };
  const [notifications, setNotificationsState] = useState<NotificationsCache>(defaultNotifications);
  const [postsByAccountId, setPostsByAccountId] = useState<Record<string, CachedPost[]>>({});
  const [insightsByAccountId, setInsightsByAccountId] = useState<Record<string, CachedInsights>>({});
  const [commentsByAccountId, setCommentsByAccountId] = useState<Record<string, CachedComment[]>>({});
  const [conversationsByAccountId, setConversationsByAccountId] = useState<Record<string, CachedConversation[]>>({});
  const [scheduledPosts, setScheduledPostsState] = useState<CachedScheduledPost[]>([]);
  const [prefetchStatus, setPrefetchStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  const setPostsForAccount = useCallback((accountId: string, posts: CachedPost[]) => {
    setPostsByAccountId((prev) => ({ ...prev, [accountId]: posts }));
  }, []);

  const setInsightsForAccount = useCallback((accountId: string, insights: CachedInsights) => {
    setInsightsByAccountId((prev) => ({ ...prev, [accountId]: insights }));
  }, []);

  const setCommentsForAccount = useCallback((accountId: string, comments: CachedComment[]) => {
    setCommentsByAccountId((prev) => ({ ...prev, [accountId]: comments }));
  }, []);

  const setConversationsForAccount = useCallback((accountId: string, conversations: CachedConversation[]) => {
    setConversationsByAccountId((prev) => ({ ...prev, [accountId]: conversations }));
  }, []);

  const setScheduledPosts = useCallback((posts: CachedScheduledPost[]) => {
    setScheduledPostsState(posts);
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

  const getComments = useCallback((accountId: string) => {
    return commentsByAccountId[accountId];
  }, [commentsByAccountId]);

  const getConversations = useCallback((accountId: string) => {
    return conversationsByAccountId[accountId];
  }, [conversationsByAccountId]);

  const getScheduledPosts = useCallback(() => {
    return scheduledPosts;
  }, [scheduledPosts]);

  const invalidate = useCallback(() => {
    setPostsByAccountId({});
    setInsightsByAccountId({});
    setCommentsByAccountId({});
    setConversationsByAccountId({});
    setScheduledPostsState([]);
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
          api.get<{ inbox?: number; comments?: number; messages?: number; byPlatform?: Record<string, { comments: number; messages: number }> }>('/social/notifications').then((r) => {
            if (!cancelled) setNotificationsState({
              inbox: r.data?.inbox ?? 0,
              comments: r.data?.comments ?? 0,
              messages: r.data?.messages ?? 0,
              byPlatform: r.data?.byPlatform ?? {},
            });
          }).catch(() => {}),
          api.get<CachedScheduledPost[]>('/posts').then((r) => {
            if (!cancelled && Array.isArray(r.data)) setScheduledPostsState(r.data);
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
          ...accounts.filter((acc) => acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK' || acc.platform === 'TWITTER').map((acc) =>
            api.get<{ comments?: CachedComment[] }>(`/social/accounts/${acc.id}/comments`).then((r) => {
              if (!cancelled && r.data) setCommentsByAccountId((prev) => ({ ...prev, [acc.id]: r.data.comments ?? [] }));
            }).catch(() => {})
          ),
          ...accounts.filter((acc) => acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK').map((acc) =>
            api.get<{ conversations?: CachedConversation[] }>(`/social/accounts/${acc.id}/conversations`).then((r) => {
              const list = r.data?.conversations ?? [];
              if (!cancelled) setConversationsByAccountId((prev) => ({ ...prev, [acc.id]: list }));
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
    commentsByAccountId,
    conversationsByAccountId,
    scheduledPosts,
    prefetchStatus,
    getPosts,
    getInsights,
    getComments,
    getConversations,
    getScheduledPosts,
    setPostsForAccount,
    setInsightsForAccount,
    setCommentsForAccount,
    setConversationsForAccount,
    setScheduledPosts,
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
