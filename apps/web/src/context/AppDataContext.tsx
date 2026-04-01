'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';

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
  accountId: string;
  postPreview: string;
  postImageUrl?: string | null;
  postPublishedAt?: string | null;
  postUrl?: string | null;
  text: string;
  authorName: string;
  authorPictureUrl?: string | null;
  createdAt: string;
  platform: string;
  isFromMe?: boolean;
  parentCommentId?: string | null;
};

export type CachedConversation = {
  id: string;
  updatedTime: string | null;
  senders: Array<{ id?: string; username?: string; name?: string; pictureUrl?: string | null }>;
};

/** Post from GET /posts (scheduled/draft/history) */
export type CachedScheduledPost = Record<string, unknown>;
export type CachedEngagement = Record<string, unknown>;

type AppDataContextType = {
  notifications: NotificationsCache;
  postsByAccountId: Record<string, CachedPost[]>;
  insightsByAccountId: Record<string, CachedInsights>;
  commentsByAccountId: Record<string, CachedComment[]>;
  conversationsByAccountId: Record<string, CachedConversation[]>;
  scheduledPosts: CachedScheduledPost[];
  engagementByAccountId: Record<string, CachedEngagement[]>;
  prefetchStatus: 'idle' | 'loading' | 'done';
  prefetchHasLoadedOnce: boolean;
  getPosts: (accountId: string) => CachedPost[] | undefined;
  getInsights: (accountId: string) => CachedInsights | undefined;
  getComments: (accountId: string) => CachedComment[] | undefined;
  getConversations: (accountId: string) => CachedConversation[] | undefined;
  getScheduledPosts: () => CachedScheduledPost[];
  getEngagement: (accountId: string) => CachedEngagement[] | undefined;
  setPostsForAccount: (accountId: string, posts: CachedPost[]) => void;
  setInsightsForAccount: (accountId: string, insights: CachedInsights) => void;
  clearAccountData: (accountId: string) => void;
  setCommentsForAccount: (accountId: string, comments: CachedComment[]) => void;
  setConversationsForAccount: (accountId: string, conversations: CachedConversation[]) => void;
  setScheduledPosts: (posts: CachedScheduledPost[]) => void;
  setEngagementForAccount: (accountId: string, engagement: CachedEngagement[]) => void;
  setNotifications: (n: NotificationsCache) => void;
  invalidate: () => void;
  invalidateConversations: () => void;
};

const defaultNotifications: NotificationsCache = { inbox: 0, comments: 0, messages: 0 };

const CACHE_KEY = 'appData_cache_v2';
const CACHE_MAX_BYTES = 450000; // ~450KB to stay under sessionStorage quota

function getInitialConversationsFromStorage(): Record<string, CachedConversation[]> {
  const data = readCachedBlob();
  return data?.conversationsByAccountId && typeof data.conversationsByAccountId === 'object'
    ? data.conversationsByAccountId
    : {};
}

function getInitialCommentsFromStorage(): Record<string, CachedComment[]> {
  const data = readCachedBlob();
  return data?.commentsByAccountId && typeof data.commentsByAccountId === 'object'
    ? data.commentsByAccountId
    : {};
}


function readCachedBlob(): {
  conversationsByAccountId?: Record<string, CachedConversation[]>;
  postsByAccountId?: Record<string, CachedPost[]>;
  insightsByAccountId?: Record<string, CachedInsights>;
  commentsByAccountId?: Record<string, CachedComment[]>;
  engagementByAccountId?: Record<string, CachedEngagement[]>;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as {
      conversationsByAccountId?: Record<string, CachedConversation[]>;
      postsByAccountId?: Record<string, CachedPost[]>;
      insightsByAccountId?: Record<string, CachedInsights>;
      commentsByAccountId?: Record<string, CachedComment[]>;
  engagementByAccountId?: Record<string, CachedEngagement[]>;
    };
    return data;
  } catch {
    return null;
  }
}

function getInitialPostsFromStorage(): Record<string, CachedPost[]> {
  const data = readCachedBlob();
  return data?.postsByAccountId && typeof data.postsByAccountId === 'object' ? data.postsByAccountId : {};
}

function getInitialInsightsFromStorage(): Record<string, CachedInsights> {
  const data = readCachedBlob();
  return data?.insightsByAccountId && typeof data.insightsByAccountId === 'object' ? data.insightsByAccountId : {};
}

function getInitialEngagementFromStorage(): Record<string, CachedEngagement[]> {
  const data = readCachedBlob();
  return data?.engagementByAccountId && typeof data.engagementByAccountId === 'object' ? data.engagementByAccountId : {};
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

/** Shared default date range (last 30 local days) used by prefetch and analytics. */
export function getDefaultDateRange() {
  return getDefaultAnalyticsDateRange();
}

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { setCachedAccounts } = useAccountsCache() ?? { setCachedAccounts: () => {} };
  const [notifications, setNotificationsState] = useState<NotificationsCache>(defaultNotifications);
  const [postsByAccountId, setPostsByAccountId] = useState<Record<string, CachedPost[]>>(getInitialPostsFromStorage);
  const [insightsByAccountId, setInsightsByAccountId] = useState<Record<string, CachedInsights>>(getInitialInsightsFromStorage);
  const [commentsByAccountId, setCommentsByAccountId] = useState<Record<string, CachedComment[]>>(getInitialCommentsFromStorage);
  const [conversationsByAccountId, setConversationsByAccountId] = useState<Record<string, CachedConversation[]>>(getInitialConversationsFromStorage);
  const [scheduledPosts, setScheduledPostsState] = useState<CachedScheduledPost[]>([]);
  const [engagementByAccountId, setEngagementByAccountId] = useState<Record<string, CachedEngagement[]>>(getInitialEngagementFromStorage);
  const [prefetchStatus, setPrefetchStatus] = useState<'idle' | 'loading' | 'done'>('idle');
  const [prefetchHasLoadedOnce, setPrefetchHasLoadedOnce] = useState(false);

  const setPostsForAccount = useCallback((accountId: string, posts: CachedPost[]) => {
    setPostsByAccountId((prev) => ({ ...prev, [accountId]: posts }));
  }, []);

  const setInsightsForAccount = useCallback((accountId: string, insights: CachedInsights) => {
    setInsightsByAccountId((prev) => ({ ...prev, [accountId]: insights }));
  }, []);

  const clearAccountData = useCallback((accountId: string) => {
    setPostsByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setInsightsByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setCommentsByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setConversationsByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    setEngagementByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
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

  const setEngagementForAccount = useCallback((accountId: string, engagement: CachedEngagement[]) => {
    setEngagementByAccountId((prev) => ({ ...prev, [accountId]: engagement }));
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

  const getEngagement = useCallback((accountId: string) => {
    return engagementByAccountId[accountId];
  }, [engagementByAccountId]);

  const invalidate = useCallback(() => {
    setPostsByAccountId({});
    setInsightsByAccountId({});
    setCommentsByAccountId({});
    setConversationsByAccountId({});
    setScheduledPostsState([]);
    setEngagementByAccountId({});
    setPrefetchStatus('idle');
    setPrefetchHasLoadedOnce(false);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  }, []);

  const invalidateConversations = useCallback(() => {
    setConversationsByAccountId({});
  }, []);

  // Rehydrate cache from sessionStorage on mount so data survives full reloads
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    try {
      const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as {
        conversationsByAccountId?: Record<string, CachedConversation[]>;
        postsByAccountId?: Record<string, CachedPost[]>;
        insightsByAccountId?: Record<string, CachedInsights>;
        commentsByAccountId?: Record<string, CachedComment[]>;
  engagementByAccountId?: Record<string, CachedEngagement[]>;
      };
      if (data.conversationsByAccountId && Object.keys(data.conversationsByAccountId).length > 0) {
        setConversationsByAccountId(data.conversationsByAccountId);
      }
      if (data.postsByAccountId && Object.keys(data.postsByAccountId).length > 0) {
        setPostsByAccountId(data.postsByAccountId);
      }
      if (data.insightsByAccountId && Object.keys(data.insightsByAccountId).length > 0) {
        setInsightsByAccountId(data.insightsByAccountId);
      }
      if (data.commentsByAccountId && Object.keys(data.commentsByAccountId).length > 0) {
        setCommentsByAccountId(data.commentsByAccountId);
      }
      if (data.engagementByAccountId && Object.keys(data.engagementByAccountId).length > 0) {
        setEngagementByAccountId(data.engagementByAccountId);
      }
    } catch {
      // ignore parse errors or quota
    }
  }, [user?.id]);

  // Persist cache to sessionStorage when it changes so reloads show cached data immediately
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return;
    const hasData =
      Object.keys(conversationsByAccountId).length > 0 ||
      Object.keys(postsByAccountId).length > 0 ||
      Object.keys(insightsByAccountId).length > 0 ||
      Object.keys(commentsByAccountId).length > 0 ||
      Object.keys(engagementByAccountId).length > 0;
    if (!hasData) return;
    try {
      const payload = {
        conversationsByAccountId,
        postsByAccountId,
        insightsByAccountId,
        commentsByAccountId,
        engagementByAccountId,
      };
      const str = JSON.stringify(payload);
      if (str.length > CACHE_MAX_BYTES) return;
      sessionStorage.setItem(CACHE_KEY, str);
      localStorage.setItem(CACHE_KEY, str);
    } catch {
      // ignore quota or other errors
    }
  }, [user?.id, conversationsByAccountId, postsByAccountId, insightsByAccountId, commentsByAccountId, engagementByAccountId]);

  useEffect(() => {
    if (!user) {
      setPrefetchStatus('idle');
      setPrefetchHasLoadedOnce(false);
      if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
      return;
    }
    let cancelled = false;
    setPrefetchStatus('loading');

    (async () => {
      try {
        const accountsRes = await api.get<{ id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[]>('/social/accounts');
        const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        if (cancelled) return;
        setCachedAccounts(accounts);

        const dateRange = getDefaultDateRange();

        // Phase 1: minimal data needed to show the shell (notifications, scheduled posts)
        await Promise.all([
          api.get<{ inbox?: number; comments?: number; messages?: number; byPlatform?: Record<string, { comments: number; messages: number }> }>('/social/notifications').then((r) => {
            if (!cancelled) setNotificationsState({
              inbox: 0,
              comments: r.data?.comments ?? 0,
              messages: r.data?.messages ?? 0,
              byPlatform: r.data?.byPlatform ?? {},
            });
          }).catch(() => {}),
          api.get<CachedScheduledPost[]>('/posts').then((r) => {
            if (!cancelled && Array.isArray(r.data)) setScheduledPostsState(r.data);
          }).catch(() => {}),
        ]);
        if (cancelled) return;
        setPrefetchStatus('done');
        setPrefetchHasLoadedOnce(true);
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('appDataPhase1Done', '1');

        // Phase 2: load per-account data in background (shell already visible)
        await Promise.all([
          ...accounts.map((acc) =>
            api.get<{ posts?: CachedPost[] }>(`/social/accounts/${acc.id}/posts`).then((r) => {
              if (!cancelled && r.data?.posts) setPostsByAccountId((prev) => ({ ...prev, [acc.id]: r.data!.posts! }));
            }).catch(() => {})
          ),
          ...accounts.map((acc) =>
            api.get<CachedInsights>(`/social/accounts/${acc.id}/insights`, { params: { since: dateRange.start, until: dateRange.end, extended: 1 } }).then((r) => {
              if (!cancelled && r.data) setInsightsByAccountId((prev) => ({ ...prev, [acc.id]: r.data as CachedInsights }));
            }).catch(() => {})
          ),
          ...accounts.filter((acc) => acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK' || acc.platform === 'TWITTER').map((acc) =>
            api.get<{ comments?: CachedComment[] }>(`/social/accounts/${acc.id}/comments`).then((r) => {
              if (!cancelled && r.data) setCommentsByAccountId((prev) => ({ ...prev, [acc.id]: r.data.comments ?? [] }));
            }).catch(() => {})
          ),
          ...accounts.filter((acc) => acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK').map((acc) =>
            api.get<{ conversations?: CachedConversation[]; error?: string }>(`/social/accounts/${acc.id}/conversations`).then((r) => {
              if (cancelled || r.data?.error) return;
              const list = r.data?.conversations ?? [];
              setConversationsByAccountId((prev) => ({ ...prev, [acc.id]: list }));
            }).catch(() => {})
          ),
          ...accounts.filter((acc) => acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK' || acc.platform === 'YOUTUBE').map((acc) =>
            api.get<{ engagement?: CachedEngagement[] }>(`/social/accounts/${acc.id}/engagement`).then((r) => {
              if (!cancelled) setEngagementByAccountId((prev) => ({ ...prev, [acc.id]: r.data?.engagement ?? [] }));
            }).catch(() => {})
          ),
        ]);
      } catch {
        if (!cancelled) setPrefetchStatus('done');
        if (!cancelled) setPrefetchHasLoadedOnce(true);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, setCachedAccounts]);

  const value: AppDataContextType = useMemo(
    () => ({
      notifications,
      postsByAccountId,
      insightsByAccountId,
      commentsByAccountId,
      conversationsByAccountId,
      scheduledPosts,
      engagementByAccountId,
      prefetchStatus,
      prefetchHasLoadedOnce,
      getPosts,
      getInsights,
      getComments,
      getConversations,
      getScheduledPosts,
      getEngagement,
      setPostsForAccount,
      setInsightsForAccount,
      clearAccountData,
      setCommentsForAccount,
      setConversationsForAccount,
      setScheduledPosts,
      setEngagementForAccount,
      setNotifications,
      invalidate,
      invalidateConversations,
    }),
    [
      notifications,
      postsByAccountId,
      insightsByAccountId,
      commentsByAccountId,
      conversationsByAccountId,
      scheduledPosts,
      engagementByAccountId,
      prefetchStatus,
      prefetchHasLoadedOnce,
      getPosts,
      getInsights,
      getComments,
      getConversations,
      getScheduledPosts,
      getEngagement,
      setPostsForAccount,
      setInsightsForAccount,
      clearAccountData,
      setCommentsForAccount,
      setConversationsForAccount,
      setScheduledPosts,
      setEngagementForAccount,
      setNotifications,
      invalidate,
      invalidateConversations,
    ]
  );

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  return useContext(AppDataContext);
}
