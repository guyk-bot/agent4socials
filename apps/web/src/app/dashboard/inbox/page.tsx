'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  MessageCircle,
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
  getInboxInitializedAccountIds,
  addInboxInitializedAccount,
  getInboxInitializedAccountIdsForConversations,
  addInboxInitializedAccountForConversations,
} from '@/lib/inbox-read-state';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import { useAppData } from '@/context/AppDataContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import {
  InstagramIcon,
  FacebookIcon,
  YoutubeIcon,
  XTwitterIcon,
  LinkedinIcon,
  PinterestIcon,
  TikTokIcon,
} from '@/components/SocialPlatformIcons';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

/** All platforms that can appear in the inbox strip (per mode filter below). */
const INBOX_PLATFORM_DEFS = [
  { id: 'INSTAGRAM', label: 'Instagram', icon: InstagramIcon },
  { id: 'FACEBOOK', label: 'Facebook', icon: FacebookIcon },
  { id: 'YOUTUBE', label: 'YouTube', icon: YoutubeIcon },
  { id: 'TWITTER', label: 'Twitter/X', icon: XTwitterIcon, color: 'text-neutral-800' },
  { id: 'LINKEDIN', label: 'LinkedIn', icon: LinkedinIcon },
  { id: 'PINTEREST', label: 'Pinterest', icon: PinterestIcon },
  { id: 'TIKTOK', label: 'TikTok', icon: TikTokIcon },
] as const;

const MESSAGE_STRIP_PLATFORM_IDS = new Set<string>(
  INBOX_PLATFORM_DEFS.filter(
    (p) => p.id !== 'YOUTUBE' && p.id !== 'TIKTOK' && p.id !== 'LINKEDIN' && p.id !== 'PINTEREST'
  ).map((p) => p.id)
);
const COMMENT_STRIP_PLATFORM_IDS = new Set<string>(INBOX_PLATFORM_DEFS.map((p) => p.id));
/** Platforms where we can open a DM thread (Meta + X). */
const DM_THREAD_PLATFORM_IDS = new Set<string>(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);

type Account = { id: string; platform: string; username?: string | null };
type Conversation = {
  id: string;
  updatedTime: string | null;
  senders: Array<{ id?: string; name?: string; username?: string; pictureUrl?: string | null }>;
  messageCount?: number;
  /** Set when the inbox merges conversations from multiple accounts. */
  platform?: string;
  messageAccountId?: string;
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
  /** LinkedIn Community Management: thread URN from GET /comments (required for replies). */
  linkedInObjectUrn?: string | null;
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

const INBOX_MESSAGES_CACHE_KEY = 'agent4socials_inbox_messages_cache';
/** localStorage budget: ~2 MB — generous but safe for most browsers. */
const INBOX_MESSAGES_CACHE_MAX_BYTES = 2_000_000;
/** Keep up to 150 conversations so the full inbox list is covered. */
const INBOX_MESSAGES_CACHE_MAX_ENTRIES = 150;
type ConvCache = {
  messages: ConversationMessage[];
  recipientId: string | null;
  recipientName?: string | null;
  recipientPictureUrl?: string | null;
  error: string | null;
  accountId?: string;
  /** Timestamp of last write — used for LRU eviction. */
  _ts?: number;
};

/**
 * Add/update one entry in the conversation messages cache, evicting the oldest
 * entry when the cache would exceed MAX_ENTRIES. This prevents the cache from
 * growing unboundedly when the user opens many conversations in one session.
 */
/** True when cached messages can be shown without a network request. */
function isConvCacheUsable(cached: ConvCache | undefined, accountId: string): boolean {
  return Boolean(
    cached &&
      cached.accountId === accountId &&
      !cached.error &&
      Array.isArray(cached.messages)
  );
}

/**
 * True when cache reflects the conversation's latest activity (no age-based expiry).
 * Pass convUpdatedTime so a new incoming message forces a silent background refresh
 * while still showing the cached thread instantly.
 */
function isConvCacheFresh(
  cached: ConvCache | undefined,
  accountId: string,
  convUpdatedTime?: string | null
): boolean {
  if (!isConvCacheUsable(cached, accountId)) return false;
  if (!cached!._ts) return true; // legacy: no timestamp = assume fresh
  if (convUpdatedTime) {
    const convMs = Date.parse(convUpdatedTime);
    if (Number.isFinite(convMs) && convMs > cached!._ts) return false;
  }
  return true;
}

function withCacheEntry(
  prev: Record<string, ConvCache>,
  convId: string,
  entry: Omit<ConvCache, '_ts'>
): Record<string, ConvCache> {
  const next = { ...prev, [convId]: { ...entry, _ts: Date.now() } };
  const keys = Object.keys(next);
  if (keys.length <= INBOX_MESSAGES_CACHE_MAX_ENTRIES) return next;
  // Evict the least-recently-used key (lowest _ts), but never the current convId.
  const sorted = keys
    .filter((k) => k !== convId)
    .sort((a, b) => (next[a]?._ts ?? 0) - (next[b]?._ts ?? 0));
  const evict = sorted[0];
  if (evict) delete next[evict];
  return next;
}

function proxyImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return `/api/proxy-image?url=${encodeURIComponent(url)}`;
}

function freshPostImageUrl(comment: Pick<PostComment, 'accountId' | 'platformPostId' | 'platform'>): string {
  return `/api/post-image?accountId=${encodeURIComponent(comment.accountId)}&postId=${encodeURIComponent(comment.platformPostId)}`;
}

function MessagesConversationList({
  conversations,
  inboxFilter,
  searchQuery,
  messageInboxPlatformIds,
  selectMode,
  selectedConversationIds,
  selectedConversationId,
  unreadConversationIds,
  setSelectedPlatform,
  setSelectedConversationId,
  setSelectedConversationIds,
  setUnreadConversationIds,
  markConversationsAsRead,
  setTotalUnreadMessages,
  getConversationLastReadCounts,
  setConversationLastReadCount,
  user,
}: {
  conversations: Array<Conversation & { platform?: string }>;
  inboxFilter: string;
  searchQuery: string;
  messageInboxPlatformIds: string[];
  selectMode: boolean;
  selectedConversationIds: Set<string>;
  selectedConversationId: string | null;
  unreadConversationIds: Set<string>;
  setSelectedPlatform: (p: string | null) => void;
  setSelectedConversationId: (id: string | null) => void;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setUnreadConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  markConversationsAsRead: (ids: string[], userId: string | undefined) => void;
  setTotalUnreadMessages: React.Dispatch<React.SetStateAction<number>>;
  getConversationLastReadCounts: (userId: string | undefined) => Record<string, number>;
  setConversationLastReadCount: (convId: string, count: number, userId: string | undefined) => void;
  user: { id: string } | null;
}) {
  const filtered = conversations
    .filter((c) => {
      if (inboxFilter === 'all') return true;
      if (inboxFilter === 'read') return !unreadConversationIds.has(c.id);
      if (inboxFilter === 'unread') return unreadConversationIds.has(c.id);
      return true;
    })
    .filter((c) => !searchQuery || (c.senders?.[0]?.username ?? c.senders?.[0]?.name ?? c.id).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      // Primary: newest updatedTime first
      const timeDiff = (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '');
      if (timeDiff !== 0) return timeDiff;
      // Tiebreaker: unread conversations rise above read ones at the same timestamp
      return (unreadConversationIds.has(b.id) ? 1 : 0) - (unreadConversationIds.has(a.id) ? 1 : 0);
    });
  return (
    <div className="p-2 space-y-0">
      {filtered.map((c) => {
        const firstSender = c.senders?.[0];
        const rawName = firstSender?.username ?? firstSender?.name;
        const convPlatform = (c as Conversation & { platform?: string }).platform ?? (messageInboxPlatformIds.length === 1 ? messageInboxPlatformIds[0] : undefined);
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
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
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
              selectMode && selectedConversationIds.has(c.id) ? 'bg-orange-50 border border-orange-200' :
              selectedConversationId === c.id
                ? 'sidebar-item-selected border-slate-200/60 dark:bg-neutral-700 dark:border-neutral-600'
                : unreadConversationIds.has(c.id)
                  ? 'bg-orange-50/80 hover:bg-orange-100/80 dark:bg-neutral-900 dark:hover:bg-neutral-700'
                  : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
            }`}
          >
            {selectMode ? (
              <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${selectedConversationIds.has(c.id) ? 'bg-[var(--button)] border-[var(--button)]' : 'border-neutral-300'}`}>
                {selectedConversationIds.has(c.id) && <Check size={12} className="text-white" />}
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                {pictureUrl ? (
                  <img src={proxyImageUrl(pictureUrl) || pictureUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-semibold text-neutral-600">{initials}</span>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{name}</p>
              <p className="text-xs text-neutral-500 truncate flex items-center gap-1.5">
                {platform ? (() => {
                  const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === platform);
                  const Icon = plat?.icon;
                  return Icon ? <><Icon size={12} className="shrink-0 opacity-70" /><span>{plat?.label ?? platform}</span></> : null;
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
  );
}

function InboxPage() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const platformFromUrl = searchParams.get('platform')?.toUpperCase();
  const appData = useAppData();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<'all' | 'read' | 'unread'>('all');
  const [commentsFilter, setCommentsFilter] = useState<'all' | 'replied' | 'didnt_reply'>('all');
  const [searchQuery, setSearchQuery] = useState('');
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
  // Lazy-init the cache synchronously from localStorage so it's populated before
  // ANY effect runs — preventing the "spinner on re-open" race where the fetch
  // effect fires with an empty cache because localStorage restore was async.
  const [conversationMessagesCache, setConversationMessagesCache] = useState<Record<string, ConvCache>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = localStorage.getItem(INBOX_MESSAGES_CACHE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, ConvCache>;
      if (!parsed || typeof parsed !== 'object') return {};
      const now = Date.now();
      const fresh: Record<string, ConvCache> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v.error) continue;
        const ts = v._ts ?? now;
        fresh[k] = { ...v, _ts: ts };
      }
      return fresh;
    } catch {
      return {};
    }
  });
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
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [engagement, setEngagement] = useState<EngagementItem[]>([]);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<EngagementItem | null>(null);
  const [commentsRefreshKey, setCommentsRefreshKey] = useState(0);
  const [conversationsRefreshKey, setConversationsRefreshKey] = useState(0);
  const [deleteCommentLoading, setDeleteCommentLoading] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [unreadCommentIds, setUnreadCommentIds] = useState<Set<string>>(new Set());
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0); // sum of unread message counts when messageCount is available
  const [unreadEngagementIds, setUnreadEngagementIds] = useState<Set<string>>(new Set());
  const previousTopLevelCommentIdsRef = useRef<Set<string>>(new Set());
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  const previousEngagementIdsRef = useRef<Set<string>>(new Set());
  const conversationsLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsLoadedRef = useRef(false);
  // Stable ref so effects that call appData setters don't list appData as a dep
  // (which would cause infinite re-run loops whenever context state updates).
  const appDataRef = useRef(appData);
  /** Next X (Twitter) inbox fetch for these account IDs should send `manualInboxSync=1` (15m server cooldown). */
  const pendingManualInboxByAccountRef = useRef<Set<string>>(new Set());
  /** Background-prefetched conversation message cache keys: `${accountId}:${conversationId}` */
  const prefetchedConversationMessagesRef = useRef<Set<string>>(new Set());
  /** Abort in-flight message fetch when the user switches conversations. */
  const messagesFetchAbortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const conversationMessagesCacheRef = useRef(conversationMessagesCache);
  conversationMessagesCacheRef.current = conversationMessagesCache;

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

  // Keep the ref current every render so effects that use appDataRef always see the latest value.
  appDataRef.current = appData;

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

  // Force hard navigation for any internal link clicked while the inbox is mounted.
  // This bypasses the Next.js router entirely so concurrent inbox state updates
  // cannot block or delay navigation to the sidebar/header destinations.
  useEffect(() => {
    const forceNavOnLinkClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || !href.startsWith('/') || a.getAttribute('target') === '_blank') return;
      e.preventDefault();
      window.location.href = href;
    };
    document.addEventListener('click', forceNavOnLinkClick, true);
    return () => document.removeEventListener('click', forceNavOnLinkClick, true);
  }, []);

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
    if (platformFromUrl && INBOX_PLATFORM_DEFS.some((p) => p.id === platformFromUrl)) {
      const id = platformFromUrl;
      setSelectedPlatform(id);
      setSelectedPlatforms((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [platformFromUrl]);

  const effectiveAccounts = (cachedAccounts as Account[]).length > 0 ? (cachedAccounts as Account[]) : accounts;
  const connectedPlatformIds = effectiveAccounts.map((a) => a.platform).filter(Boolean);

  /** Keep selection in sync when accounts connect/disconnect (e.g. remove Pinterest from selection after disconnect). */
  useEffect(() => {
    if (connectedPlatformIds.length === 0) {
      setSelectedPlatforms([]);
      setSelectedPlatform(null);
      return;
    }

    setSelectedPlatforms((prev) => {
      const pruned = prev.filter((p) => connectedPlatformIds.includes(p));
      if (pruned.length > 0) return pruned;

      if (prev.length === 0) {
        const stored = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('agent4socials_inbox_platforms') : null;
        const parsed: string[] = stored
          ? (() => {
              try {
                const a = JSON.parse(stored);
                return Array.isArray(a) ? a : [];
              } catch {
                return [];
              }
            })()
          : [];
        const valid = parsed.filter((p) => connectedPlatformIds.includes(p));
        if (valid.length > 0) return valid;
      }

      return [...connectedPlatformIds];
    });
  }, [connectedPlatformIds.join(',')]);

  useEffect(() => {
    if (connectedPlatformIds.length === 0) return;
    setSelectedPlatform((sp) =>
      sp && selectedPlatforms.includes(sp) ? sp : selectedPlatforms[0] ?? null
    );
  }, [connectedPlatformIds.join(','), selectedPlatforms.join(',')]);

  useEffect(() => {
    if (selectedPlatforms.length > 0 && typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('agent4socials_inbox_platforms', JSON.stringify(selectedPlatforms));
    }
  }, [selectedPlatforms.join(',')]);


  // Persist conversation messages cache to localStorage. Debounced so rapid successive
  // cache writes (e.g. prefetch warmup) don't trigger JSON.stringify on every keypress.
  const persistCacheTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (typeof window === 'undefined' || Object.keys(conversationMessagesCache).length === 0) return;
    if (persistCacheTimeoutRef.current) clearTimeout(persistCacheTimeoutRef.current);
    persistCacheTimeoutRef.current = setTimeout(() => {
      try {
        const str = JSON.stringify(conversationMessagesCache);
        if (str.length <= INBOX_MESSAGES_CACHE_MAX_BYTES) {
          localStorage.setItem(INBOX_MESSAGES_CACHE_KEY, str);
        }
      } catch {
        // ignore quota
      }
    }, 2_000);
    return () => {
      if (persistCacheTimeoutRef.current) clearTimeout(persistCacheTimeoutRef.current);
    };
  }, [conversationMessagesCache]);

  // Warm server-side DB cache so first clicks and prefetch hit app_kv (fast) not live Meta.
  useEffect(() => {
    if (!user?.id) return;
    if (inboxMode !== 'messages') return;
    const WARM_KEY = 'inbox_warm_ts';
    const WARM_INTERVAL_MS = 5 * 60 * 1000;
    try {
      const last = Number(sessionStorage.getItem(WARM_KEY) ?? '0');
      if (Date.now() - last < WARM_INTERVAL_MS) return;
      sessionStorage.setItem(WARM_KEY, String(Date.now()));
    } catch { /* ignore */ }
    api.post('/inbox/warm').catch(() => {/* fire-and-forget */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, inboxMode, conversations.length]);

  const connectedPlatforms = INBOX_PLATFORM_DEFS.filter((p) => effectiveAccounts.some((a) => a.platform === p.id));
  const platformsToShow =
    inboxMode === 'comments'
      ? connectedPlatforms.filter((p) => COMMENT_STRIP_PLATFORM_IDS.has(p.id))
      : connectedPlatforms.filter((p) => MESSAGE_STRIP_PLATFORM_IDS.has(p.id));
  /** Selected platforms that load the Messages list (excludes YouTube; Pinterest/LinkedIn return empty with API hint). */
  const messageFetchPlatformIds = selectedPlatforms.filter((p) => MESSAGE_STRIP_PLATFORM_IDS.has(p));
  const byPlatform = appData?.notifications?.byPlatform ?? notifications.byPlatform ?? {};
  const effectiveNotifications = selectedPlatforms.length > 0
    ? {
        comments: selectedPlatforms.reduce((s, p) => s + (byPlatform[p]?.comments ?? 0), 0),
        messages: selectedPlatforms.reduce((s, p) => s + (byPlatform[p]?.messages ?? 0), 0),
      }
    : appData?.notifications
      ? { comments: appData.notifications.comments, messages: appData.notifications.messages }
      : { comments: notifications.comments, messages: notifications.messages };

  /** Per-platform conversation counts from the loaded list (always reliable, no API call needed). */
  const convCountByPlatform = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of conversations) {
      if (c.platform) result[c.platform] = (result[c.platform] ?? 0) + 1;
    }
    return result;
  }, [conversations]);

  /** Per-platform unread DM counts (used for badges on the platform filter icons). */
  const unreadMessagesByPlatform = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of conversations) {
      if (c.platform && unreadConversationIds.has(c.id)) {
        result[c.platform] = (result[c.platform] ?? 0) + 1;
      }
    }
    return result;
  }, [conversations, unreadConversationIds]);

  /** Per-platform unread comment counts (used for badges on the platform filter icons). */
  const unreadCommentsByPlatform = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of comments) {
      if (c.commentId && c.platform && !c.parentCommentId && unreadCommentIds.has(c.commentId)) {
        result[c.platform] = (result[c.platform] ?? 0) + 1;
      }
    }
    return result;
  }, [comments, unreadCommentIds]);

  const selectedConversation = useMemo(
    () => (selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : undefined),
    [conversations, selectedConversationId]
  );

  const dmThreadPlatform = useMemo(() => {
    const p = selectedConversation?.platform;
    if (p && DM_THREAD_PLATFORM_IDS.has(p)) return p;
    if (selectedPlatform && DM_THREAD_PLATFORM_IDS.has(selectedPlatform)) return selectedPlatform;
    return null;
  }, [selectedConversation?.platform, selectedPlatform]);

  const currentAccountForDmThread = useMemo(() => {
    if (!dmThreadPlatform) return null;
    if (selectedConversation?.messageAccountId) {
      return effectiveAccounts.find((a) => a.id === selectedConversation.messageAccountId) ?? null;
    }
    return effectiveAccounts.find((a) => a.platform === dmThreadPlatform) ?? null;
  }, [dmThreadPlatform, selectedConversation?.messageAccountId, effectiveAccounts]);

  const dmSendBlockedReason = useMemo(() => {
    if (!selectedConversationId) return 'Select a conversation to send a message.';
    if (!currentAccountForDmThread || !dmThreadPlatform) {
      return 'Select an account with DM support (Instagram, Facebook, or X).';
    }
    // If loading this thread already reported an error, fail fast instead of attempting POST.
    if (conversationMessagesError) {
      return conversationMessagesError;
    }
    // X DMs require explicit recipient id.
    if (dmThreadPlatform === 'TWITTER' && !conversationRecipientId) {
      return 'Recipient not detected for this X conversation. Use "Look up" first, then send.';
    }
    // Meta 24h messaging window: if latest incoming message is older than 24h, sending is blocked.
    if (dmThreadPlatform === 'INSTAGRAM' || dmThreadPlatform === 'FACEBOOK') {
      const latestIncoming = [...conversationMessages]
        .filter((m) => !m.isFromPage && Boolean(m.createdTime))
        .sort((a, b) => new Date(b.createdTime ?? 0).getTime() - new Date(a.createdTime ?? 0).getTime())[0];
      if (latestIncoming?.createdTime) {
        const ageMs = Date.now() - new Date(latestIncoming.createdTime).getTime();
        if (Number.isFinite(ageMs) && ageMs > 24 * 60 * 60 * 1000) {
          return 'FB and IG allow sending messages only within 24 hours of the customer\'s last message.';
        }
      }
    }
    return null;
  }, [
    selectedConversationId,
    currentAccountForDmThread,
    dmThreadPlatform,
    conversationMessagesError,
    conversationRecipientId,
    conversationMessages,
  ]);

  useEffect(() => {
    if (
      !selectedConversationId ||
      !currentAccountForDmThread ||
      !dmThreadPlatform ||
      !DM_THREAD_PLATFORM_IDS.has(dmThreadPlatform)
    ) {
      setConversationMessages([]);
      setConversationRecipientId(null);
      setConversationMessagesError(null);
      setConversationMessagesLoading(false);
      setDmRecipientLookupError(null);
      setDmRecipientUsername('');
      return;
    }
    const convId = selectedConversationId;
    const accountIdForFetch = currentAccountForDmThread.id;
    const cached = conversationMessagesCache[convId];
    if (isConvCacheUsable(cached, accountIdForFetch)) {
      setConversationMessages(cached!.messages);
      setConversationRecipientId(cached!.recipientId);
      setConversationMessagesError(null);
      setConversationMessagesLoading(false);
    }
  }, [selectedConversationId, currentAccountForDmThread?.id, dmThreadPlatform, conversationMessagesCache]);

  useEffect(() => {
    if (
      !selectedConversationId ||
      !currentAccountForDmThread ||
      !dmThreadPlatform ||
      !DM_THREAD_PLATFORM_IDS.has(dmThreadPlatform)
    ) {
      return;
    }
    const convId = selectedConversationId;
    const accountIdForFetch = currentAccountForDmThread.id;
    const cached = conversationMessagesCacheRef.current[convId];
    const convForRecipient = conversationsRef.current.find((c) => c.id === convId);
    const recipientFromConv = convForRecipient?.senders?.[0]?.id ?? null;
    // Pass the conversation's updatedTime so the cache is considered stale when a new
    // message arrived after the last fetch (conv updated_time > cache _ts).
    const cacheUsable = isConvCacheUsable(cached, accountIdForFetch);
    const cacheFresh = isConvCacheFresh(cached, accountIdForFetch, convForRecipient?.updatedTime);

    if (cacheUsable) {
      setConversationMessages(cached!.messages);
      setConversationRecipientId(cached!.recipientId);
      setConversationMessagesError(null);
      setConversationMessagesLoading(false);
    }

    if (cacheFresh) return;

    messagesFetchAbortRef.current?.abort();
    const ac = new AbortController();
    messagesFetchAbortRef.current = ac;

    // Stale-but-usable: show cached messages immediately, refresh in background (no spinner).
    if (!cacheUsable) {
      setConversationMessagesLoading(true);
    }
    setConversationMessagesError(null);

    // Only pass convUpdatedTime when refreshing a stale LOCAL cache. On first open (no local
    // cache) omit it so the server DB cache (app_kv, warmed by cron / /api/inbox/warm) is used
    // and the thread opens in one fast round-trip instead of a live Meta API call.
    const convUpdatedTime =
      cacheUsable && !cacheFresh && convForRecipient?.updatedTime
        ? convForRecipient.updatedTime
        : null;
    const messagesUrl = `/social/accounts/${accountIdForFetch}/conversations/${convId}/messages${convUpdatedTime ? `?convUpdatedTime=${encodeURIComponent(convUpdatedTime)}` : ''}`;
    api
      .get(messagesUrl, {
        timeout: 35_000,
        signal: ac.signal,
      })
      .then((res) => {
        if (ac.signal.aborted) return;
        const freshMessages = res.data?.messages ?? [];
        const error = res.data?.error ?? null;
        const recipientId = res.data?.recipientId ?? recipientFromConv ?? null;
        const recipientName = res.data?.recipientName ?? null;
        const recipientPictureUrl = res.data?.recipientPictureUrl ?? null;
        // If the server returned an error (e.g. throttled) but no messages, keep
        // the existing cached messages so the thread doesn't suddenly go blank.
        setConversationMessagesCache((prev) => {
          const existing = prev[convId];
          const messages = freshMessages.length > 0
            ? freshMessages
            : (existing?.messages?.length ? existing.messages : freshMessages);
          return withCacheEntry(prev, convId, {
            messages,
            recipientId,
            recipientName,
            recipientPictureUrl,
            // Do not persist error when we have messages — errors block instant re-open.
            error: messages.length > 0 ? null : error,
            accountId: accountIdForFetch,
          });
        });
        if (selectedConversationId === convId) {
          const displayMessages = freshMessages.length > 0
            ? freshMessages
            : (conversationMessagesCacheRef.current[convId]?.messages ?? freshMessages);
          setConversationMessages(displayMessages);
          setConversationLastReadCount(convId, displayMessages.length, user?.id);
          setConversationRecipientId(recipientId);
          setConversationMessagesError(displayMessages.length > 0 ? null : error);
        }
      })
      .catch((e: { code?: string; name?: string; response?: { data?: { error?: string } }; message?: string }) => {
        if (ac.signal.aborted || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return;
        const isTimeout = e?.code === 'ECONNABORTED' || /timeout/i.test(e?.message ?? '');
        const apiError =
          e?.response?.data?.error ??
          (isTimeout
            ? 'The platform is taking too long to respond. Try again in a moment.'
            : (e?.message ?? 'Could not load messages.'));
        // Preserve existing messages so a failed refresh doesn't wipe the cached thread.
        const existingOnFail = conversationMessagesCacheRef.current[convId];
        const keepMessages =
          existingOnFail?.messages && existingOnFail.messages.length > 0
            ? existingOnFail.messages
            : ([] as ConversationMessage[]);
        setConversationMessagesCache((prev) =>
          withCacheEntry(prev, convId, {
            messages: keepMessages,
            recipientId: existingOnFail?.recipientId ?? recipientFromConv ?? null,
            recipientName: existingOnFail?.recipientName ?? null,
            recipientPictureUrl: existingOnFail?.recipientPictureUrl ?? null,
            error: keepMessages.length > 0 ? null : (apiError as string | null),
            accountId: accountIdForFetch,
          })
        );
        if (selectedConversationId === convId) {
          if (keepMessages.length > 0) {
            setConversationMessages(keepMessages);
            setConversationMessagesError(null);
          } else {
            setConversationMessagesError(apiError);
          }
        }
      })
      .finally(() => {
        if (!ac.signal.aborted && selectedConversationId === convId) {
          setConversationMessagesLoading(false);
        }
      });

    return () => {
      ac.abort();
    };
  // selectedConversation?.updatedTime is intentionally in deps: when the conversation list
  // refreshes and the updatedTime advances (new message arrived), this effect re-runs so
  // isConvCacheFresh detects the stale cache and fetches the new messages automatically.
  }, [selectedConversationId, currentAccountForDmThread?.id, dmThreadPlatform, user?.id, selectedConversation?.updatedTime]);

  useEffect(() => {
    setAiReplyError(null);
  }, [selectedComment?.commentId, selectedConversationId]);

  // Background prefetch: once conversations are available, warm per-thread message cache so
  // opening any conversation feels instant without the user waiting on a new request.
  useEffect(() => {
    if (!user?.id) return;
    if (conversations.length === 0) return;

    const targets = conversations.filter(
      (c) => c.id && c.platform && DM_THREAD_PLATFORM_IDS.has(c.platform)
    );
    if (targets.length === 0) return;

    let cancelled = false;
    const PREFETCH_CONCURRENCY = 6;

    const prefetchOne = async (conv: (typeof targets)[0]) => {
      const account = conv.messageAccountId
        ? effectiveAccounts.find((a) => a.id === conv.messageAccountId)
        : conv.platform
          ? effectiveAccounts.find((a) => a.platform === conv.platform)
          : null;
      if (!account) return;

      const cacheKey = `${account.id}:${conv.id}`;
      if (prefetchedConversationMessagesRef.current.has(cacheKey)) return;

      const existing = conversationMessagesCacheRef.current[conv.id];
      if (isConvCacheFresh(existing, account.id, conv.updatedTime)) {
        prefetchedConversationMessagesRef.current.add(cacheKey);
        return;
      }

      prefetchedConversationMessagesRef.current.add(cacheKey);
      try {
        const res = await api.get(
          `/social/accounts/${account.id}/conversations/${conv.id}/messages`,
          { timeout: 35_000, params: { background: '1' } }
        );
        if (cancelled) return;
        if (res.data?.error === 'throttled') {
          prefetchedConversationMessagesRef.current.delete(cacheKey);
          return;
        }
        const messages = res.data?.messages ?? [];
        // Never store empty error responses — they block isConvCacheUsable on click.
        if (messages.length === 0 && res.data?.error) {
          prefetchedConversationMessagesRef.current.delete(cacheKey);
          return;
        }
        const recipientFromConv = conv.senders?.[0]?.id ?? null;
        const recipientId = res.data?.recipientId ?? recipientFromConv ?? null;
        setConversationMessagesCache((prev) =>
          withCacheEntry(prev, conv.id, {
            messages,
            recipientId,
            recipientName: res.data?.recipientName ?? null,
            recipientPictureUrl: res.data?.recipientPictureUrl ?? null,
            error: null,
            accountId: account.id,
          })
        );
      } catch {
        prefetchedConversationMessagesRef.current.delete(cacheKey);
      }
    };

    void (async () => {
      const queue = [...targets];
      const workers = Array.from({ length: PREFETCH_CONCURRENCY }, async () => {
        while (queue.length > 0 && !cancelled) {
          const conv = queue.shift();
          if (conv) await prefetchOne(conv);
        }
      });
      await Promise.allSettled(workers);
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id, conversations, effectiveAccounts]);

  // Fetch last message per selected conversation for batch reply cards (show "message user sent" instead of "How do you want to reply?")
  useEffect(() => {
    if (selectedConversationIds.size === 0) {
      setBatchConversationLastMessage({});
      return;
    }
    const ids = Array.from(selectedConversationIds);
    const next: Record<string, string> = {};
    let cancelled = false;
    Promise.all(
      ids.map(async (convId) => {
        if (cancelled) return;
        const c = conversations.find((x) => x.id === convId);
        const plat = c?.platform && DM_THREAD_PLATFORM_IDS.has(c.platform) ? c.platform : null;
        const acc = c?.messageAccountId
          ? effectiveAccounts.find((a) => a.id === c.messageAccountId)
          : plat
            ? effectiveAccounts.find((a) => a.platform === plat)
            : null;
        if (!acc) return { convId, text: '' };
        try {
          const res = await api.get<{ messages?: Array<{ message?: string; isFromPage?: boolean }> }>(
            `/social/accounts/${acc.id}/conversations/${convId}/messages`
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
  }, [
    Array.from(selectedConversationIds).sort().join(','),
    conversations
      .filter((c) => selectedConversationIds.has(c.id))
      .map((c) => `${c.id}:${c.messageAccountId ?? ''}:${c.platform ?? ''}`)
      .sort()
      .join('|'),
    effectiveAccounts.map((a) => a.id).join(','),
  ]);

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

  useEffect(() => {
    if (messageFetchPlatformIds.length === 0) {
      setConversations([]);
      setConversationsLoading(false);
      setConversationsError(null);
      setConversationsDebug(null);
      return;
    }
    let cancelled = false;
    const merge: Array<Conversation & { platform: string; messageAccountId: string }> = [];
    const errors: string[] = [];
    const debugs: Array<{ rawMessage?: string; code?: number; responseData?: unknown; metaMessage?: string }> = [];
    let pending = messageFetchPlatformIds.length;
    let needsFetch = false;
    const platformsToFetch: Array<{ platform: string; account: { id: string; platform: string }; since?: string }> = [];

    const finishConversationMerge = () => {
      const sorted = merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
      setConversations(sorted);
      if (sorted.length > 0) conversationsLoadedRef.current = true;
      setConversationsError(sorted.length === 0 ? (errors[0] ?? null) : null);
      setConversationsDebug(sorted.length === 0 ? (debugs[0] ?? null) : null);
      setConversationsLoading(false);
    };

    messageFetchPlatformIds.forEach((platform) => {
      const account = effectiveAccounts.find((a) => a.platform === platform);
      if (!account) {
        if (--pending === 0 && !cancelled) finishConversationMerge();
        return;
      }
      // LinkedIn/Pinterest are on the message strip for UX but have no DM API in this app; skip HTTP to avoid axios "Network Error".
      if (!DM_THREAD_PLATFORM_IDS.has(platform)) {
        appData?.setConversationsForAccount(account.id, []);
        if (--pending === 0 && !cancelled) finishConversationMerge();
        return;
      }
      const fromCache = appData?.getConversations(account.id);
      const useCache = fromCache !== undefined && fromCache !== null;
      const fromCacheList = useCache ? (fromCache as Conversation[]) : [];
      if (useCache) {
        const list: Array<Conversation & { platform: string; messageAccountId: string }> = fromCacheList.map((c: Conversation) => ({
          ...c,
          platform,
          messageAccountId: account.id,
        }));
        merge.push(...list);
        if (list.length > 0 && user?.id) {
          const initialized = getInboxInitializedAccountIdsForConversations(user.id);
          if (!initialized.has(account.id)) {
            const ids = list.map((c) => c.id);
            markConversationsAsRead(ids, user.id);
            list.forEach((c) => {
              const count = c.messageCount;
              if (typeof count === 'number') setConversationLastReadCount(c.id, count, user.id);
            });
            addInboxInitializedAccountForConversations(account.id, user.id);
          }
        }
      }
      const newestCachedUpdatedAt =
        fromCacheList
          .map((c) => c.updatedTime)
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
          .sort((a, b) => b.localeCompare(a))[0] ?? undefined;
      const shouldDeltaFetch = useCache && conversationsRefreshKey > 0;

      if (!useCache || shouldDeltaFetch) {
        // No cache: fetch live.
        // Cache exists and refresh key changed: fetch only new/changed conversations since latest cached item.
        needsFetch = true;
        platformsToFetch.push({
          platform,
          account,
          ...(shouldDeltaFetch && newestCachedUpdatedAt ? { since: newestCachedUpdatedAt } : {}),
        });
      } else {
        // Cache hit: decrement pending now so finishConversationMerge fires correctly.
        if (--pending === 0 && !cancelled) finishConversationMerge();
      }
    });

    // Show cached conversations immediately so inbox opens faster; then fetch missing platforms in background
    if (merge.length > 0 && !cancelled) {
      const sorted = [...merge].sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
      setConversations(sorted);
      conversationsLoadedRef.current = true;
      setConversationsLoading(false);
    }

    platformsToFetch.forEach(({ platform, account, since }) => {
      const wantManual = platform === 'TWITTER' && pendingManualInboxByAccountRef.current.has(account.id);
      if (wantManual) pendingManualInboxByAccountRef.current.delete(account.id);
      // Build the conversations URL with proper query string (? for first param, & for rest).
      const convParams: string[] = [];
      if (wantManual) convParams.push('manualInboxSync=1');
      if (since) { convParams.push(`since=${encodeURIComponent(since)}`); convParams.push('delta=1'); }
      const convUrl = `/social/accounts/${account.id}/conversations${convParams.length ? `?${convParams.join('&')}` : ''}`;
      api.get(convUrl)
      .then((res) => {
          if (cancelled) return;
          const list = (res.data?.conversations ?? []).map((c: Conversation) => ({
            ...c,
            platform,
            messageAccountId: account.id,
          }));
          merge.push(...list);
          if (res.data?.error) errors.push(res.data.error);
          if (res.data?.debug) {
            debugs.push(res.data.debug as { rawMessage?: string; code?: number; responseData?: unknown; metaMessage?: string });
          }
          if (!res.data?.error) {
            const cachedForAccount = appData?.getConversations(account.id) ?? [];
            const incoming = (res.data?.conversations ?? []) as Conversation[];
            const mergedById = new Map<string, Conversation>();
            for (const item of cachedForAccount) mergedById.set(item.id, item);
            for (const item of incoming) mergedById.set(item.id, item);
            appData?.setConversationsForAccount(
              account.id,
              Array.from(mergedById.values()).sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''))
            );
          }
          if (!res.data?.error && list.length > 0 && user?.id) {
            const initialized = getInboxInitializedAccountIdsForConversations(user.id);
            if (!initialized.has(account.id)) {
              type ConvWithPlatform = Conversation & { platform: string; messageAccountId: string };
              const ids = list.map((c: ConvWithPlatform) => c.id);
              markConversationsAsRead(ids, user.id);
              list.forEach((c: ConvWithPlatform) => {
                const count = c.messageCount;
                if (typeof count === 'number') setConversationLastReadCount(c.id, count, user.id);
              });
              addInboxInitializedAccountForConversations(account.id, user.id);
            }
          }
          if (--pending === 0) {
            const sorted = merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
            setConversations(sorted);
            if (sorted.length > 0) conversationsLoadedRef.current = true;
            setConversationsError(sorted.length === 0 ? (errors[0] ?? null) : null);
            setConversationsDebug(sorted.length === 0 ? (debugs[0] ?? null) : null);
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
          errors.push(isRateLimit ? msg : isTimeout ? 'Request timed out. The server or Meta may be slow.' : msg);
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
            const sorted = merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
            setConversations(sorted);
            if (sorted.length > 0) conversationsLoadedRef.current = true;
            setConversationsError(sorted.length === 0 ? (errors[0] ?? null) : null);
            setConversationsDebug(sorted.length === 0 ? (debugs[0] ?? null) : null);
          }
        })
        .finally(() => {
          if (pending === 0 && !cancelled) {
            if (conversationsLoadTimeoutRef.current) {
              clearTimeout(conversationsLoadTimeoutRef.current);
              conversationsLoadTimeoutRef.current = null;
            }
            setConversationsLoading(false);
          }
        });
    });

    if (needsFetch) {
      if (merge.length === 0) {
        conversationsLoadedRef.current = false;
        setConversationsLoading(true);
        setConversationsError(null);
        setConversationsDebug(null);
      }
      // Use a longer timeout (55s) so we don't show an error while Meta/API is slow after re-login; avoids confusing flash of error then partial load.
      conversationsLoadTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        setConversationsLoading(false);
        if (!conversationsLoadedRef.current) {
          setConversationsError('Loading is taking longer than usual. Try refreshing.');
        }
      }, 55000);
    }
    return () => {
      cancelled = true;
      if (conversationsLoadTimeoutRef.current) {
        clearTimeout(conversationsLoadTimeoutRef.current);
        conversationsLoadTimeoutRef.current = null;
      }
      setConversationsLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageFetchPlatformIds.join(','), effectiveAccounts.map((a) => a.id).join(','), conversationsRefreshKey, user?.id]);

  // Keep inbox messages fresh every 5 minutes while preserving cache-first UX.
  // This triggers delta fetches only, so existing conversations open instantly from cache.
  useEffect(() => {
    if (inboxMode !== 'messages') return;
    if (messageFetchPlatformIds.length === 0) return;
    const interval = setInterval(() => setConversationsRefreshKey((k) => k + 1), 2 * 60_000);
    // Also refresh immediately when the tab becomes visible again (user switches back).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') setConversationsRefreshKey((k) => k + 1);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [inboxMode, messageFetchPlatformIds.join(',')]);

  // Twitter/X thread cache refresher: refreshes message payloads every 5 minutes in background.
  // This keeps X conversations fast to open from cache and avoids stale thread bodies.
  useEffect(() => {
    if (inboxMode !== 'messages') return;
    if (!user?.id) return;
    const hasTwitter = messageFetchPlatformIds.includes('TWITTER');
    if (!hasTwitter) return;

    let cancelled = false;
    const refreshTwitterThreadCache = async () => {
      // Only refresh the most recently-used 8 threads to limit memory growth and X API usage.
      const twitterConversations = conversations.filter((c) => c.platform === 'TWITTER' && !!c.id).slice(0, 8);
      if (twitterConversations.length === 0) return;

      // Sequential (not parallel) to avoid hammering X API and avoid concurrent React state updates.
      for (const conv of twitterConversations) {
        if (cancelled) return;
        const account = conv.messageAccountId
          ? effectiveAccounts.find((a) => a.id === conv.messageAccountId)
          : effectiveAccounts.find((a) => a.platform === 'TWITTER');
        if (!account) continue;
        try {
          const res = await api.get(`/social/accounts/${account.id}/conversations/${conv.id}/messages`, { timeout: 60_000 });
          if (cancelled) return;
          const messages = res.data?.messages ?? [];
          const recipientFromConv = conv.senders?.[0]?.id ?? null;
          const recipientId = res.data?.recipientId ?? recipientFromConv ?? null;
          setConversationMessagesCache((prev) =>
            withCacheEntry(prev, conv.id, {
              messages,
              recipientId,
              recipientName: res.data?.recipientName ?? null,
              recipientPictureUrl: res.data?.recipientPictureUrl ?? null,
              error: res.data?.error ?? null,
              accountId: account.id,
            })
          );
        } catch {
          // Silent refresh failure; foreground open still uses existing cache/fetch flow.
        }
      }
    };

    const interval = setInterval(() => {
      void refreshTwitterThreadCache();
    }, 10 * 60_000); // 10 min — was 5 min, reduced to halve background memory pressure

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    inboxMode,
    user?.id,
    messageFetchPlatformIds.join(','),
    conversations.map((c) => `${c.id}:${c.platform ?? ''}:${c.messageAccountId ?? ''}`).join('|'),
    effectiveAccounts.map((a) => `${a.id}:${a.platform}`).join(','),
  ]);

  // Messages mode: YouTube/TikTok have no DM strip; switch to a message-capable platform.
  useEffect(() => {
    if (inboxMode !== 'messages') return;
    if (selectedPlatform && MESSAGE_STRIP_PLATFORM_IDS.has(selectedPlatform)) return;
    const next =
      selectedPlatforms.find((p) => MESSAGE_STRIP_PLATFORM_IDS.has(p)) ??
      connectedPlatforms.find((p) => MESSAGE_STRIP_PLATFORM_IDS.has(p.id))?.id ??
      null;
    setSelectedPlatform(next);
    setSelectedConversationId(null);
  }, [inboxMode, selectedPlatform, selectedPlatforms.join(','), connectedPlatforms.map((p) => p.id).join(',')]);

  // Auto-open the first conversation when the list loads (messages mode). Do not change selectedPlatform to avoid icon flashing.
  const hasAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (inboxMode !== 'messages' || !conversations.length || selectedConversationId) return;
    if (hasAutoOpenedRef.current) return;
    hasAutoOpenedRef.current = true;
    const first = conversations[0];
    const p = first.platform;
    if (p && MESSAGE_STRIP_PLATFORM_IDS.has(p)) setSelectedPlatform(p);
    setSelectedConversationId(first.id);
  }, [inboxMode, conversations, selectedConversationId]);
  useEffect(() => {
    if (inboxMode !== 'messages' || !conversations.length) hasAutoOpenedRef.current = false;
  }, [inboxMode, conversations.length]);

  const commentsSupportedPlatforms = selectedPlatforms.filter((p) => COMMENT_STRIP_PLATFORM_IDS.has(p));
  const platformsToFetchComments = commentsSupportedPlatforms;

  useEffect(() => {
    if (inboxMode !== 'comments') return;
    if (selectedPlatform && COMMENT_STRIP_PLATFORM_IDS.has(selectedPlatform)) return;
    const next = commentsSupportedPlatforms[0] ?? null;
    if (next) setSelectedPlatform(next);
  }, [inboxMode, selectedPlatform, commentsSupportedPlatforms.join(',')]);
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
          setCommentsError(merge.length === 0 ? (errorsFound[0] ?? null) : null);
        }
        return;
      }
      const fromCache = appData?.getComments(account.id);
      const useCache = fromCache !== undefined && fromCache !== null;
      const fromCacheList = useCache ? fromCache : [];
      if (useCache) {
        const withAccountId = fromCacheList.map((c) => ({ ...c, accountId: (c as PostComment).accountId ?? account.id }));
        merge.push(...withAccountId);
      }

      const newestCachedCreatedAt =
        fromCacheList
          .map((c) => c.createdAt)
          .filter((v): v is string => typeof v === 'string' && v.length > 0)
          .sort((a, b) => b.localeCompare(a))[0] ?? undefined;
      const shouldDeltaFetch = useCache && commentsRefreshKey > 0;

      if (!useCache || shouldDeltaFetch) {
        needsFetch = true;
        const url =
          `/social/accounts/${account.id}/comments` +
          `${shouldDeltaFetch && newestCachedCreatedAt ? `?since=${encodeURIComponent(newestCachedCreatedAt)}&delta=1` : ''}`;
        api.get(url)
          .then((res) => {
            if (cancelled) return;
            const list: PostComment[] = res.data?.comments ?? [];
            const apiError: string | null = res.data?.error ?? null;
            if (apiError) {
              errorsFound.push(apiError);
            } else {
              const mergedById = new Map<string, PostComment>();
              for (const existing of fromCacheList) {
                const normalized = { ...existing, accountId: (existing as PostComment).accountId ?? account.id } as PostComment;
                mergedById.set(normalized.commentId, normalized);
              }
              for (const incoming of list) {
                const normalized = { ...incoming, accountId: incoming.accountId ?? account.id } as PostComment;
                mergedById.set(normalized.commentId, normalized);
              }
              const mergedAccountList = Array.from(mergedById.values()).sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              );
              appData?.setCommentsForAccount(account.id, mergedAccountList);
              merge.push(...mergedAccountList);
            }
            if (--pending === 0) {
              setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
              setCommentsError(merge.length === 0 && errorsFound.length > 0 ? errorsFound[0] : null);
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
              setCommentsError(merge.length === 0 ? (errorsFound[0] ?? 'Could not load comments.') : null);
              setCommentsLoading(false);
            }
          });
      } else {
        if (--pending === 0 && !cancelled) {
          setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          setCommentsError(null);
          setCommentsLoading(false);
        }
      }
    });

    if (needsFetch) {
      if (merge.length === 0) setCommentsLoading(true);
      setCommentsError(null);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [platformsToFetchComments.join(','), effectiveAccounts.map((a) => a.id).join(','), commentsRefreshKey]);

  // Keep inbox comments fresh (0 to 5 min target) while comments tab is active.
  useEffect(() => {
    if (inboxMode !== 'comments') return;
    if (platformsToFetchComments.length === 0) return;
    const interval = setInterval(() => setCommentsRefreshKey((k) => k + 1), 5 * 60_000);
    return () => clearInterval(interval);
  }, [inboxMode, platformsToFetchComments.join(',')]);

  // Track unread comment ids. When we first load comments for an account, mark them all as read so we only highlight new notifications after connection.
  useEffect(() => {
    const topLevel = comments.filter((c) => !c.parentCommentId);
    const topLevelIds = new Set(topLevel.map((c) => c.commentId));
    const initializedAccounts = getInboxInitializedAccountIds(user?.id);
    const accountIds = [...new Set(comments.map((c) => c.accountId).filter(Boolean))];
    for (const accountId of accountIds) {
      if (initializedAccounts.has(accountId)) continue;
      const idsForAccount = comments.filter((c) => c.accountId === accountId).map((c) => c.commentId);
      markCommentsAsRead(idsForAccount, user?.id);
      addInboxInitializedAccount(accountId, user?.id);
    }
    const readSet = getReadCommentIds(user?.id);
    const unreadIds = [...topLevelIds].filter((id) => !readSet.has(id));
    setUnreadCommentIds(new Set(unreadIds));
    previousTopLevelCommentIdsRef.current = topLevelIds;
  }, [comments, user?.id]);

  // NOTE: Auto-refresh for comments was removed. Comments are now refreshed only via the
  // backend cron job every 30 minutes to avoid hammering Meta's API rate limits.

  // For engagement, always show all connected IG+FB accounts regardless of platform filter
  const allEngagementAccounts = effectiveAccounts.filter(
    (a) =>
      a.platform === 'INSTAGRAM' ||
      a.platform === 'FACEBOOK' ||
      a.platform === 'YOUTUBE'
  );
  const engagementPlatforms = selectedPlatforms.filter(
    (p) => p === 'INSTAGRAM' || p === 'FACEBOOK' || p === 'YOUTUBE'
  );
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
    let hasCachedEngagement = false;
    setEngagementError(null);

    allEngagementAccounts.forEach((account) => {
      const cached = appData?.getEngagement(account.id) as EngagementItem[] | undefined;
      if (cached !== undefined) {
        hasCachedEngagement = true;
        merge.push(...cached);
      }
    });

    if (hasCachedEngagement) {
      const sorted = [...merge].sort((a, b) => (b.likeCount + b.commentCount) - (a.likeCount + a.commentCount));
      setEngagement(sorted);
      setEngagementLoading(false);
      merge.length = 0;
    } else {
      setEngagementLoading(true);
    }

    allEngagementAccounts.forEach((account) => {
      api.get<{ engagement?: EngagementItem[]; error?: string }>(`/social/accounts/${account.id}/engagement`)
        .then((res) => {
          if (cancelled) return;
          const list = res.data?.engagement ?? [];
          merge.push(...list);
          // Use ref so we don't list appData as a dep (which causes an infinite re-run loop).
          appDataRef.current?.setEngagementForAccount(account.id, list as Record<string, unknown>[]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEngagementAccounts.map((a) => a.id).join(','), effectiveAccounts.length]);

  // Track unread conversation ids and total unread messages: use messageCount + lastRead when available.
  // When we first see a conversation (no stored lastRead), treat it as read so we only highlight new notifications after connection.
  useEffect(() => {
    const ids = new Set(conversations.map((c) => c.id));
    const readSet = getReadConversationIds(user?.id);
    let lastRead = getConversationLastReadCounts(user?.id);
    const hasAnyMessageCount = conversations.some((c) => typeof c.messageCount === 'number');

    if (hasAnyMessageCount) {
      let didInit = false;
      const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(user?.id);
      for (const c of conversations) {
        if (lastRead[c.id] !== undefined) continue;
        const accId = (c as Conversation & { messageAccountId?: string }).messageAccountId;
        if (accId && initializedConvAccounts.has(accId)) continue;
        setConversationLastReadCount(c.id, c.messageCount ?? 0, user?.id);
        didInit = true;
      }
      if (didInit) lastRead = getConversationLastReadCounts(user?.id);

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

  // Sync total unread to appData so the header Inbox badge stays accurate.
  useEffect(() => {
    const messagesCount = totalUnreadMessages > 0 ? totalUnreadMessages : unreadConversationIds.size;
    const total = unreadCommentIds.size + messagesCount;
    appDataRef.current?.setNotifications({
      ...(appDataRef.current.notifications ?? { inbox: 0, comments: 0, messages: 0 }),
      inbox: Math.min(total, 99),
    });
  }, [unreadCommentIds.size, unreadConversationIds.size, totalUnreadMessages]);

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

  const renderSidebarList = () => {
    if (inboxMode === 'engagement') {
      if (engagementLoading) {
        return (
          <div className="p-6 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="text-orange-500 animate-spin" />
            <p className="text-sm text-neutral-500">Loading engagement…</p>
          </div>
        );
      }
      if (engagementError) {
        return (
          <div className="p-4">
            <p className="text-sm text-neutral-700">{engagementError}</p>
          </div>
        );
      }
      if (engagement.length === 0) {
        return (
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
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700"
            >
              <RefreshCw size={14} />
              Refresh engagement
            </button>
          </div>
        );
      }
      return (
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
                    selectedEngagement?.platformPostId === e.platformPostId
                      ? 'sidebar-item-selected border border-slate-200/60 dark:bg-neutral-700 dark:border-neutral-600'
                      : isUnread
                        ? 'bg-orange-50/80 hover:bg-orange-100/80 dark:bg-neutral-900 dark:hover:bg-neutral-700'
                        : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
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
                        const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === e.platform);
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
      );
    }
    if (inboxMode === 'comments' && commentsSupportedPlatforms.length === 0) {
              return (
            <div className="p-6 text-center">
              <p className="text-sm text-neutral-500">Comments are available for Instagram, Facebook, X, YouTube, and LinkedIn. Select one or more platforms above.</p>
            </div>
              );
            }
    if (selectedPlatforms.length === 0) {
      return (
        <div className="p-6 text-center">
          <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-500">Click one or more platform icons above to view their inboxes.</p>
        </div>
      );
    }
    if (inboxMode === 'comments') {
      if (commentsLoading) {
        return (
          <div className="p-6 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="text-orange-500 animate-spin" />
            <p className="text-sm text-neutral-500">Loading comments…</p>
          </div>
        );
      }
      if (commentsError) {
        return (
          <div className="p-4 space-y-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-medium text-amber-900">Could not load comments</p>
              <p className="text-xs text-amber-700 mt-1">{commentsError}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCommentsRefreshKey((k) => k + 1)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700"
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
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
                >
                  Reconnect Instagram
                </button>
              )}
            </div>
          </div>
        );
      }
      if (comments.length === 0) {
        return (
          <div className="p-6 text-center">
            <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-500">No comments yet.</p>
            <p className="text-xs text-neutral-400 mt-1">Comments on your posts will appear here. Make sure to sync your posts first from the Dashboard.</p>
            <button
              type="button"
              onClick={() => setCommentsRefreshKey((k) => k + 1)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700"
            >
              <RefreshCw size={14} />
              Refresh comments
            </button>
          </div>
        );
      }
      return (
        <>
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
                .filter((c) => {
                  if (!searchQuery) return true;
                  const q = searchQuery.toLowerCase();
                  return (
                    (c.text ?? '').toLowerCase().includes(q) ||
                    (c.authorName ?? '').toLowerCase().includes(q)
                  );
                })
                .sort((a, b) => {
                  const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  if (timeDiff !== 0) return timeDiff;
                  // Tiebreaker: unread comments rise above read ones with the same timestamp
                  return (unreadCommentIds.has(b.commentId) ? 1 : 0) - (unreadCommentIds.has(a.commentId) ? 1 : 0);
                });
              return filtered.map((c) => {
                const isUnread = unreadCommentIds.has(c.commentId);
                const hasReplied = hasRepliedByParent.has(c.commentId);
                const isSelected = selectMode && selectedCommentIds.has(c.commentId);
                const account = effectiveAccounts.find((a) => a.platform === c.platform);
                const canDelete = account && (c.platform === 'INSTAGRAM' || c.platform === 'FACEBOOK' || c.platform === 'YOUTUBE' || c.platform === 'TWITTER');
                return (
                  <div
                    key={c.commentId}
                    role="button"
                    tabIndex={0}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        (e.currentTarget as HTMLDivElement).click();
                      }
                    }}
                    className={`w-full px-3 py-3 text-left transition-colors flex items-center gap-2 cursor-pointer ${
                      isSelected ? 'sidebar-item-selected border-l-2 border-l-slate-400 dark:bg-neutral-700' :
                      selectedComment?.commentId === c.commentId
                        ? 'sidebar-item-selected border-l-2 border-l-slate-400 dark:bg-neutral-700'
                        : isUnread
                          ? 'bg-orange-50/80 hover:bg-orange-100/80 dark:bg-neutral-900 dark:hover:bg-neutral-700'
                          : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
                    }`}
                  >
                    {selectMode ? (
                      <div className={`w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 ${isSelected ? 'bg-[var(--button)] border-[var(--button)]' : 'border-neutral-300'}`}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-400 flex items-center gap-1 mb-1">
                        {(() => {
                          const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === c.platform);
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
                    {canDelete && (
                      <button
                        type="button"
                        disabled={deletingCommentId !== null}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!account) return;
                          setDeletingCommentId(c.commentId);
                          setReplySendError(null);
                          (async () => {
                            try {
                              await api.post(`/social/accounts/${account.id}/comments/delete`, { commentId: c.commentId });
                              setComments((prev) => prev.filter((x) => x.commentId !== c.commentId));
                              if (selectedComment?.commentId === c.commentId) {
                                setSelectedComment(null);
                                setReplyText('');
                              }
                            } catch (err: unknown) {
                              const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                              setReplySendError(msg ?? 'Failed to delete comment.');
                            } finally {
                              setDeletingCommentId(null);
                            }
                          })();
                        }}
                        className="shrink-0 p-1.5 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
                        title="Delete comment"
                      >
                        {deletingCommentId === c.commentId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    )}
                    {hasReplied && (
                      <span className="shrink-0 flex items-center gap-0.5 text-xs text-emerald-600 font-medium" title="You replied">
                        <Check size={12} />
                        Replied
                      </span>
                    )}
                    {isUnread && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-red-500" aria-hidden />
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </>
      );
    }
    if (conversationsLoading && conversations.length === 0) {
      return (
        <div className="p-6 flex flex-col items-center justify-center gap-3">
          <Loader2 size={32} className="text-orange-500 animate-spin" />
          <p className="text-sm text-neutral-500">Loading conversations…</p>
        </div>
      );
    }
    if (conversationsError && conversations.length === 0) {
      const isTimeout = /Request timed out|timeout/i.test(conversationsError);
      const isAuthError = /401|Reconnect|access token|expired|permission/i.test(conversationsError);
      return (
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
              {isTimeout && (
                <button
                  type="button"
                  onClick={() => {
                    appData?.invalidateConversations?.();
                    for (const a of effectiveAccounts) {
                      if (a.platform === 'TWITTER') pendingManualInboxByAccountRef.current.add(a.id);
                    }
                    setConversationsRefreshKey((k) => k + 1);
                    setConversationsLoading(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-[var(--button)] text-white text-sm font-medium hover:bg-[var(--button-hover)] inline-flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} />
                  Try again
                </button>
              )}
              {(isAuthError || !isTimeout) && (
                <>
                  {messageFetchPlatformIds.includes('INSTAGRAM') && effectiveAccounts.some((a) => a.platform === 'INSTAGRAM') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/INSTAGRAM/start?method=instagram');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
                    >
                      Reconnect Instagram
                    </button>
                  )}
                  {messageFetchPlatformIds.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/facebook/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700"
                    >
                      Reconnect Facebook
                    </button>
                  )}
                </>
              )}
              {isTimeout && (
                <>
                  <p className="text-xs text-red-700 mt-1">If it still fails after trying again, reconnect and choose your Page:</p>
                  {messageFetchPlatformIds.includes('INSTAGRAM') && effectiveAccounts.some((a) => a.platform === 'INSTAGRAM') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/INSTAGRAM/start?method=instagram');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-3 py-1.5 rounded-lg border border-orange-300 bg-white text-orange-700 text-sm font-medium hover:bg-orange-50"
                    >
                      Reconnect Instagram
                    </button>
                  )}
                  {messageFetchPlatformIds.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/facebook/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') window.location.href = url;
                        } catch (_) {}
                      }}
                      className="px-3 py-1.5 rounded-lg border border-orange-300 bg-white text-orange-700 text-sm font-medium hover:bg-orange-50"
                    >
                      Reconnect Facebook
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    }
    if (conversations.length === 0) {
      const dmNotInApp =
        selectedPlatform === 'LINKEDIN' ||
        selectedPlatform === 'PINTEREST' ||
        messageFetchPlatformIds.every((p) => !DM_THREAD_PLATFORM_IDS.has(p));
      return (
        <div className="p-6 text-center">
          <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
          {dmNotInApp ? (
            <>
              <p className="text-sm font-medium text-neutral-800">LinkedIn and Pinterest DMs are not in this app</p>
              <p className="text-xs text-neutral-500 mt-2 max-w-sm mx-auto">
                Your LinkedIn inbox on linkedin.com will not sync here. LinkedIn does not expose member messaging to our integration. Use Instagram, Facebook, or X for Messages, or open the Comments tab to read and reply to comments on your LinkedIn posts.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-500">No conversations yet.</p>
              <p className="text-xs text-neutral-400 mt-1">Messages will appear here when you receive them.</p>
            </>
          )}
          {!dmNotInApp && (
            <button
              type="button"
              onClick={() => {
                appData?.invalidateConversations?.();
                for (const a of effectiveAccounts) {
                  if (a.platform === 'TWITTER') pendingManualInboxByAccountRef.current.add(a.id);
                }
                setConversationsRefreshKey((k) => k + 1);
                setConversationsLoading(true);
              }}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-sm font-medium text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-700"
            >
              <RefreshCw size={16} />
              Refresh conversations
            </button>
          )}
          {!dmNotInApp && messageFetchPlatformIds.includes('INSTAGRAM') && (
            <p className="text-xs text-amber-700 mt-3 max-w-sm mx-auto bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              If you see Instagram DMs in Metricool but not here, Meta is only granting inbox access to apps with <strong>Advanced Access</strong>. Complete App Review for instagram_manage_messages to enable it in A4S.
            </p>
          )}
        </div>
      );
    }
    return (
      <>
        {conversationsError && conversations.length > 0 && (
          <div className="p-3 border-b border-amber-200 bg-amber-50 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-900">
              {/timeout|timed out/i.test(conversationsError)
                ? 'One platform is still loading or responded slowly. You can retry or use the conversations below.'
                : `One platform could not load: ${conversationsError}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  appData?.invalidateConversations?.();
                  for (const a of effectiveAccounts) {
                    if (a.platform === 'TWITTER') pendingManualInboxByAccountRef.current.add(a.id);
                  }
                  setConversationsRefreshKey((k) => k + 1);
                }}
                className="text-xs px-2 py-1 rounded bg-amber-200 text-amber-900 font-medium hover:bg-amber-300"
              >
                Retry
              </button>
              {/Reconnect|Facebook|permission|expired/i.test(conversationsError) && messageFetchPlatformIds.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get('/social/oauth/facebook/start');
                      const url = res?.data?.url;
                      if (url && typeof url === 'string') window.location.href = url;
                    } catch (_) {}
                  }}
                  className="text-xs px-2 py-1 rounded bg-orange-600 text-white font-medium hover:bg-orange-700"
                >
                  Reconnect Facebook
                </button>
              )}
            </div>
          </div>
        )}
        <MessagesConversationList
          conversations={conversations}
          inboxFilter={inboxFilter}
          searchQuery={searchQuery}
          messageInboxPlatformIds={messageFetchPlatformIds}
          selectMode={selectMode}
          selectedConversationIds={selectedConversationIds}
          selectedConversationId={selectedConversationId}
          unreadConversationIds={unreadConversationIds}
          setSelectedPlatform={setSelectedPlatform}
          setSelectedConversationId={setSelectedConversationId}
          setSelectedConversationIds={setSelectedConversationIds}
          setUnreadConversationIds={setUnreadConversationIds}
          markConversationsAsRead={markConversationsAsRead}
          setTotalUnreadMessages={setTotalUnreadMessages}
          getConversationLastReadCounts={getConversationLastReadCounts}
          setConversationLastReadCount={setConversationLastReadCount}
          user={user}
        />
      </>
    );
  };

  return (
    <div className="relative flex h-[calc(100vh-3.5rem-3rem)] md:h-[calc(100vh-3.5rem-4rem)] bg-white dark:bg-neutral-950 flex-col md:flex-row">
      <LoadingVideoOverlay contained loading={conversationsLoading && conversations.length === 0} />
      {/* Left column: platform filters, search, list */}
      <div className="w-full md:w-80 border-r border-neutral-200 dark:border-neutral-800 flex flex-col shrink-0 bg-white dark:bg-neutral-950">
        {/* Platform icons + Connect */}
        <div className="p-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {platformsToShow.map((p) => {
              const Icon = p.icon;
              const isSelected = selectedPlatforms.includes(p.id);
              // For messages: prefer locally-tracked unread count; fall back to total
              // conversations loaded for this platform (always available, no API needed).
              // For comments: use unread count; fall back to API byPlatform.comments.
              const localUnread = inboxMode === 'messages'
                ? (unreadMessagesByPlatform[p.id] ?? 0)
                : (unreadCommentsByPlatform[p.id] ?? 0);
              const fallbackCount = inboxMode === 'messages'
                ? (convCountByPlatform[p.id] ?? byPlatform[p.id]?.messages ?? 0)
                : (byPlatform[p.id]?.comments ?? 0);
              const displayCount = localUnread > 0 ? localUnread : fallbackCount;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlatformClick(p.id);
                  }}
                  className={`relative w-10 h-10 rounded-lg flex items-center justify-center border cursor-pointer focus:outline-none select-none ${
                    isSelected ? 'bg-neutral-300 border-neutral-400 dark:bg-neutral-600 dark:border-neutral-500' : 'bg-white border-neutral-200 hover:bg-neutral-100 dark:bg-neutral-800 dark:border-neutral-700 dark:hover:bg-neutral-700'
                  }`}
                  title={isSelected ? `Hide ${p.label}` : `Show ${p.label}${displayCount > 0 ? ` (${displayCount})` : ''}`}
                >
                  <Icon size={22} className={'color' in p ? p.color : undefined} />
                  {displayCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
                      {displayCount > 99 ? '99' : displayCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder={inboxMode === 'comments' ? 'Search comments...' : 'Search conversation...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </div>

        {/* Messages / Comments */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => { setInboxMode('messages'); setSelectedComment(null); setSelectMode(false); setSelectedConversationIds(new Set()); setSelectedCommentIds(new Set()); }}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-t-lg mx-0.5 mt-0.5 ${
              inboxMode === 'messages'
                ? 'text-orange-900 bg-white border border-b-0 border-orange-200 shadow-sm dark:text-orange-200 dark:bg-neutral-800 dark:border-neutral-700'
                : 'text-neutral-500 border border-transparent hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-100 dark:hover:bg-neutral-700'
            }`}
          >
            Messages
            {(() => {
              const localMsg = totalUnreadMessages > 0 ? totalUnreadMessages : unreadConversationIds.size;
              // Fall back to total loaded conversations for selected platforms — always reliable.
              const loadedMsg = selectedPlatforms.reduce((s, p) => s + (convCountByPlatform[p] ?? 0), 0);
              const apiMsg = effectiveNotifications.messages;
              const msgBadge = localMsg > 0 ? localMsg : (loadedMsg > 0 ? loadedMsg : apiMsg);
              return msgBadge > 0 ? (
                <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                  {msgBadge > 99 ? '99' : msgBadge}
                </span>
              ) : null;
            })()}
          </button>
          <button
            type="button"
            onClick={() => { setInboxMode('comments'); setSelectedConversationId(null); setSelectMode(false); setSelectedConversationIds(new Set()); setSelectedCommentIds(new Set()); }}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 transition-colors rounded-t-lg mx-0.5 mt-0.5 ${
              inboxMode === 'comments'
                ? 'text-orange-900 bg-white border border-b-0 border-orange-200 shadow-sm dark:text-orange-200 dark:bg-neutral-800 dark:border-neutral-700'
                : 'text-neutral-500 border border-transparent hover:text-neutral-800 hover:bg-neutral-100 dark:hover:text-neutral-100 dark:hover:bg-neutral-700'
            }`}
          >
            Comments
            {(() => {
              const localCmt = unreadCommentIds.size;
              const apiCmt = effectiveNotifications.comments;
              const cmtBadge = localCmt > 0 ? localCmt : apiCmt;
              return cmtBadge > 0 ? (
                <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                  {cmtBadge > 99 ? '99' : cmtBadge}
                </span>
              ) : null;
            })()}
          </button>
        </div>

        {inboxMode === 'messages' && (
          <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex">
          <button
            type="button"
            onClick={() => setInboxFilter('all')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'all' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setInboxFilter('read')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'read' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
          >
            Read
          </button>
          <button
            type="button"
            onClick={() => setInboxFilter('unread')}
            className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'unread' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
          >
            Unread
          </button>
        </div>
            {/* Select toolbar: select conversations then mark as read */}
            <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50/70 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${selectMode ? 'bg-orange-100 text-orange-700' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
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
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
                    >
                      <Check size={12} />
                      Mark {selectedConversationIds.size} as read
                    </button>
                  )}
                  {unreadConversationIds.size > 0 && selectedConversationIds.size === 0 && (
                    <button
                      type="button"
                      onClick={markAllAsRead}
                      className="ml-auto text-xs text-orange-600 hover:text-orange-800 underline"
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
          <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800">
            <div className="flex border-b border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => setCommentsFilter('all')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'all' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setCommentsFilter('replied')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'replied' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
              >
                Replied
              </button>
              <button
                type="button"
                onClick={() => setCommentsFilter('didnt_reply')}
                className={`flex-1 py-2 text-xs font-medium ${commentsFilter === 'didnt_reply' ? 'text-neutral-900 border-b-2 border-neutral-900 dark:text-neutral-100 dark:border-neutral-100' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700 dark:hover:text-neutral-100'}`}
              >
                Didn&apos;t reply
              </button>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 bg-neutral-50/70 dark:bg-neutral-900 border-t border-neutral-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={toggleSelectMode}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${selectMode ? 'bg-orange-100 text-orange-700' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-100'}`}
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
                      className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-white dark:hover:bg-neutral-700"
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
                      className="ml-auto text-xs text-orange-600 hover:text-orange-800 underline"
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
          {renderSidebarList()}
        </div>
      </div>

      {/* Main content - conversation or comment reply */}
      <div className="flex-1 flex flex-col min-w-0 bg-[var(--background)] min-h-0">
        {!selectedPlatform ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={64} className="mx-auto text-neutral-300 mb-4" />
              <h2 className="text-lg font-semibold text-neutral-800">Open an inbox</h2>
              <p className="text-sm text-neutral-500 mt-2">
                Choose platforms above. Messages work for Instagram, Facebook, and X. Comments can include YouTube, LinkedIn, and more.
              </p>
            </div>
          </div>
        ) : inboxMode === 'messages' && selectedPlatform && !DM_THREAD_PLATFORM_IDS.has(selectedPlatform) ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={64} className="mx-auto text-neutral-300 mb-4" />
              <h2 className="text-lg font-semibold text-neutral-800">Direct messages</h2>
              <p className="text-sm text-neutral-500 mt-2">
                {selectedPlatform === 'PINTEREST' || selectedPlatform === 'LINKEDIN'
                  ? 'Pinterest and LinkedIn direct messages are not available in this app. Use Instagram, Facebook, or X (Twitter) for DMs, or open the Comments tab for this platform.'
                  : 'Open a conversation from the list for Instagram, Facebook, or X (Twitter).'}
              </p>
            </div>
          </div>
        ) : inboxMode === 'comments' && selectMode && selectedCommentIds.size > 0 ? (
          /* Batch reply to selected comments: show each in a card + Generate with AI */
          (() => {
            const selectedComments = comments.filter((c) => !c.parentCommentId && selectedCommentIds.has(c.commentId));
            const canReplyPlatforms = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'YOUTUBE', 'LINKEDIN']);
            const replyable = selectedComments.filter((c) => {
              if (!canReplyPlatforms.has(c.platform)) return false;
              if (c.platform === 'LINKEDIN' && !(c.linkedInObjectUrn && c.commentId.startsWith('urn:li:comment:'))) {
                return false;
              }
              return true;
            });
            return (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="p-4 border-b border-neutral-200 bg-white">
                  <h2 className="text-lg font-semibold text-neutral-900">Reply to {selectedComments.length} comment{selectedComments.length !== 1 ? 's' : ''}</h2>
                  {replyable.length < selectedComments.length && (
                    <p className="text-sm text-amber-700 mt-1">Only Instagram, Facebook, X (Twitter), and YouTube comments can be replied to from the app. Others will be skipped.</p>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Selected comments</p>
                  <div className="space-y-3">
                    {selectedComments.map((c) => {
                      const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === c.platform);
                      const Icon = plat?.icon;
                      return (
                        <div key={c.commentId} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
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
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 border border-orange-200 text-sm font-medium"
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
                      className="w-full px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none bg-white dark:bg-neutral-800 dark:text-neutral-100"
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
                            await api.post(`/social/accounts/${account.id}/comments/reply`, {
                              commentId: c.commentId,
                              message: msg,
                              ...(c.platform === 'LINKEDIN' && c.linkedInObjectUrn
                                ? { linkedInObjectUrn: c.linkedInObjectUrn }
                                : {}),
                            });
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
                      className="mt-3 px-4 py-2.5 rounded-xl bg-[var(--button)] text-white text-sm font-medium hover:bg-[var(--button-hover)] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
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
          messageFetchPlatformIds.some((p) => DM_THREAD_PLATFORM_IDS.has(p)) ? (
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
                      const platform = c.platform ?? selectedPlatform;
                      const accountForConv =
                        c.messageAccountId
                          ? effectiveAccounts.find((a) => a.id === c.messageAccountId)
                          : platform && DM_THREAD_PLATFORM_IDS.has(platform)
                            ? effectiveAccounts.find((a) => a.platform === platform)
                            : null;
                      const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === platform);
                      const Icon = plat?.icon;
                      const value = batchDmTexts[c.id] ?? '';
                      return (
                        <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden flex items-center justify-center">
                              {pictureUrl ? (
                                <img src={proxyImageUrl(pictureUrl) || pictureUrl} alt="" className="w-full h-full object-cover" />
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
                                      platform: platform ?? selectedPlatform ?? undefined,
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
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-40 border border-orange-200 text-xs font-medium"
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
                              className="w-full px-3 py-2 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                            />
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                disabled={dmReplySending || !value.trim() || !accountForConv}
                                onClick={async () => {
                                  const text = value.trim();
                                  if (!text || !accountForConv) return;
                                  setDmReplySending(true);
                                  setDmSendError(null);
                                  try {
                                    await api.post(`/social/accounts/${accountForConv.id}/conversations/${c.id}/messages`, { text });
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
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[var(--button)] text-white text-xs font-medium hover:bg-[var(--button-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                          const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === selectedComment.platform);
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
                            className="inline-flex items-center gap-1 text-xs text-orange-500 hover:text-orange-700 hover:underline"
                          >
                            <ExternalLink size={10} />
                            Open in {INBOX_PLATFORM_DEFS.find((p) => p.id === selectedComment.platform)?.label ?? selectedComment.platform.charAt(0) + selectedComment.platform.slice(1).toLowerCase()}
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
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Comment</p>
                        <p className="text-sm text-neutral-800 mt-1">{selectedComment.text}</p>
                      </div>
                      <button
                        type="button"
                        disabled={deleteCommentLoading || deletingCommentId !== null}
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const account = effectiveAccounts.find((a) => a.platform === selectedComment.platform);
                          if (!account || !selectedComment) return;
                          setDeletingCommentId(selectedComment.commentId);
                          setReplySendError(null);
                          try {
                            await api.post(`/social/accounts/${account.id}/comments/delete`, { commentId: selectedComment.commentId });
                            setComments((prev) => prev.filter((c) => c.commentId !== selectedComment.commentId));
                            setSelectedComment(null);
                            setReplyText('');
                          } catch (err: unknown) {
                            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                            setReplySendError(msg ?? 'Failed to delete comment.');
                          } finally {
                            setDeletingCommentId(null);
                          }
                        }}
                        className="shrink-0 p-1.5 rounded-md text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete comment"
                      >
                        {deletingCommentId === selectedComment.commentId ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                      </button>
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
                              const account = effectiveAccounts.find((a) => a.platform === r.platform);
                              const canDeleteReply = account && (r.platform === 'INSTAGRAM' || r.platform === 'FACEBOOK' || r.platform === 'YOUTUBE' || r.platform === 'TWITTER');
                              return (
                              <div key={r.commentId} className="flex gap-2 rounded-lg bg-neutral-50 p-2 items-start">
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
                                {canDeleteReply && (
                                  <button
                                    type="button"
                                    disabled={deletingCommentId !== null}
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      if (!account) return;
                                      setDeletingCommentId(r.commentId);
                                      setReplySendError(null);
                                      try {
                                        await api.post(`/social/accounts/${account.id}/comments/delete`, { commentId: r.commentId });
                                        setComments((prev) => prev.filter((c) => c.commentId !== r.commentId));
                                      } catch (err: unknown) {
                                        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                                        setReplySendError(msg ?? 'Failed to delete reply.');
                                      } finally {
                                        setDeletingCommentId(null);
                                      }
                                    }}
                                    className="shrink-0 p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
                                    title="Delete reply"
                                  >
                                    {deletingCommentId === r.commentId ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                  </button>
                                )}
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
            <div className="border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shrink-0 pb-6">
              <div className="max-w-2xl mx-auto">
                {aiReplyError && (
                  <p className="text-sm text-amber-700 mb-2">{aiReplyError}</p>
                )}
                {selectedComment.platform !== 'INSTAGRAM' &&
                selectedComment.platform !== 'FACEBOOK' &&
                selectedComment.platform !== 'YOUTUBE' &&
                selectedComment.platform !== 'TWITTER' &&
                selectedComment.platform !== 'LINKEDIN' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-medium">Reply from the app is available for Instagram, Facebook, YouTube, X (Twitter), and LinkedIn.</p>
                    <p className="mt-1 text-xs text-amber-700">For other platforms, reply on the platform.</p>
                  </div>
                ) : selectedComment.platform === 'LINKEDIN' &&
                  (!selectedComment.linkedInObjectUrn || !selectedComment.commentId.startsWith('urn:li:comment:')) ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-medium">Refresh comments to reply on LinkedIn.</p>
                    <p className="mt-1 text-xs text-amber-700">
                      Close this thread and open the Comments tab again so thread metadata loads. You need Community Management
                      scopes (e.g. w_organization_social / w_member_social) for replies.
                    </p>
                  </div>
                ) : (
                <>
                <div className="flex items-end gap-2">
                  <textarea
                    placeholder="Type your reply..."
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
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
                        setAiReplyError(msg ?? 'Could not generate reply. Check that OPENAI_API_KEY is set.');
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="p-3 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 border border-neutral-200"
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
                        ...(selectedComment.platform === 'LINKEDIN' && selectedComment.linkedInObjectUrn
                          ? { linkedInObjectUrn: selectedComment.linkedInObjectUrn }
                          : {}),
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
                  className="p-3 rounded-xl bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                </>
                )}
              </div>
            </div>
          </>
        ) : inboxMode === 'comments' ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={48} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-600">Select a comment from the list to reply</p>
              <p className="text-xs text-neutral-400 mt-1">{INBOX_PLATFORM_DEFS.find((p) => p.id === selectedPlatform)?.label} comments</p>
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
                      const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === selectedPlatform);
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
                        const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === selectedEngagement.platform);
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
                        className="inline-block mt-3 text-sm text-orange-600 hover:text-orange-700"
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
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 min-h-0">
                <div className="max-w-2xl mx-auto h-full flex flex-col min-h-0">
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 shrink-0">
                      {(() => {
                        const selectedConv = conversations.find((c) => c.id === selectedConversationId);
                        const cached = selectedConversationId ? conversationMessagesCache[selectedConversationId] : undefined;
                        const recipientNameFromCache = cached?.recipientName;
                        const recipientPic =
                          cached?.recipientPictureUrl || selectedConv?.senders?.[0]?.pictureUrl || null;
                        const senderNames = selectedConv?.senders?.map((s) => s.username ?? s.name).filter(Boolean).join(', ') || null;
                        const displayName =
                          senderNames || recipientNameFromCache || null;
                        const chatWithLabel = displayName
                          ? `Chat with ${displayName}`
                          : dmThreadPlatform === 'TWITTER'
                            ? 'Chat with X (Twitter) user'
                            : 'Conversation';
                        const stripPlat = dmThreadPlatform ?? selectedPlatform;
                        return (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden flex items-center justify-center">
                              {recipientPic ? (
                                <img src={proxyImageUrl(recipientPic) || recipientPic} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-sm font-semibold text-neutral-600">
                                  {(displayName || (dmThreadPlatform === 'TWITTER' ? 'X' : '?')).slice(0, 2).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-neutral-800">{chatWithLabel}</p>
                              <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5">
                                {stripPlat && (() => {
                                  const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === stripPlat);
                                  const Icon = plat?.icon;
                                  return (
                                    <span className="inline-flex items-center gap-1 font-medium text-neutral-600">
                                      {Icon && <Icon size={14} />}
                                      {plat?.label ?? stripPlat} inbox
                                    </span>
                                  );
                                })()}
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="p-6 flex-1 min-h-0 overflow-y-auto">
                    {conversationMessagesLoading ? (
                      <div className="flex flex-col items-center justify-center min-h-[12rem] py-12">
                        <Loader2 size={36} className="text-orange-500 animate-spin" aria-hidden />
                        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">Loading messages…</p>
                      </div>
                    ) : conversationMessagesError ? (
                      <p className="text-sm text-amber-700">{conversationMessagesError}</p>
                    ) : conversationMessages.length === 0 ? (
                      <p className="text-sm text-neutral-500 italic">No messages in this conversation yet.</p>
                    ) : (
                      <>
                        <div className="space-y-4">
                        {conversationMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.isFromPage ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                msg.isFromPage
                                  ? 'bg-neutral-100 text-neutral-900 rounded-br-md dark:bg-neutral-700 dark:text-white'
                                  : 'bg-neutral-100 text-neutral-900 rounded-bl-md dark:bg-neutral-800 dark:text-neutral-100'
                              }`}
                            >
                              {!msg.isFromPage && (
                                <p className="text-xs font-medium text-neutral-500 mb-0.5">
                                  {msg.fromName || (dmThreadPlatform === 'TWITTER' ? 'X (Twitter) user' : 'Unknown')}
                                </p>
                              )}
                              <p className="text-sm whitespace-pre-wrap break-words">{msg.message || '—'}</p>
                              {msg.createdTime && (
                                <p className={`text-xs mt-1 ${msg.isFromPage ? 'text-neutral-400' : 'text-neutral-400'}`}>
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
            </div>
            <div className="border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 shrink-0">
              <div className="max-w-2xl mx-auto">
                {dmThreadPlatform === 'TWITTER' && !conversationRecipientId && currentAccountForDmThread && (
                  <div className="mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50">
                    <p className="text-sm font-medium text-amber-900 mb-2">Recipient not detected. Enter their X username to send messages:</p>
                    <div className="flex gap-2 items-center flex-wrap">
                      <span className="text-neutral-600 text-sm">@</span>
                      <input
                        type="text"
                        placeholder="username"
                        value={dmRecipientUsername}
                        onChange={(e) => { setDmRecipientUsername(e.target.value.replace(/^@/, '').trim()); setDmRecipientLookupError(null); }}
                        className="flex-1 min-w-[120px] px-3 py-2 border border-neutral-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      />
                      <button
                        type="button"
                        disabled={dmRecipientLookupLoading || !dmRecipientUsername.trim()}
                        onClick={async () => {
                          const account = currentAccountForDmThread;
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
                              const cid = selectedConversationId;
                              setConversationMessagesCache((prev) =>
                                withCacheEntry(prev, cid, {
                                  messages: prev[cid]?.messages ?? [],
                                  recipientId: res.data.id,
                                  recipientName: res.data.name ?? res.data.username ?? null,
                                  recipientPictureUrl: res.data.profile_image_url ?? null,
                                  error: prev[cid]?.error ?? null,
                                  accountId: account.id,
                                })
                              );
                            }
                            setDmRecipientUsername('');
                          } catch (e: unknown) {
                            const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'User not found';
                            setDmRecipientLookupError(msg);
                          } finally {
                            setDmRecipientLookupLoading(false);
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-[var(--button)] text-white text-sm font-medium hover:bg-[var(--button-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
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
                {dmSendBlockedReason && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <span className="shrink-0 mt-0.5">&#x26a0;</span>
                    <span>{dmSendBlockedReason}</span>
                  </div>
                )}
                <div className="flex items-end gap-2">
                <textarea
                  placeholder="Type a reply..."
                  rows={2}
                    value={dmReplyText}
                    onChange={(e) => setDmReplyText(e.target.value)}
                    disabled={dmReplySending}
                    className="flex-1 px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-neutral-800 dark:text-neutral-100"
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
                          platform: dmThreadPlatform ?? selectedPlatform ?? undefined,
                        });
                        const reply = res.data?.reply?.trim();
                        if (reply) setDmReplyText(reply);
                        else setAiReplyError('No reply generated. Try again.');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiReplyError(msg ?? 'Could not generate reply. Check that OPENAI_API_KEY is set.');
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="p-3 rounded-xl bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed shrink-0 border border-neutral-200"
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
                  disabled={dmReplySending || !dmReplyText.trim() || !!dmSendBlockedReason}
                  onClick={async () => {
                    const account = currentAccountForDmThread;
                    if (dmSendBlockedReason) {
                      setDmSendError(dmSendBlockedReason);
                      return;
                    }
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
                      const cid2 = selectedConversationId;
                      setConversationMessagesCache((prev) =>
                        withCacheEntry(prev, cid2, {
                          messages,
                          recipientId: nextRecipientId,
                          recipientName: res.data?.recipientName ?? prev[cid2]?.recipientName ?? null,
                          recipientPictureUrl: res.data?.recipientPictureUrl ?? prev[cid2]?.recipientPictureUrl ?? null,
                          error: res.data?.error ?? null,
                          accountId: account.id,
                        })
                      );
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
                  className="p-3 rounded-xl bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-700 dark:text-white dark:hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                    <div className="rounded-lg border border-orange-200 bg-orange-50/80 px-3 py-2.5 text-xs text-orange-900">
                      <p className="font-semibold mb-1.5">How to fix this</p>
                      <ol className="list-decimal list-inside space-y-1 text-orange-800">
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
  return <InboxPage />;
}
