'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';
import { computeInboxHeaderUnread } from '@/lib/inbox/unread-count';
import { triggerInboxWarmClient } from '@/lib/inbox/trigger-inbox-warm-client';
import {
  INBOX_NOTIFICATION_POLL_MS,
  pollInboxNotifications,
} from '@/lib/inbox/poll-inbox-notifications';
import {
  readScheduledPostsClientCache,
  writeScheduledPostsClientCache,
} from '@/lib/scheduled-posts-client-cache';

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
  messageCount?: number;
  senders: Array<{ id?: string; username?: string; name?: string; pictureUrl?: string | null }>;
};

/** Post from GET /posts (scheduled/draft/history) */
export type CachedScheduledPost = Record<string, unknown>;
export type CachedEngagement = Record<string, unknown>;

type AppDataContextType = {
  notifications: NotificationsCache;
  postsByAccountId: Record<string, CachedPost[]>;
  /** In-memory + persisted cache; same object as internal state (for effect deps). */
  insightsByAccountId: Record<string, CachedInsights>;
  commentsByAccountId: Record<string, CachedComment[]>;
  conversationsByAccountId: Record<string, CachedConversation[]>;
  scheduledPosts: CachedScheduledPost[];
  engagementByAccountId: Record<string, CachedEngagement[]>;
  prefetchStatus: 'idle' | 'loading' | 'done';
  prefetchHasLoadedOnce: boolean;
  /** True once Phase 2 (per-account posts/insights/comments/conversations) has finished or been skipped. */
  prefetchPhase2Done: boolean;
  /** True once localStorage/sessionStorage cache has been read on mount (even if empty). */
  cacheRehydrated: boolean;
  getPosts: (accountId: string) => CachedPost[] | undefined;
  getInsights: (accountId: string) => CachedInsights | undefined;
  getComments: (accountId: string) => CachedComment[] | undefined;
  getConversations: (accountId: string) => CachedConversation[] | undefined;
  getScheduledPosts: () => CachedScheduledPost[];
  getEngagement: (accountId: string) => CachedEngagement[] | undefined;
  setPostsForAccount: (accountId: string, posts: CachedPost[]) => void;
  setInsightsForAccount: (accountId: string, insights: CachedInsights) => void;
  /** Remove cached insights for one account without clearing posts/comments (dashboard TikTok refresh after video.list). */
  clearInsightsForAccount: (accountId: string) => void;
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
const CACHE_MAX_BYTES = 4_000_000; // 4MB – localStorage supports 5-10MB; the old 450KB limit silently dropped all writes for users with many accounts

/** Strip huge / debug fields so the dashboard cache actually fits in localStorage (else nothing saves). */
function slimInsightsRecordForStorage(insights: CachedInsights): CachedInsights {
  const o = { ...(insights as Record<string, unknown>) };
  for (const k of ['raw', 'facebookInsightsSync', 'facebookInsightPersistence', 'facebookDataSourceDebug'] as const) {
    delete o[k];
  }
  return stripLegacyInsightsHint(o as CachedInsights) as CachedInsights;
}

const PREFETCH_INSIGHTS_TIMEOUT_MS = 70_000;

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
  const raw =
    data?.insightsByAccountId && typeof data.insightsByAccountId === 'object' ? data.insightsByAccountId : {};
  const out: Record<string, CachedInsights> = {};
  for (const [aid, row] of Object.entries(raw)) {
    const cleaned = stripLegacyInsightsHint(row);
    if (cleaned) out[aid] = cleaned;
  }
  return out;
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
  const [prefetchPhase2Done, setPrefetchPhase2Done] = useState(false);
  const [cacheRehydrated, setCacheRehydrated] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    const allConversations: Array<{
      id: string;
      messageCount?: number;
      messageAccountId?: string;
      updatedTime?: string | null;
    }> = [];
    for (const [accountId, list] of Object.entries(conversationsByAccountId)) {
      for (const c of list) {
        allConversations.push({
          id: c.id,
          messageCount: c.messageCount,
          messageAccountId: accountId,
          updatedTime: c.updatedTime,
        });
      }
    }
    const commentIds = Object.values(commentsByAccountId)
      .flat()
      .filter((c) => !c.parentCommentId)
      .map((c) => c.commentId);
    const unread = computeInboxHeaderUnread(allConversations, commentIds, user.id);
    setNotificationsState((prev) => ({
      ...prev,
      inbox: unread.inbox,
      messages: unread.messages,
      comments: unread.comments,
    }));
  }, [user?.id, conversationsByAccountId, commentsByAccountId]);

  const conversationsByAccountIdRef = useRef(conversationsByAccountId);
  conversationsByAccountIdRef.current = conversationsByAccountId;
  const commentsByAccountIdRef = useRef(commentsByAccountId);
  commentsByAccountIdRef.current = commentsByAccountId;
  const inboxPollInFlightRef = useRef(false);

  // Background poll: refresh DMs + comments for nav badge (~90s, any dashboard page).
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runPoll = async () => {
      if (cancelled || inboxPollInFlightRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

      inboxPollInFlightRef.current = true;
      try {
        const accountsRes = await api.get<{ id: string; platform: string }[]>('/social/accounts');
        const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        if (cancelled || accounts.length === 0) return;

        await pollInboxNotifications({
          accounts,
          userId: user.id,
          getConversations: (id) => conversationsByAccountIdRef.current[id],
          getComments: (id) => commentsByAccountIdRef.current[id],
          onConversations: (accountId, list) => {
            if (!cancelled) {
              setConversationsByAccountId((prev) => ({ ...prev, [accountId]: list }));
            }
          },
          onComments: (accountId, list) => {
            if (!cancelled) {
              setCommentsByAccountId((prev) => ({ ...prev, [accountId]: list }));
            }
          },
        });
      } catch {
        /* ignore */
      } finally {
        inboxPollInFlightRef.current = false;
      }
    };

    const initialDelay = setTimeout(() => {
      void runPoll();
    }, 3_000);

    intervalId = setInterval(() => {
      void runPoll();
    }, INBOX_NOTIFICATION_POLL_MS);

    // Run again once startup cache has conversation rows (cacheOnly prefetch).
    const afterPrefetch = setTimeout(() => {
      void runPoll();
    }, 12_000);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void runPoll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      clearTimeout(afterPrefetch);
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id]);

  const setPostsForAccount = useCallback((accountId: string, posts: CachedPost[]) => {
    setPostsByAccountId((prev) => ({ ...prev, [accountId]: posts }));
  }, []);

  const setInsightsForAccount = useCallback((accountId: string, insights: CachedInsights) => {
    setInsightsByAccountId((prev) => ({
      ...prev,
      [accountId]: stripLegacyInsightsHint(insights) as CachedInsights,
    }));
  }, []);

  const clearInsightsForAccount = useCallback((accountId: string) => {
    setInsightsByAccountId((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
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
    writeScheduledPostsClientCache(posts);
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
    setPrefetchPhase2Done(false);
    setCacheRehydrated(false);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
  }, []);

  const invalidateConversations = useCallback(() => {
    setConversationsByAccountId({});
  }, []);

  // Rehydrate cache from sessionStorage on mount so data survives full reloads
  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) {
      setCacheRehydrated(true);
      return;
    }
    try {
      const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY);
      if (!raw) {
        setCacheRehydrated(true);
        return;
      }
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
        const cleaned: Record<string, CachedInsights> = {};
        for (const [aid, row] of Object.entries(data.insightsByAccountId)) {
          const c = stripLegacyInsightsHint(row);
          if (c) cleaned[aid] = c;
        }
        setInsightsByAccountId(cleaned);
      }
      if (data.commentsByAccountId && Object.keys(data.commentsByAccountId).length > 0) {
        setCommentsByAccountId(data.commentsByAccountId);
      }
      if (data.engagementByAccountId && Object.keys(data.engagementByAccountId).length > 0) {
        setEngagementByAccountId(data.engagementByAccountId);
      }
      const scheduledFromLocal = readScheduledPostsClientCache();
      if (scheduledFromLocal.length > 0) {
        setScheduledPostsState(scheduledFromLocal as CachedScheduledPost[]);
      }
      setCacheRehydrated(true);
    } catch {
      // ignore parse errors or quota
      setCacheRehydrated(true);
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
      const slimInsights: Record<string, CachedInsights> = {};
      for (const [aid, row] of Object.entries(insightsByAccountId)) {
        slimInsights[aid] = slimInsightsRecordForStorage(row);
      }
      const payload = {
        conversationsByAccountId,
        postsByAccountId,
        insightsByAccountId: slimInsights,
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

  // Clear cache when user logs out (user goes from truthy to null)
  const prevUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentUserId = user?.id ?? null;
    const prevUserId = prevUserIdRef.current;
    
    // User logged out: had a user, now don't
    if (prevUserId && !currentUserId) {
      invalidate();
    }
    
    prevUserIdRef.current = currentUserId;
  }, [user?.id, invalidate]);

  useEffect(() => {
    if (!user) {
      setPrefetchStatus('idle');
      setPrefetchHasLoadedOnce(false);
      // Don't clear cache here - it might just be auth loading
      // Cache will be cleared by invalidate() on actual logout
      return;
    }
    let cancelled = false;
    setPrefetchStatus('loading');
    setPrefetchPhase2Done(false);

    const shouldApplyPhase2Write = () =>
      typeof document === 'undefined' || document.visibilityState === 'visible';

    (async () => {
      try {
        const accountsRes = await api.get<{ id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[]>('/social/accounts');
        const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        if (cancelled) return;
        setCachedAccounts(accounts);

        const dateRange = getDefaultDateRange();

        // Phase 1: minimal data needed to show the shell (notifications, scheduled posts)
        await Promise.all([
          api.get<{ inbox?: number; comments?: number; messages?: number; byPlatform?: Record<string, { comments: number; messages: number }> }>('/social/notifications').then(() => {
            // Badge counts come from computeInboxHeaderUnread (localStorage), not this API.
          }).catch(() => {}),
          api.get<CachedScheduledPost[]>('/posts').then((r) => {
            if (!cancelled && Array.isArray(r.data)) setScheduledPostsState(r.data);
          }).catch(() => {}),
        ]);
        if (cancelled) return;
        setPrefetchStatus('done');
        setPrefetchHasLoadedOnce(true);
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('appDataPhase1Done', '1');

        // Pre-warm Instagram/Facebook DM cache on login and after connect (not only on Inbox).
        if (accounts.some((a) => a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK')) {
          triggerInboxWarmClient(true);
        }

        // Phase 2: load per-account data ONE REQUEST AT A TIME.
        // Each request = 1 serverless function = 1 DB connection.
        // The global API limiter (api.ts) caps concurrent requests to 4,
        // but Phase 2 should be gentle since dashboard effects also fire.
        const COMMENT_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);
        const CONVO_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK']);
        const ENGAGEMENT_PLATFORMS = new Set(['INSTAGRAM', 'FACEBOOK', 'YOUTUBE']);
        // X/Twitter first so opening the Twitter tab after login hits warm cache sooner; posts + insights
        // in parallel per account so Phase 2 finishes roughly twice as fast as sequential fetches.
        const prefetchOrder = [...accounts].sort((a, b) => {
          const aw = a.platform === 'TWITTER' ? 0 : 1;
          const bw = b.platform === 'TWITTER' ? 0 : 1;
          return aw - bw;
        });
        for (const acc of prefetchOrder) {
          if (cancelled) break;
          const isMetaAccount = acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK';
          try {
            // Skip insights prefetch for Instagram/Facebook — the insights route makes 5-10 live
            // Graph API calls per account (profile, reach, engagement, views, …) and those burn
            // through the 200 calls/hour per-user limit quickly. The Analytics tab loads insights
            // on demand when the user actually opens it.
            const insightsFetch = isMetaAccount
              ? Promise.resolve({ data: undefined })
              : api
                  .get<CachedInsights>(`/social/accounts/${acc.id}/insights`, {
                    params: { since: dateRange.start, until: dateRange.end },
                    timeout: PREFETCH_INSIGHTS_TIMEOUT_MS,
                  })
                  .catch(() => ({ data: undefined }));

            const [postsRes, insightsRes] = await Promise.all([
              api.get<{ posts?: CachedPost[] }>(`/social/accounts/${acc.id}/posts`, { timeout: 60_000 }).catch(() => ({ data: undefined })),
              insightsFetch,
            ]);
            if (!cancelled && shouldApplyPhase2Write() && postsRes.data?.posts) {
              setPostsByAccountId((prev) => ({ ...prev, [acc.id]: postsRes.data!.posts! }));
            }
            if (!cancelled && shouldApplyPhase2Write() && insightsRes.data) {
              setInsightsByAccountId((prev) => ({
                ...prev,
                [acc.id]: stripLegacyInsightsHint(insightsRes.data as CachedInsights) as CachedInsights,
              }));
            }
          } catch {
            /* skip */
          }
          if (cancelled) break;
          // Skip Meta comments prefetch (40+ Graph calls per account); Inbox loads on demand.
          if (
            COMMENT_PLATFORMS.has(acc.platform) &&
            !isMetaAccount
          ) {
            try {
              const r = await api.get<{ comments?: CachedComment[] }>(`/social/accounts/${acc.id}/comments`);
              if (!cancelled && shouldApplyPhase2Write() && r.data) setCommentsByAccountId((prev) => ({ ...prev, [acc.id]: r.data.comments ?? [] }));
            } catch { /* skip */ }
          }
          if (cancelled) break;
            // For Instagram/Facebook: use cacheOnly=1 so we read the DB-cached conversation list
          // without making live Meta API calls. This populates badge counts in the nav.
          // When the user opens Inbox, the live fetch replaces this with fresh data.
          if (CONVO_PLATFORMS.has(acc.platform)) {
            try {
              const r = await api.get<{ conversations?: CachedConversation[]; error?: string }>(
                `/social/accounts/${acc.id}/conversations?cacheOnly=1`
              );
              if (!cancelled && shouldApplyPhase2Write() && !r.data?.error && r.data?.conversations?.length) {
                setConversationsByAccountId((prev) => ({ ...prev, [acc.id]: r.data!.conversations! }));
              }
            } catch { /* skip */ }
          }
          if (cancelled) break;
          // Skip engagement prefetch for Meta — engagement endpoint can trigger additional Graph calls.
          if (ENGAGEMENT_PLATFORMS.has(acc.platform) && !isMetaAccount) {
            try {
              const r = await api.get<{ engagement?: CachedEngagement[] }>(`/social/accounts/${acc.id}/engagement`);
              if (!cancelled && shouldApplyPhase2Write()) setEngagementByAccountId((prev) => ({ ...prev, [acc.id]: r.data?.engagement ?? [] }));
            } catch { /* skip */ }
          }
        }
        if (!cancelled) setPrefetchPhase2Done(true);
      } catch {
        if (!cancelled) setPrefetchStatus('done');
        if (!cancelled) setPrefetchHasLoadedOnce(true);
        if (!cancelled) setPrefetchPhase2Done(true);
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
      prefetchPhase2Done,
      cacheRehydrated,
      getPosts,
      getInsights,
      getComments,
      getConversations,
      getScheduledPosts,
      getEngagement,
      setPostsForAccount,
      setInsightsForAccount,
      clearInsightsForAccount,
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
      prefetchPhase2Done,
      cacheRehydrated,
      getPosts,
      getInsights,
      getComments,
      getConversations,
      getScheduledPosts,
      getEngagement,
      setPostsForAccount,
      setInsightsForAccount,
      clearInsightsForAccount,
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
