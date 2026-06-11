'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import api from '@/lib/api';
import { getDefaultAnalyticsDateRange } from '@/lib/calendar-date';
import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';
import {
  computeInboxHeaderUnread,
  ensurePendingIdsForUnreadCounts,
  extractInboxBadgeUserIdFromStorage,
  mergeInboxBadgeWithSnapshot,
  clearInboxBadgeSnapshot,
  writeInboxBadgeSnapshot,
  getStickyNavInboxBadge,
} from '@/lib/inbox/unread-count';
import { INBOX_READ_STATE_CHANGED_EVENT } from '@/lib/inbox-read-state';
import { INBOX_SYSTEM_SYNC_MS } from '@/lib/inbox/inbox-sync-config';
import { mergeStableKeyedList } from '@/lib/inbox/merge-inbox-lists';
import {
  mergeConversationLists,
  pollInboxNotifications,
} from '@/lib/inbox/poll-inbox-notifications';
import {
  mergeAndWriteScheduledPostsClientCache,
  readScheduledPostsClientCache,
} from '@/lib/scheduled-posts-client-cache';
import type { PostHistoryRow } from '@/lib/posts-history-merge';
import {
  clearBrandContextCache,
  hasComposerBrandContext,
  parseBrandContextApiPayload,
  writeBrandContextCache,
  writeComposerBrandReadyCache,
} from '@/lib/brand-context-utils';

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
  platform?: string;
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
  /** Increments every ~2 min after background inbox sync (for Inbox UI to re-read cache). */
  inboxSystemSyncTick: number;
};

const defaultNotifications: NotificationsCache = { inbox: 0, comments: 0, messages: 0 };

function buildInitialNotificationsFromClientStorage(): NotificationsCache {
  if (typeof window === 'undefined') return defaultNotifications;
  const userId = extractInboxBadgeUserIdFromStorage();
  if (!userId) return defaultNotifications;

  const conversationsByAccountId = getInitialConversationsFromStorage();
  const commentsByAccountId = getInitialCommentsFromStorage();
  const allConversations: Array<{
    id: string;
    messageCount?: number;
    messageAccountId?: string;
    updatedTime?: string | null;
    platform?: string;
  }> = [];
  for (const [accountId, list] of Object.entries(conversationsByAccountId)) {
    for (const c of list) {
      allConversations.push({
        id: c.id,
        messageCount: c.messageCount,
        messageAccountId: accountId,
        updatedTime: c.updatedTime,
        platform: c.platform,
      });
    }
  }
  const accountPlatform = new Map<string, string>();
  for (const [accountId, list] of Object.entries(commentsByAccountId)) {
    const first = list[0];
    if (first?.platform) accountPlatform.set(accountId, first.platform);
  }
  const unreadComments = Object.entries(commentsByAccountId).flatMap(([accountId, list]) =>
    list
      .filter((c) => !c.parentCommentId)
      .map((c) => ({
        commentId: c.commentId,
        platform: c.platform ?? accountPlatform.get(accountId),
        accountId,
        isFromMe: c.isFromMe,
      }))
  );

  const hasInboxLists = allConversations.length > 0 || unreadComments.length > 0;
  ensurePendingIdsForUnreadCounts(allConversations, unreadComments, userId);
  let computed = computeInboxHeaderUnread(allConversations, unreadComments, userId);
  if (!hasInboxLists) {
    computed = mergeInboxBadgeWithSnapshot(computed, userId);
  }
  const stickyLoaded = hasInboxLists
    ? {
        conversationIds: new Set(allConversations.map((c) => c.id)),
        topLevelCommentIds: new Set(unreadComments.map((c) => c.commentId)),
      }
    : undefined;
  const unread = getStickyNavInboxBadge(userId, computed, stickyLoaded);
  return {
    inbox: unread.inbox,
    messages: unread.messages,
    comments: unread.comments,
    byPlatform: unread.byPlatform,
  };
}

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
  const [notifications, setNotificationsState] = useState<NotificationsCache>(
    buildInitialNotificationsFromClientStorage
  );
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
  const [inboxReadStateVersion, setInboxReadStateVersion] = useState(0);

  useEffect(() => {
    const onReadChanged = () => setInboxReadStateVersion((v) => v + 1);
    window.addEventListener(INBOX_READ_STATE_CHANGED_EVENT, onReadChanged);
    return () => window.removeEventListener(INBOX_READ_STATE_CHANGED_EVENT, onReadChanged);
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const accountPlatform = new Map<string, string>();
    const allConversations: Array<{
      id: string;
      messageCount?: number;
      messageAccountId?: string;
      updatedTime?: string | null;
      platform?: string;
    }> = [];
    for (const [accountId, list] of Object.entries(conversationsByAccountId)) {
      for (const c of list) {
        allConversations.push({
          id: c.id,
          messageCount: c.messageCount,
          messageAccountId: accountId,
          updatedTime: c.updatedTime,
          platform: c.platform,
        });
      }
    }
    for (const [accountId, list] of Object.entries(commentsByAccountId)) {
      const first = list[0];
      if (first?.platform) accountPlatform.set(accountId, first.platform);
    }
    const unreadComments = Object.entries(commentsByAccountId)
      .flatMap(([accountId, list]) =>
        list
          .filter((c) => !c.parentCommentId)
          .map((c) => ({
            commentId: c.commentId,
            platform: c.platform ?? accountPlatform.get(accountId),
            accountId,
            isFromMe: c.isFromMe,
          }))
      );
    // Do not reconcile or prune here — that cleared unread on refresh before the user
    // opened Inbox. Prune/reconcile run only on the Inbox page with a full list.
    ensurePendingIdsForUnreadCounts(allConversations, unreadComments, user.id);
    const hasInboxLists = allConversations.length > 0 || unreadComments.length > 0;
    let computed = computeInboxHeaderUnread(allConversations, unreadComments, user.id);
    if (!hasInboxLists) {
      computed = mergeInboxBadgeWithSnapshot(computed, user.id);
    }
    const stickyLoaded = hasInboxLists
      ? {
          conversationIds: new Set(allConversations.map((c) => c.id)),
          topLevelCommentIds: new Set(unreadComments.map((c) => c.commentId)),
        }
      : undefined;
    const unread = getStickyNavInboxBadge(user.id, computed, stickyLoaded);
    if (unread.inbox > 0) {
      writeInboxBadgeSnapshot(user.id, unread);
    } else {
      clearInboxBadgeSnapshot(user.id);
    }
    setNotificationsState((prev) => {
      const byPlatformSame =
        JSON.stringify(prev.byPlatform ?? {}) === JSON.stringify(unread.byPlatform);
      if (
        prev.inbox === unread.inbox &&
        prev.messages === unread.messages &&
        prev.comments === unread.comments &&
        byPlatformSame
      ) {
        return prev;
      }
      return {
        ...prev,
        inbox: unread.inbox,
        messages: unread.messages,
        comments: unread.comments,
        byPlatform: unread.byPlatform,
      };
    });
  }, [user?.id, conversationsByAccountId, commentsByAccountId, inboxReadStateVersion]);

  const conversationsByAccountIdRef = useRef(conversationsByAccountId);
  conversationsByAccountIdRef.current = conversationsByAccountId;
  const commentsByAccountIdRef = useRef(commentsByAccountId);
  commentsByAccountIdRef.current = commentsByAccountId;
  const inboxPollInFlightRef = useRef(false);
  const runInboxPollRef = useRef<(() => Promise<void>) | null>(null);
  const [inboxSystemSyncTick, setInboxSystemSyncTick] = useState(0);

  // Systematic inbox sync every 2 min while logged in (not tied to opening Inbox).
  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const runPoll = async () => {
      if (cancelled || inboxPollInFlightRef.current) return;

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
              const platform = accounts.find((a) => a.id === accountId)?.platform;
              setConversationsByAccountId((prev) => {
                const existing = prev[accountId] ?? [];
                if (list.length === 0 && existing.length > 0) return prev;
                return {
                  ...prev,
                  [accountId]: list.map((c) => ({ ...c, platform: c.platform ?? platform })),
                };
              });
            }
          },
          onComments: (accountId, list) => {
            if (!cancelled) {
              setCommentsByAccountId((prev) => {
                const existing = prev[accountId] ?? [];
                if (list.length === 0 && existing.length > 0) return prev;
                const merged = mergeStableKeyedList(
                  existing,
                  list,
                  (c) => c.commentId,
                  (old, row) => ({
                    ...old,
                    ...row,
                    authorPictureUrl: row.authorPictureUrl ?? old?.authorPictureUrl ?? null,
                    authorName: row.authorName?.trim() ? row.authorName : old?.authorName ?? row.authorName,
                  })
                );
                return { ...prev, [accountId]: merged };
              });
            }
          },
        });
        if (!cancelled) setInboxSystemSyncTick((t) => t + 1);
      } catch {
        /* ignore */
      } finally {
        inboxPollInFlightRef.current = false;
      }
    };

    runInboxPollRef.current = runPoll;

    void runPoll();
    intervalId = setInterval(() => {
      void runPoll();
    }, INBOX_SYSTEM_SYNC_MS);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [user?.id]);

  // First poll after startup prefetch (avoid racing cacheOnly with live poll).
  useEffect(() => {
    if (!user?.id || !prefetchPhase2Done) return;
    const t = setTimeout(() => {
      void runInboxPollRef.current?.();
    }, 2_000);
    return () => clearTimeout(t);
  }, [user?.id, prefetchPhase2Done]);

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
    setCommentsByAccountId((prev) => {
      const existing = prev[accountId] ?? [];
      if (comments.length === 0 && existing.length > 0) return prev;
      const merged = mergeStableKeyedList(
        existing,
        comments,
        (c) => c.commentId,
        (old, row) => ({
          ...old,
          ...row,
          authorPictureUrl: row.authorPictureUrl ?? old?.authorPictureUrl ?? null,
          authorName: row.authorName?.trim() ? row.authorName : old?.authorName ?? row.authorName,
        })
      );
      return { ...prev, [accountId]: merged };
    });
  }, []);

  const setConversationsForAccount = useCallback((accountId: string, conversations: CachedConversation[]) => {
    setConversationsByAccountId((prev) => {
      const existing = prev[accountId] ?? [];
      if (conversations.length === 0 && existing.length > 0) return prev;
      const merged =
        existing.length > 0 ? mergeConversationLists(existing, conversations) : conversations;
      return { ...prev, [accountId]: merged };
    });
  }, []);

  const setScheduledPosts = useCallback((posts: CachedScheduledPost[]) => {
    const merged = mergeAndWriteScheduledPostsClientCache(posts as PostHistoryRow[]);
    setScheduledPostsState(merged as CachedScheduledPost[]);
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
    setNotificationsState(defaultNotifications);
    const badgeUserId = extractInboxBadgeUserIdFromStorage();
    if (badgeUserId) clearInboxBadgeSnapshot(badgeUserId);
    setPrefetchStatus('idle');
    setPrefetchHasLoadedOnce(false);
    setPrefetchPhase2Done(false);
    setCacheRehydrated(false);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CACHE_KEY);
      if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CACHE_KEY);
    clearBrandContextCache();
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
            if (!cancelled && Array.isArray(r.data)) setScheduledPosts(r.data);
          }).catch(() => {}),
          api.get('/ai/brand-context', { timeout: 30_000 }).then((r) => {
            if (cancelled || !user?.id) return;
            const data = parseBrandContextApiPayload(r.data);
            writeBrandContextCache(data, user.id);
            writeComposerBrandReadyCache(hasComposerBrandContext(data));
          }).catch(() => {}),
        ]);
        if (cancelled) return;
        setPrefetchStatus('done');
        setPrefetchHasLoadedOnce(true);
        if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('appDataPhase1Done', '1');

        // Phase 2: load per-account data ONE REQUEST AT A TIME.
        // Each request = 1 serverless function = 1 DB connection.
        // The global API limiter (api.ts) caps concurrent requests to 4,
        // but Phase 2 should be gentle since dashboard effects also fire.
        const COMMENT_PLATFORMS = new Set([
          'INSTAGRAM',
          'FACEBOOK',
          'TWITTER',
          'YOUTUBE',
          'LINKEDIN',
          'THREADS',
          'TIKTOK',
          'PINTEREST',
        ]);
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
          if (COMMENT_PLATFORMS.has(acc.platform) && !isMetaAccount) {
            try {
              const r = await api.get<{ comments?: CachedComment[] }>(
                `/social/accounts/${acc.id}/comments?refresh=1`,
                { timeout: 90_000 }
              );
              if (!cancelled && shouldApplyPhase2Write() && r.data?.comments?.length) {
                setCommentsByAccountId((prev) => {
                  const existing = prev[acc.id] ?? [];
                  const merged = mergeStableKeyedList(
                    existing,
                    r.data!.comments!,
                    (c) => c.commentId,
                    (old, row) => ({ ...old, ...row })
                  );
                  return { ...prev, [acc.id]: merged };
                });
              }
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
                const incoming = r.data!.conversations!;
                setConversationsByAccountId((prev) => {
                  const existing = prev[acc.id] ?? [];
                  if (existing.length === 0) {
                    return { ...prev, [acc.id]: incoming };
                  }
                  const existingNewest = existing
                    .map((c) => c.updatedTime)
                    .filter((v): v is string => typeof v === 'string' && v.length > 0)
                    .sort((a, b) => b.localeCompare(a))[0];
                  const incomingNewest = incoming
                    .map((c) => c.updatedTime)
                    .filter((v): v is string => typeof v === 'string' && v.length > 0)
                    .sort((a, b) => b.localeCompare(a))[0];
                  if (
                    existingNewest &&
                    incomingNewest &&
                    incomingNewest.localeCompare(existingNewest) < 0
                  ) {
                    return prev;
                  }
                  return { ...prev, [acc.id]: mergeConversationLists(existing, incoming) };
                });
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
  }, [user?.id, setCachedAccounts, setScheduledPosts]);

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
      inboxSystemSyncTick,
    }),
    [
      notifications,
      postsByAccountId,
      insightsByAccountId,
      inboxSystemSyncTick,
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
