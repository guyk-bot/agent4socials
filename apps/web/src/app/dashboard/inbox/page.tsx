'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  MessageCircle,
  Plus,
  Search,
  Check,
  CheckSquare,
  Square,
  Send,
  Image as ImageIcon,
  Smile,
  Loader2,
  BarChart3,
  Sparkles,
  RefreshCw,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import {
  getReadCommentIds,
  getReadConversationIds,
  getReadEngagementIds,
  getConversationLastReadCounts,
  setConversationLastReadCount,
  markCommentsAsRead,
  markConversationsAsRead,
  markEngagementAsRead,
} from '@/lib/inbox-read-state';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import { useAppData } from '@/context/AppDataContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon } from '@/components/SocialPlatformIcons';

// Inbox-relevant platforms only (no GMB/LinkedIn in connect list). LinkedIn excluded from + dropdown per request.
const PLATFORMS = [
  { id: 'INSTAGRAM', label: 'Instagram', icon: InstagramIcon },
  { id: 'FACEBOOK', label: 'Facebook', icon: FacebookIcon },
  { id: 'TIKTOK', label: 'TikTok', icon: TikTokIcon },
  { id: 'YOUTUBE', label: 'YouTube', icon: YoutubeIcon },
  { id: 'TWITTER', label: 'Twitter/X', icon: XTwitterIcon, color: 'text-neutral-800' },
] as const;

type Account = { id: string; platform: string; username?: string | null };
type Conversation = {
  id: string;
  updatedTime: string | null;
  senders: Array<{ id?: string; name?: string; username?: string; pictureUrl?: string | null }>;
  messageCount?: number;
};
type ConversationMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
};
type PostComment = {
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
type EngagementItem = {
  platformPostId: string;
  postPreview: string;
  platform: string;
  likeCount: number;
  commentCount: number;
  mediaUrl?: string | null;
  permalink?: string | null;
};

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function freshPostImageUrl(comment: Pick<PostComment, 'accountId' | 'platformPostId' | 'platform'>): string {
  return `/api/post-image?accountId=${encodeURIComponent(comment.accountId)}&postId=${encodeURIComponent(comment.platformPostId)}`;
}

function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const platformFromUrl = searchParams.get('platform')?.toUpperCase();
  const setSelectedPlatformForConnect = useSelectedAccount()?.setSelectedPlatformForConnect ?? (() => {});
  const appData = useAppData();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [commentsFilter, setCommentsFilter] = useState<'all' | 'replied' | 'didnt_reply'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [inboxMode, setInboxMode] = useState<'messages' | 'comments' | 'engagement'>('messages');
  const [batchConversationLastMessage, setBatchConversationLastMessage] = useState<Record<string, string>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationsDebug, setConversationsDebug] = useState<{ rawMessage?: string; code?: number; responseData?: unknown; metaMessage?: string } | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [selectedComment, setSelectedComment] = useState<PostComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [replySendError, setReplySendError] = useState<string | null>(null);
  const [dmSendError, setDmSendError] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationRecipientId, setConversationRecipientId] = useState<string | null>(null);
  const [conversationMessagesLoading, setConversationMessagesLoading] = useState(false);
  const [conversationMessagesError, setConversationMessagesError] = useState<string | null>(null);
  const [conversationMessagesCache, setConversationMessagesCache] = useState<Record<string, { messages: ConversationMessage[]; recipientId: string | null; recipientName?: string | null; recipientPictureUrl?: string | null; error: string | null }>>({});
  const [dmReplyText, setDmReplyText] = useState('');
  const [dmReplySending, setDmReplySending] = useState(false);
  const [dmRecipientUsername, setDmRecipientUsername] = useState('');
  const [dmRecipientLookupLoading, setDmRecipientLookupLoading] = useState(false);
  const [dmRecipientLookupError, setDmRecipientLookupError] = useState<string | null>(null);
  // Per-conversation batch replies
  const [batchDmTexts, setBatchDmTexts] = useState<Record<string, string>>({});
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ comments: number; messages: number; byPlatform?: Record<string, { comments: number; messages: number }> }>({ comments: 0, messages: 0 });
  const connectRef = useRef<HTMLDivElement>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [engagement, setEngagement] = useState<EngagementItem[]>([]);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<EngagementItem | null>(null);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const [conversationsRefreshKey, setConversationsRefreshKey] = useState(0);
  const [deleteCommentLoading, setDeleteCommentLoading] = useState(false);
  const [unreadCommentIds, setUnreadCommentIds] = useState<Set<string>>(new Set());
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0); // sum of unread message counts when messageCount is available
  const [unreadEngagementIds, setUnreadEngagementIds] = useState<Set<string>>(new Set());
  const previousTopLevelCommentIdsRef = useRef<Set<string>>(new Set());
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  const previousEngagementIdsRef = useRef<Set<string>>(new Set());

  // Multi-select state for conversations
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  // Multi-select state for comments (when Comments tab is active)
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());

  // AI inbox examples from AI Assistant (for gating AI draft feature)
  const [inboxReplyExamples, setInboxReplyExamples] = useState<string | null>(null);
  const [inboxExamplesLoaded, setInboxExamplesLoaded] = useState(false);
  const [xDmDebugResult, setXDmDebugResult] = useState<unknown>(null);
  const [xDmDebugLoading, setXDmDebugLoading] = useState(false);

  const hasInboxExamples = !!(inboxReplyExamples?.trim());

  const toggleSelectMode = useCallback(() => {
    setSelectMode((v) => {
      if (v) {
        if (inboxMode === 'messages') setSelectedConversationIds(new Set());
        else if (inboxMode === 'comments') setSelectedCommentIds(new Set());
      }
      return !v;
    });
  }, [inboxMode]);

  const markSelectedCommentsAsRead = useCallback(() => {
    markCommentsAsRead(selectedCommentIds, user?.id);
    setUnreadCommentIds((prev) => {
      const next = new Set(prev);
      selectedCommentIds.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedCommentIds(new Set());
    setSelectMode(false);
  }, [selectedCommentIds, user?.id]);

  const markSelectedAsRead = useCallback(() => {
    markConversationsAsRead(selectedConversationIds, user?.id);
    setUnreadConversationIds((prev) => {
      const next = new Set(prev);
      selectedConversationIds.forEach((id) => next.delete(id));
      return next;
    });
    setSelectedConversationIds(new Set());
    setSelectMode(false);
  }, [selectedConversationIds, user?.id]);

  const markAllAsRead = useCallback(() => {
    const allConvIds = conversations.map((c) => c.id);
    markConversationsAsRead(allConvIds, user?.id);
    setUnreadConversationIds(new Set());
    setSelectedConversationIds(new Set());
    setSelectMode(false);
  }, [conversations, user?.id]);

  useEffect(() => {
    if ((cachedAccounts as Account[]).length > 0) return;
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setAccounts(data);
      const platforms = data.map((a: Account) => a.platform).filter(Boolean);
      setSelectedPlatform(platforms[0] ?? null);
      setSelectedPlatforms(platforms.length ? platforms : []);
    }).catch(() => setAccounts([]));
  }, [cachedAccounts.length]);

  // Load inbox/comment reply examples from AI Assistant to gate AI draft features
  const [commentReplyExamples, setCommentReplyExamples] = useState<string | null>(null);
  const hasCommentExamples = !!(commentReplyExamples?.trim());

  useEffect(() => {
    if (inboxExamplesLoaded) return;
    api.get('/ai/brand-context').then((res) => {
      const d = res.data;
      if (d && typeof d === 'object') {
        setInboxReplyExamples((d as { inboxReplyExamples?: string | null }).inboxReplyExamples ?? null);
        setCommentReplyExamples((d as { commentReplyExamples?: string | null }).commentReplyExamples ?? null);
      }
    }).catch(() => {}).finally(() => setInboxExamplesLoaded(true));
  }, [inboxExamplesLoaded]);

  useEffect(() => {
    if (platformFromUrl && PLATFORMS.some((p) => p.id === platformFromUrl)) {
      const id = platformFromUrl;
      setSelectedPlatform(id);
      setSelectedPlatforms((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [platformFromUrl]);

  const effectiveAccounts = (cachedAccounts as Account[]).length > 0 ? (cachedAccounts as Account[]) : accounts;
  const connectedPlatformIds = effectiveAccounts.map((a) => a.platform).filter(Boolean);
  useEffect(() => {
    if (connectedPlatformIds.length === 0) return;
    const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('agent4socials_inbox_platforms') : null;
    const parsed: string[] = stored ? (() => { try { const a = JSON.parse(stored); return Array.isArray(a) ? a : []; } catch { return []; } })() : [];
    const valid = parsed.filter((p) => connectedPlatformIds.includes(p));
    if (valid.length > 0) {
      setSelectedPlatforms(valid);
      if (!selectedPlatform || !valid.includes(selectedPlatform)) setSelectedPlatform(valid[0] ?? null);
      return;
    }
    if (selectedPlatforms.length === 0) {
      setSelectedPlatforms(connectedPlatformIds);
      setSelectedPlatform(connectedPlatformIds[0] ?? null);
    }
  }, [connectedPlatformIds.join(',')]);

  useEffect(() => {
    if (selectedPlatforms.length > 0 && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('agent4socials_inbox_platforms', JSON.stringify(selectedPlatforms));
    }
  }, [selectedPlatforms.join(',')]);

  const connectedPlatforms = PLATFORMS.filter((p) => effectiveAccounts.some((a) => a.platform === p.id));
  const unconnectedPlatforms = PLATFORMS.filter((p) => !effectiveAccounts.some((a) => a.platform === p.id));
  const platformsForMessages = connectedPlatforms.filter((p) => p.id === 'INSTAGRAM' || p.id === 'FACEBOOK');
  const platformsToShow = inboxMode === 'messages' ? platformsForMessages : connectedPlatforms;
  const byPlatform = appData?.notifications?.byPlatform ?? notifications.byPlatform ?? {};
  const effectiveNotifications = selectedPlatforms.length > 0
    ? {
        comments: selectedPlatforms.reduce((s, p) => s + (byPlatform[p]?.comments ?? 0), 0),
        messages: selectedPlatforms.reduce((s, p) => s + (byPlatform[p]?.messages ?? 0), 0),
      }
    : appData?.notifications
      ? { comments: appData.notifications.comments, messages: appData.notifications.messages }
      : { comments: notifications.comments, messages: notifications.messages };

  const currentAccountForMessages = selectedPlatform ? effectiveAccounts.find((a) => a.platform === selectedPlatform) : null;
  useEffect(() => {
    if (!selectedConversationId || !currentAccountForMessages || (selectedPlatform !== 'INSTAGRAM' && selectedPlatform !== 'FACEBOOK')) {
      setConversationMessages([]);
      setConversationRecipientId(null);
      setConversationMessagesError(null);
      setConversationMessagesLoading(false);
      setDmRecipientLookupError(null);
      setDmRecipientUsername('');
      return;
    }
    const convId = selectedConversationId;
    const cached = conversationMessagesCache[convId];
    if (cached) {
      setConversationMessages(cached.messages);
      setConversationRecipientId(cached.recipientId);
      setConversationMessagesError(cached.error);
      setConversationMessagesLoading(false);
      return;
    }
    setConversationMessagesLoading(true);
    setConversationMessagesError(null);
    const convForRecipient = conversations.find((c) => c.id === convId);
    const recipientFromConv = convForRecipient?.senders?.[0]?.id ?? null;
    api.get(`/social/accounts/${currentAccountForMessages.id}/conversations/${convId}/messages`)
      .then((res) => {
        const messages = res.data?.messages ?? [];
        const recipientId = res.data?.recipientId ?? recipientFromConv ?? null;
        const error = res.data?.error ?? null;
        const recipientName = res.data?.recipientName ?? null;
        const recipientPictureUrl = res.data?.recipientPictureUrl ?? null;
        setConversationMessagesCache((prev) => ({ ...prev, [convId]: { messages, recipientId, recipientName, recipientPictureUrl, error } }));
        if (selectedConversationId === convId) {
          setConversationMessages(messages);
          setConversationLastReadCount(convId, messages.length, user?.id);
          setConversationRecipientId(recipientId);
          setConversationMessagesError(error);
        }
      })
      .catch((e: { response?: { data?: { error?: string } }; message?: string }) => {
        const apiError = e?.response?.data?.error ?? e?.message ?? 'Could not load messages.';
        const fallback = { messages: [] as ConversationMessage[], recipientId: recipientFromConv ?? null, recipientName: null, recipientPictureUrl: null, error: apiError as string | null };
        setConversationMessagesCache((prev) => ({ ...prev, [convId]: fallback }));
        if (selectedConversationId === convId) {
          setConversationMessages([]);
          setConversationRecipientId(recipientFromConv ?? null);
          setConversationMessagesError(apiError);
        }
      })
      .finally(() => {
        if (selectedConversationId === convId) setConversationMessagesLoading(false);
      });
  }, [selectedConversationId, currentAccountForMessages?.id, selectedPlatform, user?.id]);

  useEffect(() => {
    setAiReplyError(null);
  }, [selectedComment?.commentId, selectedConversationId]);

  // Fetch last message per selected conversation for batch reply cards (show "message user sent" instead of "How do you want to reply?")
  useEffect(() => {
    if (!currentAccountForMessages || selectedConversationIds.size === 0) {
      setBatchConversationLastMessage({});
      return;
    }
    const accountId = currentAccountForMessages.id;
    const ids = Array.from(selectedConversationIds);
    const next: Record<string, string> = {};
    let cancelled = false;
    Promise.all(
      ids.map(async (convId) => {
        if (cancelled) return;
        try {
          const res = await api.get<{ messages?: Array<{ message?: string; isFromPage?: boolean }> }>(
            `/social/accounts/${accountId}/conversations/${convId}/messages`
          );
          const messages = res.data?.messages ?? [];
          const lastFromOther = [...messages].reverse().find((m) => !m.isFromPage && m.message);
          return { convId, text: lastFromOther?.message?.trim() ?? '' };
        } catch {
          return { convId, text: '' };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      results.forEach((r) => {
        if (r) next[r.convId] = r.text;
      });
      setBatchConversationLastMessage(next);
    });
    return () => {
      cancelled = true;
    };
  }, [currentAccountForMessages?.id, Array.from(selectedConversationIds).sort().join(',')]);

  useEffect(() => {
    if (appData) return;
    api.get<{ comments?: number; messages?: number; byPlatform?: Record<string, { comments: number; messages: number }> }>('/social/notifications')
      .then((res) => setNotifications({
        comments: res.data?.comments ?? 0,
        messages: res.data?.messages ?? 0,
        byPlatform: res.data?.byPlatform ?? {},
      }))
      .catch(() => setNotifications({ comments: 0, messages: 0 }));
  }, [selectedPlatform, inboxMode, appData]);

  // Messages tab: only Instagram and Facebook (no X/Twitter DMs for now)
  const dmOrFbPlatforms = selectedPlatforms.filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK');
  useEffect(() => {
    if (dmOrFbPlatforms.length === 0) {
      setConversations([]);
      setConversationsLoading(false);
      setConversationsError(null);
      setConversationsDebug(null);
      return;
    }
    let cancelled = false;
    const merge: Array<Conversation & { platform: string }> = [];
    const errors: string[] = [];
    const debugs: Array<{ rawMessage?: string; code?: number; responseData?: unknown; metaMessage?: string }> = [];
    let pending = dmOrFbPlatforms.length;
    let needsFetch = false;

    dmOrFbPlatforms.forEach((platform) => {
      const account = effectiveAccounts.find((a) => a.platform === platform);
    if (!account) {
        if (--pending === 0 && !cancelled) {
          setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
          setConversationsError(errors[0] ?? null);
          setConversationsDebug(debugs[0] ?? null);
          setConversationsLoading(false);
        }
      return;
    }
      const fromCache = appData?.getConversations(account.id);
      const useCache = fromCache !== undefined && fromCache !== null;
      if (useCache) {
        merge.push(...fromCache.map((c) => ({ ...c, platform })));
        if (--pending === 0 && !cancelled) {
          setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
    setConversationsError(null);
          setConversationsDebug(null);
          setConversationsLoading(false);
        }
        return;
      }
      needsFetch = true;
    api.get(`/social/accounts/${account.id}/conversations?includeMessageCounts=1`)
      .then((res) => {
          if (cancelled) return;
          const list = (res.data?.conversations ?? []).map((c: Conversation) => ({ ...c, platform }));
          merge.push(...list);
          if (res.data?.error) errors.push(res.data.error);
          if (res.data?.debug) {
            debugs.push(res.data.debug as { rawMessage?: string; code?: number; responseData?: unknown; metaMessage?: string });
          }
          if (!res.data?.error) appData?.setConversationsForAccount(account.id, res.data?.conversations ?? []);
          if (--pending === 0) {
            setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
            setConversationsError(errors[0] ?? null);
            setConversationsDebug(debugs[0] ?? null);
          }
        })
        .catch((err: { message?: string; response?: { status?: number; data?: { error?: string } } }) => {
          if (cancelled) return;
          const status = err?.response?.status;
          // 404 usually means the account was disconnected; refresh account list so we don't keep using a stale id
          if (status === 404 && setCachedAccounts) {
            api.get('/social/accounts').then((res) => {
              const data = Array.isArray(res?.data) ? res.data : [];
              setCachedAccounts(data);
            }).catch(() => {});
          }
          const apiError = typeof err?.response?.data?.error === 'string' ? err.response.data.error : null;
          const msg = apiError ?? err?.message ?? 'Could not load conversations.';
          const isTimeout = status === 408 || /timeout|408/i.test(msg);
          const isRateLimit = status === 429;
          errors.push(isRateLimit ? msg : isTimeout ? 'Request timed out. Try again or reconnect and choose your Page.' : msg);
          type MetaErr = { message?: string; code?: number };
          const metaError: MetaErr | undefined = err?.response?.data && typeof err.response.data === 'object'
            ? (err.response.data as { error?: MetaErr }).error
            : undefined;
          debugs.push({
            rawMessage: msg,
            responseData: err?.response?.data,
            ...(metaError?.message ? { metaMessage: metaError.message, code: metaError.code } : {}),
          });
          if (--pending === 0) {
            setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
            setConversationsError(errors[0] ?? null);
            setConversationsDebug(debugs[0] ?? null);
          }
        })
        .finally(() => {
          if (pending === 0 && !cancelled) setConversationsLoading(false);
        });
    });

    if (needsFetch) {
      setConversationsLoading(true);
      setConversationsError(null);
      setConversationsDebug(null);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmOrFbPlatforms.join(','), effectiveAccounts.map((a) => a.id).join(','), conversationsRefreshKey]);

  // When in Messages mode, do not keep Twitter selected (Messages are IG + FB only)
  useEffect(() => {
    if (inboxMode === 'messages' && selectedPlatform === 'TWITTER') {
      const first = platformsForMessages[0];
      setSelectedPlatform(first?.id ?? null);
    }
  }, [inboxMode, selectedPlatform, platformsForMessages]);

  // Auto-open the first conversation when the list loads (messages mode) so all conversations are one click away
  useEffect(() => {
    if (inboxMode !== 'messages' || !conversations.length || selectedConversationId) return;
    const first = conversations[0];
    setSelectedConversationId(first.id);
    const platform = (first as Conversation & { platform?: string }).platform;
    if (platform) setSelectedPlatform(platform);
  }, [inboxMode, conversations, selectedConversationId]);

  const commentsSupportedPlatforms = selectedPlatforms.filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK' || p === 'TWITTER' || p === 'YOUTUBE' || p === 'TIKTOK');
  // When only TikTok is selected, TikTok's API doesn't return comment text — so also fetch other platforms so the list doesn't go empty
  const platformsToFetchComments =
    commentsSupportedPlatforms.length === 1 && commentsSupportedPlatforms[0] === 'TIKTOK'
      ? (effectiveAccounts
          .map((a) => a.platform)
          .filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK' || p === 'TWITTER' || p === 'YOUTUBE' || p === 'TIKTOK') as string[])
      : commentsSupportedPlatforms;
  const tiktokOnlyFallback = platformsToFetchComments.length > 1 && commentsSupportedPlatforms.length === 1 && commentsSupportedPlatforms[0] === 'TIKTOK';
  useEffect(() => {
    if (platformsToFetchComments.length === 0) {
      setComments([]);
      setCommentsLoading(false);
      setCommentsError(null);
      return;
    }
    let cancelled = false;
    const merge: PostComment[] = [];
    let pending = platformsToFetchComments.length;
    let needsFetch = false;
    const errorsFound: string[] = [];

    platformsToFetchComments.forEach((platform) => {
      const account = effectiveAccounts.find((a) => a.platform === platform);
      if (!account) {
        if (--pending === 0 && !cancelled) {
          setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          setCommentsLoading(false);
          setCommentsError(tiktokOnlyFallback && merge.length > 0 ? null : errorsFound[0] ?? null);
        }
        return;
      }
      // Only use cache when not doing a forced refresh (commentsRefreshKey > 0 clears and re-fetches)
      const fromCache = commentsRefreshKey === 0 ? appData?.getComments(account.id) : undefined;
      if (fromCache !== undefined && fromCache !== null) {
        const withAccountId = fromCache.map((c) => ({ ...c, accountId: (c as PostComment).accountId ?? account.id }));
        merge.push(...withAccountId);
        if (--pending === 0 && !cancelled) {
          setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          setCommentsError(tiktokOnlyFallback ? null : null);
          setCommentsLoading(false);
        }
        return;
      }
      needsFetch = true;
      api.get(`/social/accounts/${account.id}/comments`)
        .then((res) => {
          if (cancelled) return;
          const list: PostComment[] = res.data?.comments ?? [];
          const apiError: string | null = res.data?.error ?? null;
          merge.push(...list);
          // Only cache if there was no error — a cached empty list would hide errors on next load
          if (!apiError) appData?.setCommentsForAccount(account.id, list);
          if (apiError) errorsFound.push(apiError);
          if (--pending === 0) {
            setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setCommentsError(
              tiktokOnlyFallback && merge.length > 0 ? null : (errorsFound.length > 0 ? errorsFound[0] : null)
            );
            setCommentsLoading(false);
          }
      })
      .catch((err: { response?: { status?: number } }) => {
          if (cancelled) return;
          errorsFound.push('Could not load comments.');
          if (err?.response?.status === 404 && setCachedAccounts) {
            api.get('/social/accounts').then((res) => {
              const data = Array.isArray(res?.data) ? res.data : [];
              setCachedAccounts(data);
            }).catch(() => {});
          }
          if (--pending === 0) {
            setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setCommentsError(
              tiktokOnlyFallback && merge.length > 0 ? null : (errorsFound[0] ?? 'Could not load comments.')
            );
            setCommentsLoading(false);
          }
        });
    });

    if (needsFetch) {
      setCommentsLoading(true);
      setCommentsError(null);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsToFetchComments.join(','), effectiveAccounts.map((a) => a.id).join(','), commentsRefreshKey, tiktokOnlyFallback]);

  // Track unread comment ids: top-level comments not in persisted read set; new loads add to unread only if not read
  useEffect(() => {
    const topLevel = comments.filter((c) => !c.parentCommentId);
    const topLevelIds = new Set(topLevel.map((c) => c.commentId));
    const readSet = getReadCommentIds(user?.id);
    const unreadIds = [...topLevelIds].filter((id) => !readSet.has(id));
    setUnreadCommentIds(new Set(unreadIds));
    previousTopLevelCommentIdsRef.current = topLevelIds;
  }, [comments, user?.id]);

  // Auto-refresh comments every 5 minutes when Comments tab is active
  useEffect(() => {
    if (inboxMode !== 'comments' || commentsSupportedPlatforms.length === 0) return;
    const interval = setInterval(() => setCommentsRefreshKey((k) => k + 1), 5 * 60_000);
    return () => clearInterval(interval);
  }, [inboxMode, commentsSupportedPlatforms.length]);

  // For engagement, always show all connected IG+FB accounts regardless of platform filter
  const allEngagementAccounts = effectiveAccounts.filter((a) => a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK' || a.platform === 'YOUTUBE');
  const engagementPlatforms = selectedPlatforms.filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK' || p === 'YOUTUBE');
  useEffect(() => {
    if (allEngagementAccounts.length === 0) {
      setEngagement([]);
      setEngagementLoading(false);
      setEngagementError(null);
      return;
    }
    let cancelled = false;
    const merge: EngagementItem[] = [];
    let pending = allEngagementAccounts.length;
    setEngagementLoading(true);
    setEngagementError(null);
    allEngagementAccounts.forEach((account) => {
      api.get<{ engagement?: EngagementItem[]; error?: string }>(`/social/accounts/${account.id}/engagement`)
        .then((res) => {
          if (cancelled) return;
          merge.push(...(res.data?.engagement ?? []));
          if (--pending === 0) {
            merge.sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
            setEngagement(merge);
            setEngagementLoading(false);
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (--pending === 0) {
            setEngagement(merge);
            setEngagementLoading(false);
            setEngagementError('Could not load engagement for some platforms.');
          }
        });
    });
    return () => { cancelled = true; };
  }, [allEngagementAccounts.map((a) => a.id).join(','), effectiveAccounts.length]);

  // Track unread conversation ids and total unread messages: use messageCount + lastRead when available
  useEffect(() => {
    const ids = new Set(conversations.map((c) => c.id));
    const readSet = getReadConversationIds(user?.id);
    const lastRead = getConversationLastReadCounts(user?.id);
    const hasAnyMessageCount = conversations.some((c) => typeof c.messageCount === 'number');
    if (hasAnyMessageCount) {
      let total = 0;
      const unreadIds = new Set<string>();
      for (const c of conversations) {
        const count = c.messageCount ?? 0;
        const read = lastRead[c.id] ?? 0;
        const unread = Math.max(0, count - read);
        if (unread > 0) {
          unreadIds.add(c.id);
          total += unread;
        }
      }
      setUnreadConversationIds(unreadIds);
      setTotalUnreadMessages(total);
    } else {
      const unreadIds = [...ids].filter((id) => !readSet.has(id));
      setUnreadConversationIds(new Set(unreadIds));
      setTotalUnreadMessages(unreadIds.length);
    }
    previousConversationIdsRef.current = ids;
  }, [conversations, user?.id]);

  // Track unread engagement ids: engagement items not in persisted read set
  useEffect(() => {
    const ids = new Set(engagement.map((e) => `${e.platform}-${e.platformPostId}`));
    const readSet = getReadEngagementIds(user?.id);
    const unreadIds = [...ids].filter((id) => !readSet.has(id));
    setUnreadEngagementIds(new Set(unreadIds));
    previousEngagementIdsRef.current = ids;
  }, [engagement, user?.id]);

  // Sync total unread to appData so header shows comments + messages (engagement removed)
  useEffect(() => {
    const messagesCount = totalUnreadMessages > 0 ? totalUnreadMessages : unreadConversationIds.size;
    const total = unreadCommentIds.size + messagesCount;
    appData?.setNotifications({
      ...(appData.notifications ?? { inbox: 0, comments: 0, messages: 0 }),
      inbox: Math.min(total, 99),
    });
  }, [unreadCommentIds.size, unreadConversationIds.size, totalUnreadMessages, appData]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) setConnectOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePlatformClick = (platformId: string) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId];
      if (selectedPlatform != null && !next.includes(selectedPlatform)) {
        setSelectedPlatform(next[0] ?? null);
    setSelectedConversationId(null);
        setSelectedComment(null);
      }
      return next;
    });
    setSelectedConversationId(null);
    setSelectedComment(null);
    setAiReplyError(null);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem-3rem)] md:h-[calc(100vh-3.5rem-4rem)] bg-white flex-col md:flex-row -mx-4 sm:-mx-6 md:-mx-8 -my-6 md:-my-8">
      {/* Left sidebar - Metricool style */}
      <div className="w-full md:w-80 border-r border-neutral-200 flex flex-col shrink-0 bg-white">
        {/* Platform icons + Connect */}
        <div className="p-3 border-b border-neutral-100">
          <div className="flex items-center gap-2 flex-wrap">
            {platformsToShow.map((p) => {
              const Icon = p.icon;
              const isSelected = selectedPlatforms.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePlatformClick(p.id)}
                  className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-colors ${
                    isSelected ? 'bg-neutral-100 border-neutral-300 ring-1 ring-neutral-200' : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                  title={`${p.label} inbox`}
                >
                  <Icon size={22} className={'color' in p ? p.color : undefined} />
                </button>
              );
            })}
            <div className="relative" ref={connectRef}>
              <button
                type="button"
                onClick={() => setConnectOpen((o) => !o)}
                className="w-10 h-10 rounded-lg flex items-center justify-center border-2 border-dashed border-neutral-300 bg-neutral-50 text-neutral-500 hover:bg-neutral-100 hover:border-neutral-400 transition-colors"
                title="Add another platform"
              >
                <Plus size={22} />
              </button>
              {connectOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 py-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-50">
                  <p className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Add platform</p>
                  <p className="px-3 py-1 text-xs text-neutral-500">Connect more accounts from the Dashboard. Inbox will show them here automatically.</p>
                  {unconnectedPlatforms.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-neutral-500">All inbox platforms connected.</p>
                  ) : (
                    unconnectedPlatforms.map((p) => {
                    const Icon = p.icon;
                    return (
                        <button
                        key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlatformForConnect(p.id);
                          setConnectOpen(false);
                            router.push('/dashboard');
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 text-left"
                        >
                          <Icon size={20} className={'color' in p && p.color ? `shrink-0 ${p.color}` : 'shrink-0'} />
                          <span className="flex-1">Connect {p.label} (opens Dashboard)</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-neutral-100">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder={inboxMode === 'comments' ? 'Search comments...' : 'Search conversation...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Messages / Comments */}
        <div className="flex border-b border-neutral-200">
          <button
            type="button"
            onClick={() => { setInboxMode('messages'); setSelectedComment(null); setSelectMode(false); setSelectedConversationIds(new Set()); setSelectedCommentIds(new Set()); }}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${inboxMode === 'messages' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Messages
            {(totalUnreadMessages > 0 || unreadConversationIds.size > 0) ? (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {totalUnreadMessages > 0 ? (totalUnreadMessages > 99 ? '99' : totalUnreadMessages) : (unreadConversationIds.size > 99 ? '99' : unreadConversationIds.size)}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            onClick={() => { setInboxMode('comments'); setSelectedConversationId(null); setSelectMode(false); setSelectedConversationIds(new Set()); setSelectedCommentIds(new Set()); }}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${inboxMode === 'comments' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Comments
            {unreadCommentIds.size > 0 ? (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {unreadCommentIds.size > 99 ? '99' : unreadCommentIds.size}
              </span>
            ) : null}
          </button>
        </div>

        {inboxMode === 'messages' && (
          <div className="flex flex-col border-b border-neutral-200">
            <div className="flex">
          <button
            type="button"
            onClick={() => setInboxFilter('all')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'all' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setInboxFilter('read')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'read' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Read
          </button>
          <button
            type="button"
            onClick={() => setInboxFilter('unread')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'unread' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Unread
          </button>
        </div>
            {/* Select toolbar: select conversations then mark as read */}
            <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50/70 border-t border-neutral-100">
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${selectMode ? 'bg-indigo-100 text-indigo-700' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
              >
                {selectMode ? <CheckSquare size={13} /> : <Square size={13} />}
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              {selectMode && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const filtered = conversations.filter((c) => {
                        if (inboxFilter === 'all') return true;
                        if (inboxFilter === 'read') return !unreadConversationIds.has(c.id);
                        if (inboxFilter === 'unread') return unreadConversationIds.has(c.id);
                        return true;
                      });
                      const allIds = new Set(filtered.map((c) => c.id));
                      setSelectedConversationIds((prev) => prev.size === allIds.size ? new Set() : allIds);
                    }}
                    className="text-xs text-neutral-600 hover:text-neutral-900 underline"
                  >
                    {(() => {
                      const filtered = conversations.filter((c) => {
                        if (inboxFilter === 'all') return true;
                        if (inboxFilter === 'read') return !unreadConversationIds.has(c.id);
                        if (inboxFilter === 'unread') return unreadConversationIds.has(c.id);
                        return true;
                      });
                      return selectedConversationIds.size === filtered.length ? 'Deselect all' : 'Select all';
                    })()}
                  </button>
                  {selectedConversationIds.size > 0 && (
                    <button
                      type="button"
                      onClick={markSelectedAsRead}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-neutral-800 text-white hover:bg-neutral-700"
                    >
                      <Check size={12} />
                      Mark {selectedConversationIds.size} as read
                    </button>
                  )}
                  {unreadConversationIds.size > 0 && selectedConversationIds.size === 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {inboxMode === 'comments' && commentsSupportedPlatforms.length > 0 && (
          <div className="flex flex-col border-b border-neutral-200">
            <div className="flex border-b border-neutral-100">
              <button
                type="button"
                onClick={() => setCommentsFilter('all')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'all' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCommentsFilter('replied')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'replied' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
              >
                Replied
              </button>
              <button
                type="button"
                onClick={() => setCommentsFilter('didnt_reply')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'didnt_reply' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
              >
                Didn&apos;t reply
              </button>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50/70 border-t border-neutral-100">
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${selectMode ? 'bg-indigo-100 text-indigo-700' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
              >
                {selectMode ? <CheckSquare size={13} /> : <Square size={13} />}
                {selectMode ? 'Cancel' : 'Select'}
              </button>
              {selectMode && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      const topLevel = comments.filter((c) => !c.parentCommentId);
                      const hasRepliedByParent = new Set(
                        comments.filter((r) => r.isFromMe && r.parentCommentId).map((r) => r.parentCommentId)
                      );
                      const filtered = topLevel.filter((c) =>
                        commentsFilter === 'all' ? true : commentsFilter === 'replied' ? hasRepliedByParent.has(c.commentId) : !hasRepliedByParent.has(c.commentId)
                      );
                      const allIds = new Set(filtered.map((c) => c.commentId));
                      setSelectedCommentIds((prev) => prev.size === allIds.size ? new Set() : allIds);
                    }}
                    className="text-xs text-neutral-600 hover:text-neutral-900 underline"
                  >
                    {(() => {
                      const topLevel = comments.filter((c) => !c.parentCommentId);
                      const hasRepliedByParent = new Set(
                        comments.filter((r) => r.isFromMe && r.parentCommentId).map((r) => r.parentCommentId)
                      );
                      const filtered = topLevel.filter((c) =>
                        commentsFilter === 'all' ? true : commentsFilter === 'replied' ? hasRepliedByParent.has(c.commentId) : !hasRepliedByParent.has(c.commentId)
                      );
                      return selectedCommentIds.size === filtered.length ? 'Deselect all' : 'Select all';
                    })()}
                  </button>
                  {selectedCommentIds.size > 0 && (
                    <button
                      type="button"
                      onClick={markSelectedCommentsAsRead}
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-neutral-800 text-white hover:bg-neutral-700"
                    >
                      <Check size={12} />
                      Mark {selectedCommentIds.size} as read
                    </button>
                  )}
                  {unreadCommentIds.size > 0 && selectedCommentIds.size === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        markCommentsAsRead(unreadCommentIds, user?.id);
                        setUnreadCommentIds(new Set());
                        setSelectedCommentIds(new Set());
                        setSelectMode(false);
                      }}
                      className="ml-auto text-xs text-indigo-600 hover:text-indigo-800 underline"
                    >
                      Mark all as read
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Conversation, comment, or engagement list */}
        <div className="flex-1 overflow-y-auto">
          {inboxMode === 'engagement' ? (
            engagementLoading ? (
              <div className="p-6 flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                <p className="text-sm text-neutral-500">Loading engagement…</p>
              </div>
            ) : engagementError ? (
              <div className="p-4">
                <p className="text-sm text-neutral-700">{engagementError}</p>
              </div>
            ) : engagement.length === 0 ? (
              <div className="p-6 text-center">
                <BarChart3 size={40} className="mx-auto text-neutral-300 mb-3" />
                <p className="text-sm font-medium text-neutral-900">No engagement data yet</p>
                <p className="text-sm text-neutral-500 mt-1">Publish posts to Instagram or Facebook, then sync to see likes and comments.</p>
                <button
                  type="button"
                  onClick={() => {
                    const igFbAccounts = effectiveAccounts.filter((a) => a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK');
                    if (igFbAccounts.length === 0) return;
                    setEngagementLoading(true);
                    setEngagementError(null);
                    let pending = igFbAccounts.length;
                    const merge: EngagementItem[] = [];
                    igFbAccounts.forEach((account) => {
                      api.get<{ engagement?: EngagementItem[]; error?: string }>(`/social/accounts/${account.id}/engagement`)
                        .then((res) => {
                          merge.push(...(res.data?.engagement ?? []));
                          if (--pending === 0) {
                            merge.sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
                            setEngagement(merge);
                            setEngagementLoading(false);
                          }
                        })
                        .catch(() => { if (--pending === 0) { setEngagement(merge); setEngagementLoading(false); } });
                    });
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <RefreshCw size={14} />
                  Refresh engagement
                </button>
              </div>
            ) : (
              <div className="p-2 space-y-0">
                {engagement
                  .filter((e) => !searchQuery || e.postPreview.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((e) => {
                    const engagementKey = `${e.platform}-${e.platformPostId}`;
                    const isUnread = unreadEngagementIds.has(engagementKey);
                    return (
                    <button
                      key={engagementKey}
                      type="button"
                      onClick={() => {
                        setSelectedEngagement(e);
                        markEngagementAsRead([engagementKey], user?.id);
                        setUnreadEngagementIds((prev) => {
                          const next = new Set(prev);
                          next.delete(engagementKey);
                          return next;
                        });
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                        selectedEngagement?.platformPostId === e.platformPostId ? 'bg-indigo-50 border border-indigo-100' : isUnread ? 'bg-sky-50/80 hover:bg-sky-100/80' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-neutral-100 shrink-0 overflow-hidden flex items-center justify-center">
                        {e.mediaUrl ? (
                          <img src={e.mediaUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <BarChart3 size={24} className="text-neutral-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{e.postPreview || 'Post'}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {e.likeCount} likes · {e.commentCount} comments
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                          {(() => {
                            const plat = PLATFORMS.find((p) => p.id === e.platform);
                            const Icon = plat?.icon;
                            return (
                              <>
                                {Icon && <Icon size={12} className="opacity-70 shrink-0" />}
                                <span>{plat?.label ?? e.platform}</span>
                              </>
                            );
                          })()}
                        </p>
                      </div>
                      {isUnread && <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" aria-hidden />}
                    </button>
                    );
                  })}
              </div>
            )
          ) : inboxMode === 'comments' && commentsSupportedPlatforms.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-neutral-500">Comments are available for Instagram, Facebook, X, and YouTube. Select one or more platforms above. TikTok comment text is only available via TikTok&apos;s Research API (for researchers), not the Display API this app uses. You can see TikTok comment counts in Analytics.</p>
            </div>
          ) : selectedPlatforms.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-500">Click one or more platform icons above to view their inboxes.</p>
            </div>
          ) : inboxMode === 'comments' ? (
            commentsLoading ? (
              <div className="p-6 flex flex-col items-center justify-center gap-3">
                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                <p className="text-sm text-neutral-500">Loading comments…</p>
              </div>
            ) : commentsError && !(commentsSupportedPlatforms.length === 1 && commentsSupportedPlatforms[0] === 'TIKTOK') ? (
              <div className="p-4 space-y-3">
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4">
                  <p className="text-sm font-medium text-amber-900">Could not load comments</p>
                  <p className="text-xs text-amber-700 mt-1">{commentsError}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCommentsRefreshKey((k) => k + 1)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    <RefreshCw size={14} />
                    Retry
                  </button>
                  {effectiveAccounts.some((a) => a.platform === 'TWITTER') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/TWITTER/start');
                          const url = res?.data?.url;
                          if (url) window.location.href = url;
                        } catch { /* ignore */ }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-800 text-white text-sm font-medium hover:opacity-90"
                    >
                      Reconnect X (Twitter)
                    </button>
                  )}
                  {effectiveAccounts.some((a) => a.platform === 'INSTAGRAM') && (commentsError.toLowerCase().includes('permission') || commentsError.toLowerCase().includes('reconnect') || commentsError.toLowerCase().includes('expired')) && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/INSTAGRAM/start?method=instagram');
                          const url = res?.data?.url;
                          if (url) window.location.href = url;
                        } catch { /* ignore */ }
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
                    >
                      Reconnect Instagram
                    </button>
                  )}
                </div>
              </div>
            ) : comments.length === 0 ? (
              commentsSupportedPlatforms.length === 1 && commentsSupportedPlatforms[0] === 'TIKTOK' ? (
                <div className="p-6 text-center">
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-4 mb-4">
                    <p className="text-sm font-medium text-sky-900">TikTok comment text isn&apos;t available</p>
                    <p className="text-xs text-sky-700 mt-1">TikTok&apos;s Display API doesn&apos;t include comment text. You can see comment counts in Analytics.</p>
                  </div>
                  <p className="text-sm text-neutral-600">Select Instagram, Facebook, X, or YouTube above to see comments from those platforms.</p>
                </div>
              ) : (
              <div className="p-6 text-center">
                <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
                <p className="text-sm text-neutral-500">No comments yet.</p>
                <p className="text-xs text-neutral-400 mt-1">Comments on your posts will appear here. Make sure to sync your posts first from the Dashboard.</p>
                <button
                  type="button"
                  onClick={() => setCommentsRefreshKey((k) => k + 1)}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <RefreshCw size={14} />
                  Refresh comments
                </button>
              </div>
              )
            ) : (
              <>
                {tiktokOnlyFallback && (
                  <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100 text-sm text-sky-800">
                    TikTok comment text isn&apos;t available in the API. Showing comments from your other platforms.
                  </div>
                )}
                <div className="divide-y divide-neutral-100">
                {(() => {
                  const topLevelOnly = comments.filter((c) => !c.parentCommentId);
                  const hasRepliedByParent = new Set(
                    comments.filter((r) => r.isFromMe && r.parentCommentId).map((r) => r.parentCommentId)
                  );
                  const filtered = topLevelOnly
                    .filter((c) =>
                      commentsFilter === 'all'
                        ? true
                        : commentsFilter === 'replied'
                          ? hasRepliedByParent.has(c.commentId)
                          : !hasRepliedByParent.has(c.commentId)
                    )
                    .filter((c) => !searchQuery || c.text.toLowerCase().includes(searchQuery.toLowerCase()) || c.authorName.toLowerCase().includes(searchQuery.toLowerCase()))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                  return filtered.map((c) => {
                    const isUnread = unreadCommentIds.has(c.commentId);
                    const hasReplied = hasRepliedByParent.has(c.commentId);
                    const isSelected = selectMode && selectedCommentIds.has(c.commentId);
                    return (
                          <button
                            key={c.commentId}
                            type="button"
                            onClick={() => {
                              if (selectMode) {
                                setSelectedCommentIds((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(c.commentId)) next.delete(c.commentId);
                                  else next.add(c.commentId);
                                  return next;
                                });
                                return;
                              }
                              markCommentsAsRead([c.commentId], user?.id);
                              setSelectedComment(c);
                              setUnreadCommentIds((prev) => {
                                const next = new Set(prev);
                                next.delete(c.commentId);
                                return next;
                              });
                            }}
                            className={`w-full px-3 py-3 text-left transition-colors flex items-center gap-2 ${
                              isSelected ? 'bg-indigo-50 border-l-2 border-l-indigo-500' :
                              selectedComment?.commentId === c.commentId ? 'bg-indigo-50 border-l-2 border-l-indigo-500' : isUnread ? 'bg-sky-50/80 hover:bg-sky-100/80' : 'hover:bg-neutral-50'
                            }`}
                          >
                            {selectMode ? (
                              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-300'}`}>
                                {isSelected && <Check size={12} className="text-white" />}
                              </div>
                            ) : null}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-neutral-400 flex items-center gap-1 mb-1">
                                {(() => {
                                  const plat = PLATFORMS.find((p) => p.id === c.platform);
                                  const Icon = plat?.icon;
                                  return Icon ? <Icon size={12} className="opacity-70" /> : null;
                                })()}
                                <span>{new Date(c.createdAt).toLocaleString()}</span>
                              </p>
                              <div className="flex items-start gap-3">
                                <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                                  {c.authorPictureUrl ? (
                                    <img src={c.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs font-semibold text-neutral-600">{(c.authorName || '?').slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-medium text-neutral-900 truncate">{c.authorName}</p>
                                  <p className="text-xs text-neutral-500 truncate mt-0.5">{(c.postPreview || '').slice(0, 20)}{(c.postPreview?.length ?? 0) > 20 ? '…' : ''}</p>
                                  <p className="text-xs text-neutral-600 line-clamp-2 mt-0.5">{c.text}</p>
                                </div>
                              </div>
                            </div>
                            {hasReplied && (
                              <span className="shrink-0 flex items-center gap-0.5 text-xs text-emerald-600 font-medium" title="You replied">
                                <Check size={12} />
                                Replied
                              </span>
                            )}
                            {isUnread && (
                              <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" aria-hidden />
                            )}
                          </button>
                    );
                  });
                })()}
              </div>
              </>
            )
          ) : conversationsLoading ? (
            <div className="p-6 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-neutral-500">Loading conversations…</p>
            </div>
          ) : conversationsError ? (
            <div className="p-4">
              <div className="rounded-xl border-2 border-red-200 bg-red-50 px-4 py-4">
                <p className="text-sm font-medium text-red-900">Could not load messages</p>
                <p className="text-xs text-red-700 mt-1">{conversationsError}</p>
                {conversationsError?.includes('401') && (
                  <p className="text-xs text-amber-800 mt-1 bg-amber-100/80 px-2 py-1 rounded">Your session or the platform token may have expired. Try reconnecting the selected platform below, or sign out and sign back in.</p>
                )}
                {conversationsDebug?.metaMessage && (
                  <p className="text-xs text-red-800 mt-1 font-mono bg-red-100/80 px-2 py-1 rounded mt-2">{conversationsDebug.metaMessage}</p>
                )}
                <div className="mt-3 flex flex-col gap-2">
                  {dmOrFbPlatforms.includes('INSTAGRAM') && effectiveAccounts.some((a) => a.platform === 'INSTAGRAM') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/INSTAGRAM/start?method=instagram');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
                    >
                      Reconnect Instagram
                    </button>
                  )}
                  {dmOrFbPlatforms.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/facebook/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                    >
                      Reconnect Facebook
                    </button>
                  )}
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-500">No conversations yet.</p>
              <p className="text-xs text-neutral-400 mt-1">Messages will appear here when you receive them.</p>
              <button
                type="button"
                onClick={() => {
                  appData?.invalidateConversations?.();
                  setConversationsRefreshKey((k) => k + 1);
                  setConversationsLoading(true);
                }}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              >
                <RefreshCw size={16} />
                Refresh conversations
              </button>
              {selectedPlatform === 'TIKTOK' && (
                <p className="text-xs text-amber-700 mt-3 max-w-sm mx-auto bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  TikTok inbox (DMs) are not available in the app. Use Instagram or Facebook to view and reply to messages here.
                </p>
              )}
              {dmOrFbPlatforms.includes('INSTAGRAM') && selectedPlatform !== 'TIKTOK' && (
                <p className="text-xs text-amber-700 mt-3 max-w-sm mx-auto bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  If you see Instagram DMs in Metricool but not here, Meta is only granting inbox access to apps with <strong>Advanced Access</strong>. Complete App Review for instagram_manage_messages to enable it in A4S.
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-0">
              {conversations
                .filter((c) => {
                  if (inboxFilter === 'all') return true;
                  if (inboxFilter === 'read') return !unreadConversationIds.has(c.id);
                  if (inboxFilter === 'unread') return unreadConversationIds.has(c.id);
                  return true;
                })
                .filter((c) => !searchQuery || (c.senders?.[0]?.username ?? c.senders?.[0]?.name ?? c.id).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((c) => {
                  const firstSender = c.senders?.[0];
                  const rawName = firstSender?.username ?? firstSender?.name;
                  const convPlatform = (c as Conversation & { platform?: string }).platform ?? (dmOrFbPlatforms.length === 1 ? dmOrFbPlatforms[0] : undefined);
                  const name = rawName && rawName.trim() ? rawName : (convPlatform === 'TWITTER' ? 'X (Twitter) user' : 'Unknown');
                  const pictureUrl = firstSender?.pictureUrl;
                  const initials = (name === 'X (Twitter) user' ? 'X' : name).slice(0, 2).toUpperCase();
                  const platform = convPlatform ?? (c as Conversation & { platform?: string }).platform;
                  return (
                    <button
                      key={platform ? `${platform}-${c.id}` : c.id}
                      type="button"
                      onClick={() => {
                        if (selectMode) {
                          setSelectedConversationIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                            return next;
                          });
                          return;
                        }
                        if (platform) setSelectedPlatform(platform);
                        setSelectedConversationId(c.id);
                        markConversationsAsRead([c.id], user?.id);
                        setUnreadConversationIds((prev) => {
                          const next = new Set(prev);
                          next.delete(c.id);
                          return next;
                        });
                        // Reduce Messages tab badge immediately (same as comments/engagement)
                        const lastRead = getConversationLastReadCounts(user?.id);
                        const count = (c as Conversation).messageCount;
                        if (typeof count === 'number') {
                          const readUpTo = lastRead[c.id] ?? 0;
                          const unreadForThis = Math.max(0, count - readUpTo);
                          setTotalUnreadMessages((prev) => Math.max(0, prev - unreadForThis));
                          setConversationLastReadCount(c.id, count, user?.id);
                        } else {
                          setTotalUnreadMessages((prev) => Math.max(0, prev - 1));
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                        selectMode && selectedConversationIds.has(c.id) ? 'bg-indigo-50 border border-indigo-200' :
                        selectedConversationId === c.id ? 'bg-indigo-50 border border-indigo-100' : unreadConversationIds.has(c.id) ? 'bg-sky-50/80 hover:bg-sky-100/80' : 'hover:bg-neutral-50'
                      }`}
                    >
                      {selectMode ? (
                        <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${selectedConversationIds.has(c.id) ? 'bg-indigo-600 border-indigo-600' : 'border-neutral-300'}`}>
                          {selectedConversationIds.has(c.id) && <Check size={12} className="text-white" />}
                      </div>
                      ) : (
                      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {pictureUrl ? (
                          <img src={pictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-sm font-semibold text-neutral-600">{initials}</span>
                        )}
                      </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{name}</p>
                        <p className="text-xs text-neutral-500 truncate flex items-center gap-1.5">
                          {platform ? (() => {
                            const plat = PLATFORMS.find((p) => p.id === platform);
                            const Icon = plat?.icon;
                            return (
                              <>
                                {Icon && <Icon size={12} className="shrink-0 opacity-70" />}
                                <span>{plat?.label ?? platform}</span>
                              </>
                            );
                          })() : 'Conversation'}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
                        {unreadConversationIds.has(c.id) && <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden />}
                        {c.updatedTime && <span className="text-xs text-neutral-400">{new Date(c.updatedTime).toLocaleDateString()}</span>}
                        <button type="button" className="p-1 rounded hover:bg-neutral-200" title="Mark resolved">
                          <Check size={14} className="text-neutral-400" />
                        </button>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Main content - conversation or comment reply */}
      <div className="flex-1 flex flex-col min-w-0 bg-neutral-50/50 min-h-0">
        {!selectedPlatform ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={64} className="mx-auto text-neutral-300 mb-4" />
              <h2 className="text-lg font-semibold text-neutral-800">Open an inbox</h2>
              <p className="text-sm text-neutral-500 mt-2">
                Click Instagram or Facebook to view direct messages, or any connected platform to view comments.
              </p>
            </div>
          </div>
        ) : inboxMode === 'comments' && selectMode && selectedCommentIds.size > 0 ? (
          /* Batch reply to selected comments: show each in a card + Generate with AI */
          (() => {
            const selectedComments = comments.filter((c) => !c.parentCommentId && selectedCommentIds.has(c.commentId));
            const canReplyPlatforms = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);
            const replyable = selectedComments.filter((c) => canReplyPlatforms.has(c.platform));
            return (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-4 border-b border-neutral-200 bg-white">
                  <h2 className="text-lg font-semibold text-neutral-900">Reply to {selectedComments.length} comment{selectedComments.length !== 1 ? 's' : ''}</h2>
                  {replyable.length < selectedComments.length && (
                    <p className="text-sm text-amber-700 mt-1">Only Instagram and Facebook comments can be replied to from the app. Others will be skipped.</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Selected comments</p>
                  <div className="space-y-3">
                    {selectedComments.map((c) => {
                      const plat = PLATFORMS.find((p) => p.id === c.platform);
                      const Icon = plat?.icon;
                      return (
                        <div key={c.commentId} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden flex items-center justify-center">
                              {c.authorPictureUrl ? (
                                <img src={c.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-semibold text-neutral-600">{(c.authorName || '?').slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-neutral-900">{c.authorName}</span>
                                {Icon && <Icon size={14} className="opacity-70" />}
                                <span className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-neutral-700 mt-1 line-clamp-2">{c.text}</p>
                              {c.postPreview && <p className="text-xs text-neutral-500 mt-1 truncate">Post: {c.postPreview.slice(0, 50)}…</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-4 border-t border-neutral-200">
                    <div className="flex flex-wrap gap-2 mb-3">
                      <button
                        type="button"
                        disabled={aiReplyLoading || !hasCommentExamples}
                        onClick={async () => {
                          setAiReplyError(null);
                          setAiReplyLoading(true);
                          try {
                            const first = replyable[0];
                            const res = await api.post<{ reply?: string }>('/ai/generate-inbox-reply', {
                              type: 'comment',
                              text: first?.text ?? 'Comment',
                              context: first?.postPreview ?? undefined,
                              platform: selectedPlatform ?? undefined,
                            });
                            const reply = res.data?.reply?.trim();
                            if (reply) setReplyText(reply);
                            else setAiReplyError('No reply generated. Try again.');
                          } catch (e: unknown) {
                            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                            setAiReplyError(msg ?? 'Could not generate reply.');
                          } finally {
                            setAiReplyLoading(false);
                          }
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 border border-indigo-200 text-sm font-medium"
                        title={hasCommentExamples ? 'Generate reply with AI' : 'Add examples in AI Assistant'}
                      >
                        {aiReplyLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                        Generate with AI
                      </button>
                    </div>
                    <textarea
                      placeholder="Type a reply to send to all selected (or generate with AI above)..."
                      rows={3}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                    />
                    {aiReplyError && <p className="text-sm text-amber-700 mt-2">{aiReplyError}</p>}
                    <button
                      type="button"
                      disabled={replySending || !replyText.trim() || replyable.length === 0}
                      onClick={async () => {
                        const msg = replyText.trim();
                        setReplySending(true);
                        setReplySendError(null);
                        const failed: string[] = [];
                        for (const c of replyable) {
                          const account = effectiveAccounts.find((a) => a.platform === c.platform);
                          if (!account) continue;
                          try {
                            await api.post(`/social/accounts/${account.id}/comments/reply`, { commentId: c.commentId, message: msg });
                            markCommentsAsRead([c.commentId], user?.id);
                            setUnreadCommentIds((prev) => { const next = new Set(prev); next.delete(c.commentId); return next; });
                          } catch {
                            failed.push(c.authorName || c.commentId);
                          }
                        }
                        setReplySending(false);
                        if (failed.length > 0) setReplySendError(`Failed for: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}`);
                        else {
                          setReplyText('');
                          setSelectedCommentIds(new Set());
                          setSelectMode(false);
                          setCommentsRefreshKey((k) => k + 1);
                        }
                      }}
                      className="mt-3 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      {replySending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                      Send to all ({replyable.length})
                    </button>
                    {replySendError && <p className="text-sm text-red-600 mt-2">{replySendError}</p>}
                  </div>
                </div>
              </div>
            );
          })()
        ) : inboxMode === 'messages' && selectMode && selectedConversationIds.size > 0 ? (
          /* Batch reply to selected conversations: each conversation gets its own reply area */
          currentAccountForMessages ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 border-b border-neutral-200 bg-white">
                <h2 className="text-lg font-semibold text-neutral-900">Reply to {selectedConversationIds.size} conversation{selectedConversationIds.size !== 1 ? 's' : ''}</h2>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!hasInboxExamples && inboxExamplesLoaded && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    AI reply drafts are disabled.{' '}
                    <a href="/dashboard/ai-assistant" className="font-medium underline">
                      Add inbox reply examples in AI Assistant
                    </a>{' '}
                    to enable them.
                  </div>
                )}
                <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Selected conversations</p>
                <div className="space-y-4">
                  {conversations
                    .filter((c) => selectedConversationIds.has(c.id))
                    .map((c) => {
                      const name = c.senders?.map((s) => s.name || s.username || 'Unknown').filter(Boolean).join(', ') || 'Conversation';
                      const pictureUrl = c.senders?.[0]?.pictureUrl;
                      const platform = (c as Conversation & { platform?: string }).platform ?? selectedPlatform;
                      const plat = PLATFORMS.find((p) => p.id === platform);
                      const Icon = plat?.icon;
                      const value = batchDmTexts[c.id] ?? '';
                      return (
                        <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden flex items-center justify-center">
                              {pictureUrl ? (
                                <img src={pictureUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-semibold text-neutral-600">{(name || '?').slice(0, 2).toUpperCase()}</span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-neutral-900 truncate">{name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {Icon && <Icon size={14} className="opacity-70" />}
                                <span className="text-xs text-neutral-500">
                                  {c.updatedTime ? new Date(c.updatedTime).toLocaleString() : 'Conversation'}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-neutral-100">
                            <p className="text-sm text-neutral-700 mb-2 rounded-lg bg-neutral-50 px-3 py-2 border border-neutral-100 min-h-[2.5rem]">
                              {batchConversationLastMessage[c.id] !== undefined
                                ? (batchConversationLastMessage[c.id] || 'No message preview')
                                : 'Loading…'}
                            </p>
                            <div className="flex flex-wrap gap-2 mb-2">
                              <button
                                type="button"
                                disabled={aiReplyLoading || !hasInboxExamples}
                                onClick={async () => {
                                  setAiReplyError(null);
                                  setAiReplyLoading(true);
                                  try {
                                    const res = await api.post<{ reply?: string }>('/ai/generate-inbox-reply', {
                                      type: 'message',
                                      text: 'Incoming message from customer',
                                      context: 'Direct message conversation',
                                      platform: selectedPlatform ?? undefined,
                                    });
                                    const reply = res.data?.reply?.trim();
                                    if (reply) {
                                      setBatchDmTexts((prev) => ({ ...prev, [c.id]: reply }));
                                    } else {
                                      setAiReplyError('No reply generated. Try again.');
                                    }
                                  } catch (e: unknown) {
                                    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                                    setAiReplyError(msg ?? 'Could not generate reply.');
                                  } finally {
                                    setAiReplyLoading(false);
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 border border-indigo-200 text-xs font-medium"
                                title={hasInboxExamples ? 'Generate reply with AI' : 'Add inbox reply examples in AI Assistant'}
                              >
                                {aiReplyLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                Generate with AI
                              </button>
                            </div>
                            <textarea
                              placeholder="Type a message for this conversation (or generate with AI above)..."
                              rows={3}
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBatchDmTexts((prev) => ({ ...prev, [c.id]: v }));
                              }}
                              className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                            />
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                disabled={dmReplySending || !value.trim()}
                                onClick={async () => {
                                  const text = value.trim();
                                  if (!text) return;
                                  setDmReplySending(true);
                                  setDmSendError(null);
                                  try {
                                    await api.post(`/social/accounts/${currentAccountForMessages.id}/conversations/${c.id}/messages`, { text });
                                    markConversationsAsRead([c.id], user?.id);
                                    setUnreadConversationIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(c.id);
                                      return next;
                                    });
                                    setBatchDmTexts((prev) => {
                                      const next = { ...prev };
                                      delete next[c.id];
                                      return next;
                                    });
                                    setSelectedConversationIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(c.id);
                                      return next;
                                    });
                                  } catch (e: unknown) {
                                    const errMsg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send reply to this conversation.';
                                    setDmSendError(errMsg);
                                  } finally {
                                    setDmReplySending(false);
                                  }
                                }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {dmReplySending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                Send
                              </button>
                              {unreadConversationIds.has(c.id) && (
                                <span className="text-[11px] text-neutral-500">Marked as unread until you send.</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
                {dmSendError && <p className="text-sm text-red-600">{dmSendError}</p>}
                {aiReplyError && <p className="text-sm text-amber-700">{aiReplyError}</p>}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center p-8">
              <p className="text-sm text-neutral-500">Select an account (Instagram, Facebook, or X) to send messages.</p>
            </div>
          )
        ) : inboxMode === 'comments' && selectedComment ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden">
                      {selectedComment.authorPictureUrl ? (
                        <img src={selectedComment.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-neutral-600">
                          {(selectedComment.authorName || '?').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                        {(() => {
                          const plat = PLATFORMS.find((p) => p.id === selectedComment.platform);
                          const Icon = plat?.icon;
                          return (
                            <>
                              {Icon && <Icon size={12} className="shrink-0 opacity-70" />}
                              <span>{new Date(selectedComment.createdAt).toLocaleString()}</span>
                            </>
                          );
                        })()}
                      </p>
                      <p className="text-sm font-medium text-neutral-800 mt-0.5">Comment on your post</p>
                      <p className="text-xs text-neutral-500 mt-0.5">{selectedComment.authorName}</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                          {selectedComment.postPublishedAt ? new Date(selectedComment.postPublishedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : 'Post'}
                        </p>
                        {selectedComment.postUrl && (
                          <a
                            href={selectedComment.postUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 hover:underline"
                          >
                            <ExternalLink size={10} />
                            Open in {PLATFORMS.find((p) => p.id === selectedComment.platform)?.label ?? selectedComment.platform.charAt(0) + selectedComment.platform.slice(1).toLowerCase()}
                          </a>
                        )}
                      </div>
                      <div className="flex gap-4 items-start">
                        <div className="rounded-lg overflow-hidden shrink-0 w-[min(200px,100%)] max-w-[200px]">
                          {(selectedComment.platform === 'INSTAGRAM' || selectedComment.platform === 'FACEBOOK' || selectedComment.platform === 'YOUTUBE' || selectedComment.platform === 'TWITTER') && selectedComment.accountId ? (
                            <img
                              src={freshPostImageUrl(selectedComment)}
                              alt="Post"
                              className="w-full h-auto object-contain max-h-[18rem]"
                              onError={(e) => {
                                const el = e.currentTarget;
                                if (selectedComment.postImageUrl && !el.src.includes('/api/proxy-image')) {
                                  el.src = proxyImageUrl(selectedComment.postImageUrl)!;
                                } else {
                                  el.style.display = 'none';
                                }
                              }}
                            />
                          ) : selectedComment.postImageUrl ? (
                            <img
                              src={proxyImageUrl(selectedComment.postImageUrl)!}
                              alt="Post"
                              className="w-full h-auto object-contain max-h-[18rem]"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-2 p-8 text-neutral-400 min-h-[200px] bg-neutral-50 rounded-lg">
                              <ImageIcon size={48} strokeWidth={1.5} />
                              <span className="text-sm text-center">No image</span>
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">Post description</p>
                          {selectedComment.postPreview ? (
                            <p className="text-sm text-neutral-800 whitespace-pre-wrap break-words">{selectedComment.postPreview}</p>
                          ) : (
                            <p className="text-sm text-neutral-500 italic">No description</p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Comment</p>
                      <p className="text-sm text-neutral-800 mt-1">{selectedComment.text}</p>
                    </div>
                    {(() => {
                      const replies = comments
                        .filter((r) => r.parentCommentId === selectedComment.commentId)
                        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                      if (replies.length === 0) return null;
                      return (
                        <div className="border-t border-neutral-100 pt-3 mt-3">
                          <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">Replies</p>
                          <div className="space-y-2">
                            {replies.map((r) => {
                              const avatarUrl = (r.authorName === 'You' || r.isFromMe) && !r.authorPictureUrl
                                ? (user?.avatarUrl ?? r.authorPictureUrl)
                                : r.authorPictureUrl;
                              return (
                              <div key={r.commentId} className="flex gap-2 rounded-lg bg-neutral-50 p-2">
                                <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                                  {avatarUrl ? (
                                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs font-semibold text-neutral-600">{(r.authorName || '?').slice(0, 2).toUpperCase()}</span>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-neutral-500">
                                    {r.authorName}
                                    <span className="ml-1">{new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                                  </p>
                                  <p className="text-sm text-neutral-800 mt-0.5">{r.text}</p>
                                </div>
                              </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-neutral-200 bg-white p-4 shrink-0 pb-6">
              <div className="max-w-2xl mx-auto">
                {aiReplyError && (
                  <p className="text-sm text-amber-700 mb-2">{aiReplyError}</p>
                )}
                {selectedComment.platform !== 'INSTAGRAM' && selectedComment.platform !== 'FACEBOOK' && selectedComment.platform !== 'YOUTUBE' && selectedComment.platform !== 'TWITTER' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-medium">Reply from the app is available for Instagram, Facebook, YouTube, and X (Twitter).</p>
                    <p className="mt-1 text-xs text-amber-700">For other platforms, reply on the platform.</p>
                  </div>
                ) : (
                <>
                <div className="flex items-end gap-2">
                  <textarea
                    placeholder="Type your reply..."
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                  />
                  <button
                    type="button"
                    disabled={aiReplyLoading || !hasCommentExamples}
                    onClick={async () => {
                      if (!selectedComment) return;
                      setAiReplyError(null);
                      setAiReplyLoading(true);
                      try {
                        const res = await api.post<{ reply?: string }>('/ai/generate-inbox-reply', {
                          type: 'comment',
                          text: selectedComment.text,
                          context: selectedComment.postPreview ?? undefined,
                          platform: selectedPlatform ?? undefined,
                        });
                        const reply = res.data?.reply?.trim();
                        if (reply) setReplyText(reply);
                        else setAiReplyError('No reply generated. Try again.');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiReplyError(msg ?? 'Could not generate reply. Check that OPENROUTER_API_KEY is set.');
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 border border-indigo-200"
                    title={hasCommentExamples ? 'Generate reply with AI' : 'Add comment reply examples in AI Assistant to enable AI drafts'}
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  </button>
                  <button
                  type="button"
                  disabled={replySending || !replyText.trim()}
                  onClick={async () => {
                    const account = effectiveAccounts.find((a) => a.platform === selectedComment.platform);
                    if (!account || !selectedComment) return;
                    setReplySending(true);
                    try {
                      const sentMessage = replyText.trim();
                      await api.post(`/social/accounts/${account.id}/comments/reply`, {
                        commentId: selectedComment.commentId,
                        message: sentMessage,
                      });
                      // Add the sent reply optimistically to the top of the list
                      const myReply: PostComment = {
                        commentId: `local-reply-${Date.now()}`,
                        postTargetId: selectedComment.postTargetId,
                        platformPostId: selectedComment.platformPostId,
                        accountId: selectedComment.accountId,
                        postPreview: selectedComment.postPreview,
                        postImageUrl: selectedComment.postImageUrl,
                        postPublishedAt: selectedComment.postPublishedAt,
                        postUrl: selectedComment.postUrl,
                        text: sentMessage,
                        authorName: 'You',
                        authorPictureUrl: user?.avatarUrl ?? null,
                        createdAt: new Date().toISOString(),
                        platform: selectedComment.platform,
                        isFromMe: true,
                        parentCommentId: selectedComment.commentId,
                      };
                      setComments((prev) => [myReply, ...prev]);
                      setReplyText('');
                      setReplySendError(null);
                      // Refresh so the API-side reply appears. Skip for YouTube: API returns only top-level comments, so refetch would remove the reply from the list.
                      if (selectedComment.platform !== 'YOUTUBE' && selectedComment.platform !== 'TWITTER') {
                        setTimeout(() => setCommentsRefreshKey((k) => k + 1), 3000);
                      }
                    } catch (e: unknown) {
                      const err = e as { response?: { data?: unknown }; message?: string };
                      const data = err?.response?.data;
                      const msg = (data as { message?: string })?.message ?? err?.message ?? 'Failed to send reply. Please try again.';
                      setReplySendError(msg);
                    } finally {
                      setReplySending(false);
                    }
                  }}
                  className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  title="Send reply"
                  >
                    {replySending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                  </button>
                </div>
                {replySendError && (
                  <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    <span className="shrink-0 mt-0.5">⚠</span>
                    <span>{replySendError}</span>
                    <button type="button" onClick={() => setReplySendError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">✕</button>
                  </div>
                )}
                {!hasCommentExamples && inboxExamplesLoaded && (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    AI comment drafts are disabled. <a href="/dashboard/ai-assistant" className="font-medium underline">Add comment reply examples in AI Assistant</a> to enable them.
                  </p>
                )}
                {(selectedPlatform === 'INSTAGRAM' || selectedPlatform === 'FACEBOOK' || selectedPlatform === 'TWITTER') && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <button
                      type="button"
                      disabled={deleteCommentLoading}
                      onClick={async () => {
                        const account = effectiveAccounts.find((a) => a.platform === selectedComment.platform);
                        if (!account || !selectedComment) return;
                        if (!confirm('Delete this comment? It will be removed from your post.')) return;
                        setDeleteCommentLoading(true);
                        setReplySendError(null);
                        try {
                          await api.post(`/social/accounts/${account.id}/comments/delete`, {
                            commentId: selectedComment.commentId,
                          });
                          setComments((prev) => prev.filter((c) => c.commentId !== selectedComment.commentId));
                          setSelectedComment(null);
                          setReplyText('');
                        } catch (e: unknown) {
                          const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                          setReplySendError(msg ?? 'Failed to delete comment.');
                        } finally {
                          setDeleteCommentLoading(false);
                        }
                      }}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete this comment"
                    >
                      {deleteCommentLoading ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      Delete comment
                    </button>
                  </div>
                )}
                </>
                )}
                {selectedComment.platform === 'INSTAGRAM' || selectedComment.platform === 'FACEBOOK' ? (
                  <p className="text-xs text-neutral-400 mt-2">Use the sparkle button to generate a reply with AI, then edit or send.</p>
                ) : null}
              </div>
            </div>
          </>
        ) : inboxMode === 'comments' ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={48} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-600">Select a comment from the list to reply</p>
              <p className="text-xs text-neutral-400 mt-1">{PLATFORMS.find((p) => p.id === selectedPlatform)?.label} comments</p>
            </div>
          </div>
        ) : inboxMode === 'engagement' ? (
          <div className="flex-1 flex flex-col p-6 min-h-0 overflow-y-auto">
            {!selectedEngagement ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center max-w-sm">
                  <BarChart3 size={48} className="mx-auto text-neutral-300 mb-3" />
                  <p className="text-sm text-neutral-600">Select a post from the list to see likes and comments</p>
                  <p className="text-xs text-neutral-400 mt-1 flex items-center justify-center gap-1.5">
                    {selectedPlatform && (() => {
                      const plat = PLATFORMS.find((p) => p.id === selectedPlatform);
                      const Icon = plat?.icon;
                      return (
                        <>
                          {Icon && <Icon size={14} />}
                          <span>{plat?.label ?? selectedPlatform} engagement</span>
                        </>
                      );
                    })()}
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-w-2xl mx-auto w-full">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                    <p className="text-sm font-medium text-neutral-800">Engagement</p>
                    <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                      {(() => {
                        const plat = PLATFORMS.find((p) => p.id === selectedEngagement.platform);
                        const Icon = plat?.icon;
                        return (
                          <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
                            {Icon && <Icon size={14} />}
                            {plat?.label ?? selectedEngagement.platform}
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="rounded-lg overflow-hidden border border-neutral-100 mb-4 max-w-sm min-h-[120px] flex items-center justify-center bg-neutral-50">
                      {selectedEngagement.mediaUrl ? (
                        <img src={selectedEngagement.mediaUrl} alt="" className="w-full h-auto object-contain" />
                      ) : (
                        <div className="flex flex-col items-center justify-center gap-2 p-4 text-neutral-400">
                          <ImageIcon size={40} strokeWidth={1.5} />
                          <span className="text-xs">No image</span>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-neutral-700 mb-3">{selectedEngagement.postPreview || 'Post'}</p>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span className="font-medium text-neutral-900">{selectedEngagement.likeCount} likes</span>
                      <span className="font-medium text-neutral-900">{selectedEngagement.commentCount} comments</span>
                    </div>
                    {selectedEngagement.permalink && (
                      <a
                        href={selectedEngagement.permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block mt-3 text-sm text-indigo-600 hover:text-indigo-700"
                      >
                        View on {selectedEngagement.platform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : !selectedConversationId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={48} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-600">Select a conversation from the list</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                    {(() => {
                      const selectedConv = conversations.find((c) => c.id === selectedConversationId);
                      const cached = selectedConversationId ? conversationMessagesCache[selectedConversationId] : undefined;
                      const recipientNameFromCache = cached?.recipientName;
                      const senderNames = selectedConv?.senders?.map((s) => s.username ?? s.name).filter(Boolean).join(', ') || null;
                      const displayName = senderNames || (selectedPlatform === 'TWITTER' ? recipientNameFromCache : null) || null;
                      const chatWithLabel = displayName
                        ? `Chat with ${displayName}`
                        : selectedPlatform === 'TWITTER'
                          ? 'Chat with X (Twitter) user'
                          : 'Conversation';
                      return (
                        <>
                          <p className="text-sm font-medium text-neutral-800">{chatWithLabel}</p>
                          <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                            {selectedPlatform && (() => {
                              const plat = PLATFORMS.find((p) => p.id === selectedPlatform);
                              const Icon = plat?.icon;
                              return (
                                <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
                                  {Icon && <Icon size={14} />}
                                  {plat?.label ?? selectedPlatform} inbox
                                </span>
                              );
                            })()}
                          </p>
                        </>
                      );
                    })()}
                  </div>
                  <div className="p-6 min-h-[200px] overflow-y-auto max-h-[60vh]">
                    {conversationMessagesLoading ? (
                      <div className="flex flex-col items-center justify-center gap-2 py-6">
                        <Loader2 size={24} className="text-indigo-500 animate-spin" />
                        <p className="text-xs text-neutral-500">Loading messages…</p>
                      </div>
                    ) : conversationMessagesError ? (
                      <p className="text-sm text-amber-700">{conversationMessagesError}</p>
                    ) : conversationMessages.length === 0 ? (
                      <p className="text-sm text-neutral-500 italic">No messages in this conversation yet.</p>
                    ) : (
                      <>
                        {selectedPlatform === 'TWITTER' && conversationMessages.length <= 1 && (
                          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                            Only messages from accepted conversations appear here. To see full history, open <a href="https://x.com/messages" target="_blank" rel="noopener noreferrer" className="underline font-medium">x.com/messages</a> and accept any &quot;Message requests&quot; for this account, then refresh.
                          </p>
                        )}
                        <div className="space-y-4">
                        {conversationMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.isFromPage ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                msg.isFromPage
                                  ? 'bg-indigo-600 text-white rounded-br-md'
                                  : 'bg-neutral-100 text-neutral-900 rounded-bl-md'
                              }`}
                            >
                              {!msg.isFromPage && (
                                <p className="text-xs font-medium text-neutral-500 mb-0.5">
                                  {msg.fromName || (selectedPlatform === 'TWITTER' ? 'X (Twitter) user' : 'Unknown')}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.message || '—'}</p>
                              {msg.createdTime && (
                                <p className={`text-xs mt-1 ${msg.isFromPage ? 'text-indigo-200' : 'text-neutral-400'}`}>
                                  {new Date(msg.createdTime).toLocaleString()}
                                </p>
                              )}
                </div>
              </div>
                        ))}
            </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-neutral-200 bg-white p-4 shrink-0">
              <div className="max-w-2xl mx-auto">
                {selectedPlatform === 'TWITTER' && !conversationRecipientId && currentAccountForMessages && (
                  <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                    <p className="text-sm font-medium text-amber-900 mb-2">Recipient not detected. Enter their X username to send messages:</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-neutral-600 text-sm">@</span>
                      <input
                        type="text"
                        placeholder="username"
                        value={dmRecipientUsername}
                        onChange={(e) => { setDmRecipientUsername(e.target.value.replace(/^@/, '').trim()); setDmRecipientLookupError(null); }}
                        className="flex-1 min-w-[120px] px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <button
                        type="button"
                        disabled={dmRecipientLookupLoading || !dmRecipientUsername.trim()}
                        onClick={async () => {
                          const account = currentAccountForMessages;
                          if (!account || !dmRecipientUsername.trim()) return;
                          setDmRecipientLookupError(null);
                          setDmRecipientLookupLoading(true);
                          try {
                            const res = await api.get<{ id: string; name?: string; username?: string; profile_image_url?: string }>(
                              `/social/accounts/${account.id}/twitter-user-by-username`,
                              { params: { username: dmRecipientUsername.trim() } }
                            );
                            setConversationRecipientId(res.data.id);
                            if (selectedConversationId) {
                              setConversationMessagesCache((prev) => {
                                const prevCache = prev[selectedConversationId];
                                return {
                                  ...prev,
                                  [selectedConversationId]: {
                                    messages: prevCache?.messages ?? [],
                                    recipientId: res.data.id,
                                    recipientName: res.data.name ?? res.data.username ?? null,
                                    recipientPictureUrl: res.data.profile_image_url ?? null,
                                    error: prevCache?.error ?? null,
                                  },
                                };
                              });
                            }
                            setDmRecipientUsername('');
                          } catch (e: unknown) {
                            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'User not found';
                            setDmRecipientLookupError(msg);
                          } finally {
                            setDmRecipientLookupLoading(false);
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {dmRecipientLookupLoading ? 'Looking up…' : 'Look up'}
                      </button>
                    </div>
                    {dmRecipientLookupError && <p className="text-sm text-amber-800 mt-2">{dmRecipientLookupError}</p>}
                  </div>
                )}
                {aiReplyError && (
                  <p className="text-sm text-amber-700 mb-2">{aiReplyError}</p>
                )}
                <div className="flex items-end gap-2">
                <textarea
                  placeholder="Type a reply..."
                  rows={2}
                    value={dmReplyText}
                    onChange={(e) => setDmReplyText(e.target.value)}
                    disabled={dmReplySending}
                    className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <button
                  type="button"
                    disabled={dmReplySending || aiReplyLoading || !hasInboxExamples}
                    onClick={async () => {
                      const lastFromUser = [...conversationMessages].reverse().find((m) => !m.isFromPage && m.message);
                      const textToReplyTo = (lastFromUser?.message ?? conversationMessages.filter((m) => !m.isFromPage).map((m) => m.message).join('\n')) || 'Hello';
                      setAiReplyError(null);
                      setAiReplyLoading(true);
                      try {
                        const res = await api.post<{ reply?: string }>('/ai/generate-inbox-reply', {
                          type: 'message',
                          text: textToReplyTo,
                          platform: selectedPlatform ?? undefined,
                        });
                        const reply = res.data?.reply?.trim();
                        if (reply) setDmReplyText(reply);
                        else setAiReplyError('No reply generated. Try again.');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiReplyError(msg ?? 'Could not generate reply. Check that OPENROUTER_API_KEY is set.');
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 border border-indigo-200"
                    title={hasInboxExamples ? 'Generate reply with AI' : 'Add inbox reply examples in AI Assistant to enable AI drafts'}
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                </button>
                  {!hasInboxExamples && inboxExamplesLoaded && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-neutral-800 text-white text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      Add reply examples in AI Assistant to unlock
              </div>
                  )}
                <button
                  type="button"
                  disabled={dmReplySending || !dmReplyText.trim()}
                  onClick={async () => {
                    const account = currentAccountForMessages;
                    if (!account || !selectedConversationId || !dmReplyText.trim()) return;
                    setDmReplySending(true);
                    try {
                      await api.post(
                        `/social/accounts/${account.id}/conversations/${selectedConversationId}/messages`,
                        { text: dmReplyText.trim(), recipientId: conversationRecipientId ?? undefined }
                      );
                      setDmReplyText('');
                      const res = await api.get(`/social/accounts/${account.id}/conversations/${selectedConversationId}/messages`);
                      const messages = res.data?.messages ?? [];
                      setConversationMessages(messages);
                      const nextRecipientId = res.data?.recipientId ?? conversationRecipientId ?? null;
                      setConversationRecipientId(nextRecipientId);
                      setConversationMessagesError(res.data?.error ?? null);
                      setConversationMessagesCache((prev) => ({
                        ...prev,
                        [selectedConversationId]: {
                          messages,
                          recipientId: nextRecipientId,
                          recipientName: res.data?.recipientName ?? (prev[selectedConversationId]?.recipientName) ?? null,
                          recipientPictureUrl: res.data?.recipientPictureUrl ?? (prev[selectedConversationId]?.recipientPictureUrl) ?? null,
                          error: res.data?.error ?? null,
                        },
                      }));
                      api.get<{ inbox?: number; comments?: number; messages?: number; byPlatform?: Record<string, { comments: number; messages: number }> }>('/social/notifications').then((r) => {
                        if (r.data && appData) appData.setNotifications({
                          inbox: r.data.inbox ?? 0,
                          comments: r.data.comments ?? 0,
                          messages: r.data.messages ?? 0,
                          byPlatform: r.data.byPlatform ?? {},
                        });
                      }).catch(() => {});
                    } catch (e: unknown) {
                      const errMsg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Failed to send message.';
                      const isDevMode = errMsg.toLowerCase().includes('does not exist') || errMsg.toLowerCase().includes('missing permissions') || errMsg.toLowerCase().includes('unsupported');
                      setDmSendError(isDevMode
                        ? 'Could not send: Instagram may be in Development Mode. Only users added as Testers in your Meta App can receive messages while the app is not published.'
                        : errMsg);
                    } finally {
                      setDmReplySending(false);
                    }
                  }}
                  className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  title="Send"
                >
                  {dmReplySending ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
              {dmSendError && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="shrink-0 mt-0.5">&#x26a0;</span>
                    <span>{dmSendError}</span>
                    <button type="button" onClick={() => setDmSendError(null)} className="ml-auto shrink-0 text-amber-500 hover:text-amber-700">&#x2715;</button>
                  </div>
                  {(dmSendError.includes('capability') || dmSendError.includes('instagram_manage_messages') || dmSendError.includes('instagram_business_manage_messages')) && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2.5 text-xs text-indigo-900">
                      <p className="font-semibold mb-1.5">How to fix this</p>
                      <ol className="list-decimal list-inside space-y-1 text-indigo-800">
                        <li><strong>Reconnect</strong> Facebook &amp; Instagram from the left sidebar: click your Instagram or Facebook account icon, choose reconnect (or remove and add again). This refreshes the token and scopes.</li>
                        <li>If the app is in <strong>Development mode</strong> in Meta: go to <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline">Meta for Developers</a> &rarr; <strong>App roles</strong> &rarr; <strong>Roles</strong> and add the Instagram account you want to message as an <strong>Instagram Tester</strong>. They must accept the invite (Instagram &rarr; Settings &rarr; Apps and websites &rarr; Tester invitations).</li>
                        <li>For full access with any recipient: complete <strong>App Review</strong> for Instagram Manage Messages in Meta for Developers.</li>
                      </ol>
                    </div>
                  )}
                </div>
              )}
            </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function InboxPageWrapper() {
  return (
    <React.Suspense>
      <InboxPage />
    </React.Suspense>
  );
}
