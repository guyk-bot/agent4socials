'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
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
import { openOAuthConnectUrl } from '@/lib/oauth-connect';
import {
  readApiErrorMessage,
  AI_REPLY_FAILED_MESSAGE,
  AI_REPLY_NOT_CONFIGURED_MESSAGE,
} from '@/lib/api-error-message';
import { INBOX_SYSTEM_SYNC_MS } from '@/lib/inbox/inbox-sync-config';
import {
  markInboxAccountRecentlyConnected,
  isInboxAccountRecentlyConnected,
  clearInboxAccountRecentlyConnected,
} from '@/lib/inbox/inbox-recent-connect';
import {
  isMetaMessagingWindowClosed,
  META_MESSAGING_WINDOW_BLOCKED_MESSAGE,
} from '@/lib/inbox/meta-messaging-window';
import { useAuth } from '@/context/AuthContext';
import { readBrandContextCache, writeBrandContextCache } from '@/lib/brand-context-utils';
import {
  getReadCommentIds,
  getReadConversationIds,
  getReadEngagementIds,
  getConversationLastReadCounts,
  setConversationLastReadCount,
  setConversationLastSeenUpdated,
  getConversationLastSeenUpdated,
  markCommentsAsRead,
  markConversationsAsRead,
  markEngagementAsRead,
  INBOX_READ_STATE_CHANGED_EVENT,
  getInboxInitializedAccountIds,
  addInboxInitializedAccount,
  getInboxInitializedAccountIdsForConversations,
} from '@/lib/inbox-read-state';
import {
  getInboxSenderPicture,
  mergeSenderPicturesIntoConversations,
  getInboxSenderStoredMeta,
  setInboxSenderPicture,
} from '@/lib/inbox/inbox-sender-pictures';
import {
  getPendingUnreadCommentIds,
  getPendingUnreadConversationIds,
  removePendingUnreadConversationIds,
} from '@/lib/inbox/inbox-badge-pending';
import {
  isConversationUnread,
  reconcileInboxReadStateWithConversations,
  syncInboxNavBadgeWithLoadedLists,
} from '@/lib/inbox/unread-count';
import {
  mergeInboxCommentsWithUnreadDetection,
  mergeInboxConversationsWithUnreadDetection,
} from '@/lib/inbox/merge-inbox-unread';
import {
  readInboxCommentsClientCache,
  writeInboxCommentsClientCache,
  readInboxConversationsClientCache,
  writeInboxConversationsClientCache,
} from '@/lib/inbox/inbox-client-cache';
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
  ThreadsIcon,
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
  { id: 'THREADS', label: 'Threads', icon: ThreadsIcon },
] as const;

const MESSAGE_STRIP_PLATFORM_IDS = new Set<string>(
  INBOX_PLATFORM_DEFS.filter(
    (p) =>
      p.id !== 'YOUTUBE' &&
      p.id !== 'TIKTOK' &&
      p.id !== 'LINKEDIN' &&
      p.id !== 'PINTEREST' &&
      p.id !== 'THREADS'
  ).map((p) => p.id)
);
const COMMENT_STRIP_PLATFORM_IDS = new Set<string>(INBOX_PLATFORM_DEFS.map((p) => p.id));
/** Platforms where we can open a DM thread (Meta + X). */
const DM_THREAD_PLATFORM_IDS = new Set<string>(['INSTAGRAM', 'FACEBOOK', 'TWITTER']);

function PlatformSourcePill({
  platformId,
  size = 'sm',
}: {
  platformId?: string | null;
  size?: 'sm' | 'md';
}) {
  if (!platformId) return null;
  const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === platformId);
  if (!plat) return null;
  const Icon = plat.icon;
  const textCls = size === 'md' ? 'text-xs' : 'text-[10px]';
  const iconSize = size === 'md' ? 13 : 11;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-800 px-2 py-0.5 ${textCls} font-semibold text-neutral-700 dark:text-neutral-200 shrink-0`}
    >
      {Icon && <Icon size={iconSize} className="shrink-0" />}
      {plat.label}
    </span>
  );
}

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
type InboxMessageMedia = {
  kind: 'image' | 'video' | 'audio' | 'file' | 'sticker' | 'share' | 'story';
  url?: string | null;
  title?: string | null;
};

type InboxMessageReaction = {
  reaction: string;
  username?: string | null;
};

type ConversationMessage = {
  id: string;
  fromId: string | null;
  fromName: string | null;
  message: string;
  createdTime: string | null;
  isFromPage: boolean;
  media?: InboxMessageMedia[];
  reactions?: InboxMessageReaction[];
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
/** Keep up to 150 conversations in localStorage (covers multi-platform inbox lists). */
const INBOX_MESSAGES_CACHE_MAX_ENTRIES = 150;
/** Prefetch/warm this many threads in the browser (newest first). */
const INBOX_CLIENT_PREFETCH_MAX = 150;
/** While Inbox is open, refresh conversation list and open thread about every 90s. */
/** How long open-thread client message cache stays fresh (background sync handles list data). */
const INBOX_THREAD_CACHE_MS = INBOX_SYSTEM_SYNC_MS;
/** X DM threads change less often; longer client cache avoids repeated api.x.com calls. */
const INBOX_TWITTER_CACHE_MS = 10 * 60_000;
const INBOX_TWITTER_BACKGROUND_REFRESH_MS = 30 * 60_000;
const INBOX_TWITTER_BACKGROUND_MAX = 2;
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
  convUpdatedTime?: string | null,
  platform?: string | null,
  conv?: Conversation & { senders?: Array<{ name?: string; username?: string; pictureUrl?: string | null }> }
): boolean {
  if (!isConvCacheUsable(cached, accountId)) return false;
  if (conv && convNeedsProfileData(conv)) return false;
  if (cached && !cached.recipientPictureUrl && platform !== 'TWITTER') return false;
  if (!cached!._ts) return true; // legacy: no timestamp = assume fresh
  const maxAge = platform === 'TWITTER' ? INBOX_TWITTER_CACHE_MS : INBOX_THREAD_CACHE_MS;
  if (Date.now() - cached!._ts > maxAge) return false;
  if (convUpdatedTime) {
    const convMs = Date.parse(convUpdatedTime);
    if (Number.isFinite(convMs) && convMs > cached!._ts) return false;
  }
  return true;
}

function convNeedsProfileData(
  conv: Conversation & { senders?: Array<{ name?: string; username?: string; pictureUrl?: string | null }> }
): boolean {
  const s = conv.senders?.[0];
  if (!s) return true;
  const hasName = !!(s.name?.trim() || s.username?.trim());
  return !hasName || !s.pictureUrl;
}

function patchConversationSenderPicture(
  convId: string,
  pictureUrl: string | null | undefined,
  name?: string | null,
  username?: string | null
): (prev: Array<Conversation & { platform?: string }>) => Array<Conversation & { platform?: string }> {
  if (!pictureUrl && !name) return (prev) => prev;
  return (prev) =>
    prev.map((c) => {
      if (c.id !== convId) return c;
      const senders = c.senders ?? [];
      if (senders.length === 0) {
        return {
          ...c,
          senders: [
            {
              pictureUrl: pictureUrl ?? null,
              name: name ?? undefined,
              username: username ?? undefined,
            },
          ],
        };
      }
      return {
        ...c,
        senders: [
          {
            ...senders[0],
            pictureUrl: pictureUrl ?? senders[0].pictureUrl,
            name: name ?? senders[0].name,
            username: username ?? senders[0].username,
          },
          ...senders.slice(1),
        ],
      };
    });
}

/** Best recipient id for send (avoids slow server-side Meta lookups). */
function resolveDmRecipientIdForSend(
  conversationId: string,
  conversations: Conversation[],
  recipientFromState: string | null,
  cache: Record<string, ConvCache>
): string | undefined {
  if (recipientFromState?.trim()) return recipientFromState.trim();
  const fromCache = cache[conversationId]?.recipientId;
  if (fromCache?.trim()) return fromCache.trim();
  const conv = conversations.find((c) => c.id === conversationId);
  const fromConv = conv?.senders?.[0]?.id;
  if (fromConv?.trim()) return fromConv.trim();
  for (const m of cache[conversationId]?.messages ?? []) {
    if (!m.isFromPage && m.fromId) return m.fromId;
  }
  return undefined;
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

/** Outgoing inbox bubbles (DMs and replies you sent). */
const INBOX_SENT_BUBBLE_CLASS =
  'inbox-sent-bubble bg-[rgba(255,184,107,0.38)] text-neutral-900 dark:bg-[rgba(255,184,107,0.32)] dark:text-neutral-100';
/** Incoming bubbles from the other person (white in light mode, not global neutral-100 → black). */
const INBOX_RECV_BUBBLE_CLASS =
  'inbox-recv-bubble bg-white border border-neutral-200 text-neutral-900 shadow-sm dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-100 dark:shadow-none';

function InboxMessageContent({ msg }: { msg: ConversationMessage }) {
  const media = msg.media ?? [];
  const text = msg.message?.trim() ?? '';
  const placeholderOnly = /^\([^)]+\)$/.test(text);
  const showText = text.length > 0 && !(media.some((m) => m.url) && placeholderOnly);

  return (
    <>
      {showText && <p className="text-sm whitespace-pre-wrap break-words">{text}</p>}
      {media.map((item, idx) => {
        const proxied = item.url ? proxyImageUrl(item.url) || item.url : null;
        if (item.kind === 'image' || item.kind === 'sticker') {
          if (proxied) {
            return (
              <img
                key={`${msg.id}-m-${idx}`}
                src={proxied}
                alt={item.title ?? item.kind}
                className={
                  item.kind === 'sticker'
                    ? 'mt-1 max-h-40 w-40 object-contain'
                    : 'mt-1 max-w-full max-h-64 rounded-lg object-contain'
                }
              />
            );
          }
        }
        if (item.kind === 'video' && proxied) {
          return (
            <video
              key={`${msg.id}-m-${idx}`}
              src={proxied}
              controls
              playsInline
              className="mt-1 max-w-full max-h-72 rounded-lg"
            />
          );
        }
        if (item.kind === 'audio' && proxied) {
          return (
            <audio key={`${msg.id}-m-${idx}`} src={proxied} controls className="mt-1 w-full max-w-xs" />
          );
        }
        if (item.kind === 'share' && (item.url || item.title)) {
          return item.url ? (
            <a
              key={`${msg.id}-m-${idx}`}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 block text-sm text-orange-600 dark:text-orange-400 underline break-all"
            >
              {item.title ?? item.url}
            </a>
          ) : (
            <p key={`${msg.id}-m-${idx}`} className="text-sm mt-1">
              {item.title}
            </p>
          );
        }
        if (item.title) {
          return (
            <p key={`${msg.id}-m-${idx}`} className="text-sm mt-1 text-neutral-600 dark:text-neutral-300">
              {item.title}
            </p>
          );
        }
        const fallback =
          item.kind === 'video'
            ? '(Video)'
            : item.kind === 'sticker'
              ? '(Sticker)'
              : item.kind === 'image'
                ? '(Image)'
                : item.kind === 'audio'
                  ? '(Voice message)'
                  : item.kind === 'share'
                    ? '(Share)'
                    : '(Attachment)';
        return (
          <p key={`${msg.id}-m-${idx}`} className="text-sm mt-1 text-neutral-500 dark:text-neutral-400">
            {fallback}
          </p>
        );
      })}
      {!showText && media.length === 0 && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">(Unsupported or empty message)</p>
      )}
      {(msg.reactions?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {msg.reactions!.map((r, idx) => (
            <span
              key={`${msg.id}-r-${idx}`}
              className="text-xs px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200"
              title={r.username ? `From ${r.username}` : undefined}
            >
              {r.reaction}
              {r.username ? ` · ${r.username}` : ''}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function InboxAvatar({
  pictureUrl,
  label,
  className = 'w-10 h-10',
}: {
  pictureUrl: string | null | undefined;
  label: string;
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [pictureUrl]);
  const initials = (label || '?').replace(/^@/, '').slice(0, 2).toUpperCase() || '?';
  const src = pictureUrl && !imgFailed ? proxyImageUrl(pictureUrl) || pictureUrl : null;
  return (
    <div className={`${className} rounded-full bg-neutral-200 dark:bg-neutral-700 flex items-center justify-center shrink-0 overflow-hidden`}>
      {src ? (
        <img
          src={src}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold text-neutral-600">{initials}</span>
      )}
    </div>
  );
}

function inboxSenderDisplayName(
  sender: { name?: string; username?: string; id?: string } | undefined,
  platform?: string
): string {
  const username = sender?.username?.trim();
  if (username) return username.startsWith('@') ? username : `@${username}`;
  const name = sender?.name?.trim();
  if (name) return name;
  if (platform === 'TWITTER') return 'X user';
  if (sender?.id) return `…${sender.id.slice(-8)}`;
  return 'Unknown';
}

/** Orange dot for inbox rows tied to a new notification (sits on the avatar edge, not clipped inside). */
function InboxNewDot({ className = '' }: { className?: string }) {
  return (
    <span
      className={`absolute -top-0.5 -right-0.5 z-10 w-3 h-3 rounded-full bg-orange-500 pointer-events-none ${className}`}
      title="New notification"
      aria-label="New notification"
    />
  );
}

function freshPostImageUrl(comment: Pick<PostComment, 'accountId' | 'platformPostId' | 'platform'>): string {
  return `/api/post-image?accountId=${encodeURIComponent(comment.accountId)}&postId=${encodeURIComponent(comment.platformPostId)}`;
}

function resolveConversationListAvatarUrl(
  c: Conversation,
  userId: string | undefined,
  threadPictureByConvId: Record<string, string | null | undefined>
): string | null | undefined {
  const first = c.senders?.[0];
  return (
    first?.pictureUrl ??
    threadPictureByConvId[c.id] ??
    (userId ? getInboxSenderPicture(userId, c.id, first?.username) : null) ??
    null
  );
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
  pendingUnreadConversationIds,
  unreadCountByConversationId,
  setSelectedPlatform,
  setSelectedConversationId,
  setSelectedConversationIds,
  setUnreadConversationIds,
  onOpenConversation,
  user,
  threadPictureByConvId,
  onWarmConversation,
}: {
  conversations: Array<Conversation & { platform?: string }>;
  inboxFilter: string;
  searchQuery: string;
  messageInboxPlatformIds: string[];
  selectMode: boolean;
  selectedConversationIds: Set<string>;
  selectedConversationId: string | null;
  unreadConversationIds: Set<string>;
  pendingUnreadConversationIds: Set<string>;
  unreadCountByConversationId: Record<string, number>;
  setSelectedPlatform: (p: string | null) => void;
  setSelectedConversationId: (id: string | null) => void;
  setSelectedConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  setUnreadConversationIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  onOpenConversation: (conversationId: string, messageCount?: number) => void;
  user: { id: string } | null;
  threadPictureByConvId: Record<string, string | null | undefined>;
  onWarmConversation?: (conv: Conversation & { platform?: string; messageAccountId?: string }) => void;
}) {
  const filtered = conversations
    .filter((c) => {
      if (inboxFilter === 'all') return true;
      if (inboxFilter === 'read') {
        return !unreadConversationIds.has(c.id) && !pendingUnreadConversationIds.has(c.id);
      }
      if (inboxFilter === 'unread') {
        return unreadConversationIds.has(c.id) || pendingUnreadConversationIds.has(c.id);
      }
      return true;
    })
    .filter((c) => !searchQuery || (c.senders?.[0]?.username ?? c.senders?.[0]?.name ?? c.id).toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const unreadDiff =
        (unreadConversationIds.has(b.id) || pendingUnreadConversationIds.has(b.id) ? 1 : 0) -
        (unreadConversationIds.has(a.id) || pendingUnreadConversationIds.has(a.id) ? 1 : 0);
      if (unreadDiff !== 0) return unreadDiff;
      return (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '');
    });
  return (
    <div className="p-2 space-y-0">
      {filtered.map((c) => {
        const firstSender = c.senders?.[0];
        const convPlatform = (c as Conversation & { platform?: string }).platform ?? (messageInboxPlatformIds.length === 1 ? messageInboxPlatformIds[0] : undefined);
        const platform = convPlatform ?? (c as Conversation & { platform?: string }).platform;
        const storedMeta = user?.id ? getInboxSenderStoredMeta(user.id, c.id, firstSender?.username) : null;
        const name = inboxSenderDisplayName(
          {
            ...firstSender,
            name: firstSender?.name || storedMeta?.name,
            username: firstSender?.username || storedMeta?.username,
          },
          platform
        );
        const pictureUrl = resolveConversationListAvatarUrl(c, user?.id, threadPictureByConvId);
        const initials = (name.startsWith('@') ? name.slice(1) : name).slice(0, 2).toUpperCase();
        const isSelected = selectedConversationIds.has(c.id);
        const isActiveConv = selectedConversationId === c.id;
        const isUnread = (() => {
          if (!user?.id) {
            return unreadConversationIds.has(c.id) || pendingUnreadConversationIds.has(c.id);
          }
          const readSet = getReadConversationIds(user.id);
          const lastRead = getConversationLastReadCounts(user.id);
          const lastSeen = getConversationLastSeenUpdated(user.id);
          const initialized = getInboxInitializedAccountIdsForConversations(user.id);
          return (
            isConversationUnread(
              {
                id: c.id,
                messageCount: c.messageCount,
                messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
                updatedTime: c.updatedTime,
                platform,
              },
              readSet,
              lastRead,
              lastSeen,
              initialized
            ) ||
            unreadConversationIds.has(c.id) ||
            pendingUnreadConversationIds.has(c.id)
          );
        })();
        const rowCls = [
          'inbox-conversation-row group w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/30',
          selectMode && isSelected
            ? 'bg-orange-50 border border-orange-200'
            : isActiveConv
              ? 'sidebar-item-selected'
              : isUnread
                ? 'bg-orange-50/80 hover:bg-orange-100/80 dark:bg-neutral-900 dark:hover:bg-neutral-700'
                : 'hover:bg-neutral-50 dark:hover:bg-neutral-700',
        ].join(' ');
        const checkboxCls = isSelected
          ? 'w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 bg-[var(--button)] border-[var(--button)]'
          : 'w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 border-neutral-300 dark:border-neutral-600';
        return (
          <button
            key={platform ? `${platform}-${c.id}` : c.id}
            type="button"
            onMouseEnter={() => onWarmConversation?.(c as Conversation & { platform?: string; messageAccountId?: string })}
            onFocus={() => onWarmConversation?.(c as Conversation & { platform?: string; messageAccountId?: string })}
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
              onWarmConversation?.(c as Conversation & { platform?: string; messageAccountId?: string });
              if (platform) setSelectedPlatform(platform);
              setSelectedConversationId(c.id);
              onOpenConversation(c.id, (c as Conversation).messageCount);
            }}
            className={rowCls}
          >
            {selectMode ? (
              <div className={checkboxCls}>
                {isSelected && <Check size={12} className="text-white" />}
              </div>
            ) : (
              <div className="relative shrink-0 w-10 h-10">
                <InboxAvatar pictureUrl={pictureUrl} label={name} />
                {(isUnread || (unreadCountByConversationId[c.id] ?? 0) > 0) && <InboxNewDot />}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-900 truncate">{name}</p>
              <div className="mt-1 flex items-center gap-2">
                <PlatformSourcePill platformId={platform} />
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {(() => {
                const unreadN = Math.max(
                  unreadCountByConversationId[c.id] ?? 0,
                  pendingUnreadConversationIds.has(c.id) ? 1 : 0
                );
                if (unreadN <= 0) return null;
                return (
                  <span
                    className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
                    title={`${unreadN} unread message${unreadN === 1 ? '' : 's'}`}
                  >
                    {unreadN > 99 ? '99' : unreadN}
                  </span>
                );
              })()}
              {c.updatedTime && <span className="text-xs text-neutral-400">{new Date(c.updatedTime).toLocaleDateString()}</span>}
              {(unreadCountByConversationId[c.id] ?? 0) === 0 &&
                !pendingUnreadConversationIds.has(c.id) && (
                <Check
                  size={14}
                  className="inbox-row-check shrink-0 text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-500 dark:group-hover:text-neutral-400 transition-colors pointer-events-none"
                  aria-hidden
                />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function platformLabelFromId(platformId: string): string {
  return INBOX_PLATFORM_DEFS.find((p) => p.id === platformId)?.label ?? platformId;
}

function InboxPage() {
  const pathname = usePathname();
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
  const [batchConversationWindowClosed, setBatchConversationWindowClosed] = useState<Record<string, boolean>>({});
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationsErrorsByPlatform, setConversationsErrorsByPlatform] = useState<Record<string, string>>({});
  const [conversationsHintsByPlatform, setConversationsHintsByPlatform] = useState<Record<string, string>>({});
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
  const [batchCommentTexts, setBatchCommentTexts] = useState<Record<string, string>>({});
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);

  useEffect(() => {
    setAiReplyError(null);
    setDmSendError(null);
  }, [selectedConversationId]);
  const [notifications, setNotifications] = useState<{ comments: number; messages: number; byPlatform?: Record<string, { comments: number; messages: number }> }>({ comments: 0, messages: 0 });
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [engagement, setEngagement] = useState<EngagementItem[]>([]);
  const [engagementLoading, setEngagementLoading] = useState(false);
  const [engagementError, setEngagementError] = useState<string | null>(null);
  const [selectedEngagement, setSelectedEngagement] = useState<EngagementItem | null>(null);
  const [deleteCommentLoading, setDeleteCommentLoading] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const [unreadCommentIds, setUnreadCommentIds] = useState<Set<string>>(new Set());
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());
  /** Bumps when localStorage read/pending badge state changes (nav + row dots stay in sync). */
  const [inboxReadStateVersion, setInboxReadStateVersion] = useState(0);
  const [totalUnreadMessages, setTotalUnreadMessages] = useState(0); // sum of unread message counts when messageCount is available
  const [unreadEngagementIds, setUnreadEngagementIds] = useState<Set<string>>(new Set());
  const previousTopLevelCommentIdsRef = useRef<Set<string>>(new Set());
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  const previousEngagementIdsRef = useRef<Set<string>>(new Set());
  const conversationsLoadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conversationsLoadedRef = useRef(false);
  const commentsEverLoadedRef = useRef(false);
  const commentsStableRef = useRef<PostComment[]>([]);
  const conversationsStableRef = useRef<Array<Conversation & { platform?: string; messageAccountId?: string }>>([]);
  const inboxRefreshInFlightRef = useRef(false);
  const profileEnrichInFlightRef = useRef<Set<string>>(new Set());
  // Stable ref so effects that call appData setters don't list appData as a dep
  // (which would cause infinite re-run loops whenever context state updates).
  const appDataRef = useRef(appData);
  /** Next X (Twitter) inbox fetch for these account IDs should send `manualInboxSync=1` (15m server cooldown). */
  /** Next conversations fetch sends fresh=1 to clear Agent4Socials Meta backoff (not Meta dashboard limits). */
  /** Completed warm keys: `${accountId}:${conversationId}` */
  const prefetchedConversationMessagesRef = useRef<Set<string>>(new Set());
  /** In-flight warm promises keyed by `${accountId}:${conversationId}` */
  const warmPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  /** Abort in-flight message fetch when the user switches conversations. */
  const messagesFetchAbortRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const conversationRecipientIdRef = useRef(conversationRecipientId);
  conversationRecipientIdRef.current = conversationRecipientId;
  const dmSendInFlightRef = useRef(false);
  const conversationMessagesCacheRef = useRef(conversationMessagesCache);
  conversationMessagesCacheRef.current = conversationMessagesCache;
  /** One backfill fetch for Instagram avatars when list rows lack pictureUrl (e.g. stale client cache). */

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

  const [inboxAiBetaEnabled, setInboxAiBetaEnabled] = useState(false);
  const hasInboxExamples = !!(inboxReplyExamples?.trim());
  const canUseInboxMessageAi = hasInboxExamples || inboxAiBetaEnabled;

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
  const canUseCommentAi = hasCommentExamples || inboxAiBetaEnabled;

  useEffect(() => {
    if (inboxExamplesLoaded) return;
    const cached = readBrandContextCache(user?.id);
    if (cached) {
      setInboxReplyExamples(cached.inboxReplyExamples ?? null);
      setCommentReplyExamples(cached.commentReplyExamples ?? null);
    }
    api.get('/ai/brand-context').then((res) => {
      const d = res.data;
      if (d && typeof d === 'object') {
        const row = d as {
          inboxReplyExamples?: string | null;
          commentReplyExamples?: string | null;
          inboxAiBetaEnabled?: boolean;
        };
        setInboxReplyExamples(row.inboxReplyExamples ?? null);
        setCommentReplyExamples(row.commentReplyExamples ?? null);
        setInboxAiBetaEnabled(row.inboxAiBetaEnabled === true);
        if (user?.id) {
          writeBrandContextCache(
            {
              ...cached,
              inboxReplyExamples: row.inboxReplyExamples ?? null,
              commentReplyExamples: row.commentReplyExamples ?? null,
            },
            user.id
          );
        }
      }
    }).catch(() => {}).finally(() => setInboxExamplesLoaded(true));
  }, [inboxExamplesLoaded, user?.id]);

  useEffect(() => {
    if (platformFromUrl && INBOX_PLATFORM_DEFS.some((p) => p.id === platformFromUrl)) {
      const id = platformFromUrl;
      setSelectedPlatform(id);
      setSelectedPlatforms((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [platformFromUrl]);

  const effectiveAccounts = (cachedAccounts as Account[]).length > 0 ? (cachedAccounts as Account[]) : accounts;
  const effectiveAccountsRef = useRef(effectiveAccounts);
  effectiveAccountsRef.current = effectiveAccounts;
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
      const messageConnected = connectedPlatformIds.filter((p) => MESSAGE_STRIP_PLATFORM_IDS.has(p));
      const newlyConnectedMessages = messageConnected.filter((p) => !pruned.includes(p));
      if (pruned.length > 0) {
        return newlyConnectedMessages.length > 0 ? [...pruned, ...newlyConnectedMessages] : pruned;
      }

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

  useEffect(() => {
    const onReadChanged = () => setInboxReadStateVersion((v) => v + 1);
    window.addEventListener(INBOX_READ_STATE_CHANGED_EVENT, onReadChanged);
    return () => window.removeEventListener(INBOX_READ_STATE_CHANGED_EVENT, onReadChanged);
  }, []);

  useEffect(() => {
    if (!user?.id || conversationsLoading || commentsLoading || inboxRefreshInFlightRef.current) return;
    const convIdSet = new Set(conversations.map((c) => c.id));
    for (const acc of effectiveAccountsRef.current) {
      for (const c of appDataRef.current?.getConversations(acc.id) ?? []) {
        convIdSet.add(c.id);
      }
    }
    const commentIdSet = new Set(
      comments.filter((c) => !c.parentCommentId).map((c) => c.commentId)
    );
    for (const acc of effectiveAccountsRef.current) {
      for (const c of appDataRef.current?.getComments(acc.id) ?? []) {
        if (!c.parentCommentId) commentIdSet.add(c.commentId);
      }
    }
    if (convIdSet.size === 0 && commentIdSet.size === 0) return;
    if (!conversationsLoading && conversations.length > 0) {
      reconcileInboxReadStateWithConversations(
        conversations.map((c) => ({
          id: c.id,
          messageCount: c.messageCount,
          messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
          updatedTime: c.updatedTime,
          platform: c.platform,
        })),
        user.id
      );
    }
    syncInboxNavBadgeWithLoadedLists(
      user.id,
      conversations.map((c) => ({
        id: c.id,
        messageCount: c.messageCount,
        messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
        updatedTime: c.updatedTime,
        platform: c.platform,
      })),
      comments
        .filter((c) => !c.parentCommentId)
        .map((c) => ({
          commentId: c.commentId,
          platform: c.platform,
          isFromMe: c.isFromMe,
          parentCommentId: c.parentCommentId,
        }))
    );
  }, [
    user?.id,
    conversations,
    comments,
    conversationsLoading,
    commentsLoading,
  ]);

  const pendingUnreadCommentIds = useMemo(
    () => getPendingUnreadCommentIds(user?.id ?? ''),
    [user?.id, inboxReadStateVersion]
  );

  const pendingUnreadConversationIds = useMemo(
    () => getPendingUnreadConversationIds(user?.id ?? ''),
    [user?.id, inboxReadStateVersion]
  );

  const markInboxCommentRead = useCallback(
    (commentId: string) => {
      if (!commentId) return;
      setUnreadCommentIds((prev) => {
        const next = new Set(prev);
        next.delete(commentId);
        return next;
      });
      markCommentsAsRead([commentId], user?.id);
    },
    [user?.id]
  );

  const markInboxConversationRead = useCallback(
    (conversationId: string, messageCount?: number, updatedTime?: string | null) => {
      if (!conversationId) return;
      setUnreadConversationIds((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      markConversationsAsRead([conversationId], user?.id);
      if (updatedTime) {
        setConversationLastSeenUpdated(conversationId, updatedTime, user?.id);
      }
      if (typeof messageCount === 'number') {
        const lastRead = getConversationLastReadCounts(user?.id);
        const readUpTo = lastRead[conversationId] ?? 0;
        const unreadForThis = Math.max(0, messageCount - readUpTo);
        setTotalUnreadMessages((prev) => Math.max(0, prev - unreadForThis));
        setConversationLastReadCount(conversationId, messageCount, user?.id);
      } else {
        setTotalUnreadMessages((prev) => Math.max(0, prev - 1));
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (!selectedComment?.commentId || selectMode) return;
    markInboxCommentRead(selectedComment.commentId);
  }, [selectedComment?.commentId, selectMode, markInboxCommentRead]);

  useEffect(() => {
    if (!selectedConversationId || selectMode) return;
    const conv = conversations.find((c) => c.id === selectedConversationId);
    markInboxConversationRead(selectedConversationId, conv?.messageCount, conv?.updatedTime);
  }, [selectedConversationId, selectMode, conversations, markInboxConversationRead]);

  /** Per-conversation unread message counts (for row badges). */
  const unreadCountByConversationId = useMemo(() => {
    const map: Record<string, number> = {};
    if (!user?.id) {
      for (const c of conversations) {
        if (unreadConversationIds.has(c.id) || pendingUnreadConversationIds.has(c.id)) {
          map[c.id] = 1;
        }
      }
      return map;
    }
    const readSet = getReadConversationIds(user.id);
    const lastRead = getConversationLastReadCounts(user.id);
    const lastSeen = getConversationLastSeenUpdated(user.id);
    const initialized = getInboxInitializedAccountIdsForConversations(user.id);
    for (const c of conversations) {
      const row = {
        id: c.id,
        messageCount: c.messageCount,
        messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
        updatedTime: c.updatedTime,
        platform: c.platform,
      };
      if (!isConversationUnread(row, readSet, lastRead, lastSeen, initialized)) continue;
      if (typeof c.messageCount === 'number') {
        const n = Math.max(0, c.messageCount - (lastRead[c.id] ?? 0));
        map[c.id] = n > 0 ? n : 1;
      } else {
        map[c.id] = 1;
      }
    }
    for (const id of pendingUnreadConversationIds) {
      if (map[id] !== undefined) continue;
      if (conversations.some((c) => c.id === id)) map[id] = 1;
    }
    return map;
  }, [
    conversations,
    unreadConversationIds,
    pendingUnreadConversationIds,
    user?.id,
    inboxReadStateVersion,
  ]);

  /** Per-platform unread DM message totals (platform filter badges + summary). */
  const unreadMessagesByPlatform = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of conversations) {
      if (!c.platform) continue;
      const n = unreadCountByConversationId[c.id] ?? 0;
      if (n > 0) result[c.platform] = (result[c.platform] ?? 0) + n;
    }
    return result;
  }, [conversations, unreadCountByConversationId]);

  /** Top unread threads for the summary strip (name, platform, count). */
  const unreadThreadSummary = useMemo(() => {
    const rows: Array<{ name: string; platform: string; count: number }> = [];
    for (const c of conversations) {
      const count = unreadCountByConversationId[c.id] ?? 0;
      if (count <= 0) continue;
      const platform = c.platform ?? 'UNKNOWN';
      rows.push({
        name: inboxSenderDisplayName(c.senders?.[0], platform),
        platform,
        count,
      });
    }
    rows.sort((a, b) => b.count - a.count);
    return rows;
  }, [conversations, unreadCountByConversationId]);

  const isCommentNewNotification = useCallback(
    (commentId: string) => unreadCommentIds.has(commentId),
    [unreadCommentIds]
  );

  const commentsTabUnreadCount = useMemo(() => {
    return comments.filter((c) => !c.parentCommentId && isCommentNewNotification(c.commentId)).length;
  }, [comments, isCommentNewNotification]);

  const messagesTabUnreadCount = useMemo(() => {
    let total = 0;
    for (const c of conversations) {
      const n = unreadCountByConversationId[c.id] ?? 0;
      if (n > 0) total += n;
      else if (unreadConversationIds.has(c.id) || pendingUnreadConversationIds.has(c.id)) {
        total += 1;
      }
    }
    return total;
  }, [
    conversations,
    unreadCountByConversationId,
    unreadConversationIds,
    pendingUnreadConversationIds,
  ]);

  /** Per-platform unread comment counts (used for badges on the platform filter icons). */
  const unreadCommentsByPlatform = useMemo(() => {
    const result: Record<string, number> = {};
    for (const c of comments) {
      if (
        c.commentId &&
        c.platform &&
        !c.parentCommentId &&
        isCommentNewNotification(c.commentId)
      ) {
        result[c.platform] = (result[c.platform] ?? 0) + 1;
      }
    }
    return result;
  }, [comments, isCommentNewNotification]);

  const selectedConversation = useMemo(
    () => (selectedConversationId ? conversations.find((c) => c.id === selectedConversationId) : undefined),
    [conversations, selectedConversationId]
  );

  const threadPictureByConvId = useMemo(() => {
    const out: Record<string, string | null | undefined> = {};
    for (const [convId, entry] of Object.entries(conversationMessagesCache)) {
      if (entry?.recipientPictureUrl) out[convId] = entry.recipientPictureUrl;
    }
    return out;
  }, [conversationMessagesCache]);

  const applySenderPicture = useCallback(
    (
      convId: string,
      pictureUrl: string | null | undefined,
      name?: string | null,
      username?: string | null,
      messageAccountId?: string
    ) => {
      if (!pictureUrl && !name) return;
      if (user?.id && pictureUrl) {
        setInboxSenderPicture(user.id, convId, pictureUrl, { name, username });
      }
      setConversations((prev) =>
        patchConversationSenderPicture(convId, pictureUrl, name, username)(prev)
      );
      if (messageAccountId && appDataRef.current) {
        const list = appDataRef.current.getConversations(messageAccountId) ?? [];
        appDataRef.current.setConversationsForAccount(
          messageAccountId,
          patchConversationSenderPicture(convId, pictureUrl, name, username)(list)
        );
      }
    },
    [user?.id]
  );

  useEffect(() => {
    if (!user?.id) return;
    setConversations((prev) => {
      let next = prev;
      let changed = false;
      for (const [convId, entry] of Object.entries(conversationMessagesCache)) {
        if (!entry?.recipientPictureUrl) continue;
        const row = next.find((c) => c.id === convId);
        if (row?.senders?.[0]?.pictureUrl === entry.recipientPictureUrl) continue;
        setInboxSenderPicture(user.id, convId, entry.recipientPictureUrl, {
          name: entry.recipientName,
        });
        next = patchConversationSenderPicture(
          convId,
          entry.recipientPictureUrl,
          entry.recipientName,
          row?.senders?.[0]?.username
        )(next);
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [conversationMessagesCache, user?.id]);

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

  const metaMessagingWindowClosed = useMemo(
    () =>
      dmThreadPlatform && (dmThreadPlatform === 'INSTAGRAM' || dmThreadPlatform === 'FACEBOOK')
        ? isMetaMessagingWindowClosed(dmThreadPlatform, conversationMessages)
        : false,
    [dmThreadPlatform, conversationMessages]
  );

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
    if (metaMessagingWindowClosed) return META_MESSAGING_WINDOW_BLOCKED_MESSAGE;
    return null;
  }, [
    selectedConversationId,
    currentAccountForDmThread,
    dmThreadPlatform,
    conversationMessagesError,
    conversationRecipientId,
    metaMessagingWindowClosed,
  ]);

  const recentlyConnectedMetaAccounts = useMemo(
    () =>
      effectiveAccounts.filter(
        (a) =>
          (a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK') &&
          isInboxAccountRecentlyConnected(a.id)
      ),
    [effectiveAccounts]
  );

  const showInboxWarmupNotice = useMemo(() => {
    if (inboxMode !== 'messages') return false;
    if (recentlyConnectedMetaAccounts.length === 0) return false;
    if (!messageFetchPlatformIds.some((p) => p === 'INSTAGRAM' || p === 'FACEBOOK')) return false;
    const hasMetaConversations = conversations.some(
      (c) => c.platform === 'INSTAGRAM' || c.platform === 'FACEBOOK'
    );
    if (hasMetaConversations) return false;
    return conversationsLoading || conversations.length === 0;
  }, [
    inboxMode,
    recentlyConnectedMetaAccounts.length,
    messageFetchPlatformIds.join(','),
    conversations,
    conversationsLoading,
  ]);

  useEffect(() => {
    if (searchParams.get('connecting') !== '1') return;
    for (const a of effectiveAccounts) {
      if (a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK') {
        markInboxAccountRecentlyConnected(a.id, a.platform);
      }
    }
  }, [searchParams, effectiveAccounts]);

  useEffect(() => {
    if (inboxMode !== 'messages') return;
    const hasMetaConversations = conversations.some(
      (c) => c.platform === 'INSTAGRAM' || c.platform === 'FACEBOOK'
    );
    if (!hasMetaConversations) return;
    for (const a of effectiveAccounts) {
      if (a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK') {
        clearInboxAccountRecentlyConnected(a.id);
      }
    }
  }, [inboxMode, conversations, effectiveAccounts]);

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
    const cacheKey = `${accountIdForFetch}:${convId}`;
    const convForRecipient = conversationsRef.current.find((c) => c.id === convId);
    const recipientFromConv = convForRecipient?.senders?.[0]?.id ?? null;

    let cancelled = false;
    messagesFetchAbortRef.current?.abort();
    const ac = new AbortController();
    messagesFetchAbortRef.current = ac;

    const applyCacheToUi = (entry: ConvCache | undefined) => {
      if (!isConvCacheUsable(entry, accountIdForFetch)) return false;
      setConversationMessages(entry!.messages);
      setConversationRecipientId(entry!.recipientId);
      setConversationMessagesError(null);
      setConversationMessagesLoading(false);
      return true;
    };

    const run = async () => {
      const cached = conversationMessagesCacheRef.current[convId];
      const cacheUsable = isConvCacheUsable(cached, accountIdForFetch);
      const cacheFresh = isConvCacheFresh(
        cached,
        accountIdForFetch,
        convForRecipient?.updatedTime,
        convForRecipient?.platform ?? dmThreadPlatform,
        convForRecipient
      );

      if (cacheUsable) applyCacheToUi(cached);
      if (cacheFresh) return;

      if (!cacheUsable) setConversationMessagesLoading(true);
      setConversationMessagesError(null);

      const pendingWarm = warmPromisesRef.current.get(cacheKey);
      if (pendingWarm) {
        await pendingWarm.catch(() => {});
        if (cancelled || ac.signal.aborted) return;
        const afterWarm = conversationMessagesCacheRef.current[convId];
        if (applyCacheToUi(afterWarm)) {
          if (
            isConvCacheFresh(
              afterWarm,
              accountIdForFetch,
              convForRecipient?.updatedTime,
              convForRecipient?.platform ?? dmThreadPlatform,
              convForRecipient
            )
          ) {
            return;
          }
        }
      }

      const convUpdatedTime =
        cacheUsable && !cacheFresh && convForRecipient?.updatedTime
          ? convForRecipient.updatedTime
          : null;
      const messagesUrl = `/social/accounts/${accountIdForFetch}/conversations/${convId}/messages${convUpdatedTime ? `?convUpdatedTime=${encodeURIComponent(convUpdatedTime)}` : ''}`;

      try {
        const res = await api.get(messagesUrl, { timeout: 35_000, signal: ac.signal });
        if (ac.signal.aborted || cancelled) return;
        const freshMessages = res.data?.messages ?? [];
        const error = res.data?.error ?? null;
        const rateLimitHint =
          typeof error === 'string' && /limiting requests|rate limit/i.test(error) ? error : null;
        const recipientId = res.data?.recipientId ?? recipientFromConv ?? null;
        const recipientName = res.data?.recipientName ?? null;
        const recipientPictureUrl = res.data?.recipientPictureUrl ?? null;
        setConversationMessagesCache((prev) => {
          const existing = prev[convId];
          const messages =
            freshMessages.length > 0
              ? freshMessages
              : existing?.messages?.length
                ? existing.messages
                : freshMessages;
          return withCacheEntry(prev, convId, {
            messages,
            recipientId,
            recipientName,
            recipientPictureUrl,
            error: messages.length > 0 ? null : error,
            accountId: accountIdForFetch,
          });
        });
        if (selectedConversationId === convId) {
          const displayMessages =
            freshMessages.length > 0
              ? freshMessages
              : (conversationMessagesCacheRef.current[convId]?.messages ?? freshMessages);
          setConversationMessages(displayMessages);
          setConversationLastReadCount(convId, displayMessages.length, user?.id);
          setConversationRecipientId(recipientId);
          setConversationMessagesError(
            displayMessages.length > 0 ? rateLimitHint : error
          );
          markConversationsAsRead([convId], user?.id);
          const convUpdated =
            conversationsRef.current.find((c) => c.id === convId)?.updatedTime ??
            convForRecipient?.updatedTime;
          if (convUpdated) setConversationLastSeenUpdated(convId, convUpdated, user?.id);
          setUnreadConversationIds((prev) => {
            const next = new Set(prev);
            next.delete(convId);
            return next;
          });
          if (recipientPictureUrl || recipientName) {
            applySenderPicture(
              convId,
              recipientPictureUrl,
              recipientName,
              convForRecipient?.senders?.[0]?.username,
              accountIdForFetch
            );
          }
        }
      } catch (e: unknown) {
        const err = e as {
          code?: string;
          name?: string;
          response?: { status?: number; data?: { error?: string } };
          message?: string;
        };
        if (ac.signal.aborted || cancelled || err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        const isTimeout = err?.code === 'ECONNABORTED' || /timeout/i.test(err?.message ?? '');
        const isRateLimit =
          err?.response?.status === 429 ||
          /limiting requests|rate limit|usage limits/i.test(err?.response?.data?.error ?? '');
        const apiError =
          err?.response?.data?.error ??
          (isTimeout
            ? 'The platform is taking too long to respond. Try again in a moment.'
            : (err?.message ?? 'Could not load messages.'));
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
            setConversationMessagesError(isRateLimit ? apiError : null);
          } else {
            setConversationMessagesError(apiError);
          }
        }
      } finally {
        if (!ac.signal.aborted && !cancelled && selectedConversationId === convId) {
          setConversationMessagesLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [selectedConversationId, currentAccountForDmThread?.id, dmThreadPlatform, user?.id, selectedConversation?.updatedTime]);

  // Facebook / Instagram: poll the open thread every ~90s so new inbound messages appear quickly.
  useEffect(() => {
    if (inboxMode !== 'messages') return;
    if (!selectedConversationId || !currentAccountForDmThread?.id) return;
    if (!dmThreadPlatform || dmThreadPlatform === 'TWITTER') return;

    const convId = selectedConversationId;
    const accountId = currentAccountForDmThread.id;
    let cancelled = false;

    const refreshOpenThread = async () => {
      try {
        const res = await api.get<{
          messages?: ConversationMessage[];
          recipientId?: string | null;
          recipientName?: string | null;
          recipientPictureUrl?: string | null;
          error?: string | null;
        }>(`/social/accounts/${accountId}/conversations/${convId}/messages?refresh=1`, {
          timeout: 45_000,
        });
        if (cancelled) return;
        const freshMessages = res.data?.messages ?? [];
        if (freshMessages.length === 0) return;
        const recipientId = res.data?.recipientId ?? null;
        const recipientName = res.data?.recipientName ?? null;
        const recipientPictureUrl = res.data?.recipientPictureUrl ?? null;
        setConversationMessagesCache((prev) =>
          withCacheEntry(prev, convId, {
            messages: freshMessages,
            recipientId,
            recipientName,
            recipientPictureUrl,
            error: null,
            accountId,
          })
        );
        const latestTime =
          freshMessages
            .map((m) => m.createdTime)
            .filter((t): t is string => typeof t === 'string' && t.length > 0)
            .sort((a, b) => b.localeCompare(a))[0] ?? null;
        if (selectedConversationId === convId) {
          setConversationMessages(freshMessages);
          setConversationRecipientId(recipientId);
          setConversationMessagesError(null);
          markConversationsAsRead([convId], user?.id);
          setUnreadConversationIds((prev) => {
            const next = new Set(prev);
            next.delete(convId);
            return next;
          });
          setConversationLastReadCount(convId, freshMessages.length, user?.id);
          if (recipientPictureUrl || recipientName) {
            const convRow = conversationsRef.current.find((c) => c.id === convId);
            applySenderPicture(
              convId,
              recipientPictureUrl,
              recipientName,
              convRow?.senders?.[0]?.username,
              accountId
            );
          }
          if (latestTime) {
            setConversations((prev) =>
              prev.map((c) => (c.id === convId ? { ...c, updatedTime: latestTime } : c))
            );
          }
        }
      } catch {
        /* keep showing cached thread */
      }
    };

    void refreshOpenThread();
    return () => {
      cancelled = true;
    };
  }, [
    inboxMode,
    selectedConversationId,
    currentAccountForDmThread?.id,
    dmThreadPlatform,
  ]);

  useEffect(() => {
    setAiReplyError(null);
  }, [selectedComment?.commentId, selectedConversationId]);

  // Warm one conversation thread (client cache + server DB cache). Used by prefetch, hover, and focus.
  const warmConversationMessages = useCallback(
    (conv: Conversation & { platform?: string; messageAccountId?: string }): Promise<void> => {
      if (!conv.id || !conv.platform || !DM_THREAD_PLATFORM_IDS.has(conv.platform)) {
        return Promise.resolve();
      }
      // X rate-limits DM event reads; only fetch when the user opens a thread (not bulk prefetch).
      if (conv.platform === 'TWITTER') {
        return Promise.resolve();
      }
      const account = conv.messageAccountId
        ? effectiveAccounts.find((a) => a.id === conv.messageAccountId)
        : effectiveAccounts.find((a) => a.platform === conv.platform);
      if (!account) return Promise.resolve();

      const cacheKey = `${account.id}:${conv.id}`;
      const inFlight = warmPromisesRef.current.get(cacheKey);
      if (inFlight) return inFlight;

      const existing = conversationMessagesCacheRef.current[conv.id];
      if (isConvCacheFresh(existing, account.id, conv.updatedTime, conv.platform, conv)) {
        prefetchedConversationMessagesRef.current.add(cacheKey);
        return Promise.resolve();
      }

      const promise = (async () => {
        try {
          const res = await api.get(
            `/social/accounts/${account.id}/conversations/${conv.id}/messages`,
            { timeout: 35_000 }
          );
          if (res.data?.error === 'throttled') return;
          const messages = res.data?.messages ?? [];
          if (res.data?.error && messages.length === 0) return;

          prefetchedConversationMessagesRef.current.add(cacheKey);
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
          const recipientName = res.data?.recipientName ?? null;
          const recipientPictureUrl = res.data?.recipientPictureUrl ?? null;
          if (recipientPictureUrl || recipientName) {
            applySenderPicture(
              conv.id,
              recipientPictureUrl,
              recipientName,
              conv.senders?.[0]?.username,
              account.id
            );
          }
        } catch {
          // Foreground open may retry; dedupe prevents parallel duplicate Meta calls.
        }
      })();

      warmPromisesRef.current.set(cacheKey, promise);
      return promise.finally(() => {
        warmPromisesRef.current.delete(cacheKey);
      });
    },
    [effectiveAccounts, applySenderPicture]
  );

  // Background prefetch: newest conversations first so manual clicks on recent threads are usually instant.
  // Dep uses joined IDs (not the array ref) so sender-picture patches don't cancel+restart this effect.
  useEffect(() => {
    if (!user?.id) return;
    const convs = conversationsRef.current;
    if (convs.length === 0) return;

    const targets = convs
      .filter((c) => c.id && c.platform && DM_THREAD_PLATFORM_IDS.has(c.platform))
      .sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''))
      .slice(0, INBOX_CLIENT_PREFETCH_MAX);
    if (targets.length === 0) return;

    let cancelled = false;
    const PREFETCH_CONCURRENCY = 12;

    void (async () => {
      const queue = [...targets];
      const workers = Array.from({ length: PREFETCH_CONCURRENCY }, async () => {
        while (queue.length > 0 && !cancelled) {
          const conv = queue.shift();
          if (conv) await warmConversationMessages(conv);
        }
      });
      await Promise.allSettled(workers);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, conversations.map((c) => c.id).join(','), warmConversationMessages]);

  // Fetch last message per selected conversation for batch reply cards (show "message user sent" instead of "How do you want to reply?")
  useEffect(() => {
    if (selectedConversationIds.size === 0) {
      setBatchConversationLastMessage({});
      setBatchConversationWindowClosed({});
      return;
    }
    const ids = Array.from(selectedConversationIds);
    const next: Record<string, string> = {};
    const nextWindow: Record<string, boolean> = {};
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
        if (!acc) return { convId, text: '', windowClosed: false };
        try {
          const res = await api.get<{
            messages?: Array<{ message?: string; isFromPage?: boolean; createdTime?: string | null }>;
          }>(`/social/accounts/${acc.id}/conversations/${convId}/messages`);
          const messages = res.data?.messages ?? [];
          const lastFromOther = [...messages].reverse().find((m) => !m.isFromPage && m.message);
          const windowClosed = plat ? isMetaMessagingWindowClosed(plat, messages) : false;
          return { convId, text: lastFromOther?.message?.trim() ?? '', windowClosed };
        } catch {
          return { convId, text: '', windowClosed: false };
        }
      })
    ).then((results) => {
      if (cancelled) return;
      results.forEach((r) => {
        if (r) {
          next[r.convId] = r.text;
          nextWindow[r.convId] = r.windowClosed;
        }
      });
      setBatchConversationLastMessage(next);
      setBatchConversationWindowClosed(nextWindow);
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

  const applyCommentsToUi = useCallback(
    (incoming: PostComment[]) => {
      const seed =
        commentsStableRef.current.length > 0
          ? commentsStableRef.current
          : user?.id
            ? readInboxCommentsClientCache<PostComment>(user.id)
            : [];
      const stable = mergeInboxCommentsWithUnreadDetection(user?.id, seed, incoming);
      commentsStableRef.current = stable;
      if (user?.id) writeInboxCommentsClientCache(user.id, stable);
      setComments(stable);
      if (stable.length > 0) commentsEverLoadedRef.current = true;
      setCommentsLoading(false);
    },
    [user?.id]
  );

  const applyConversationsToUi = useCallback(
    (incoming: Array<Conversation & { platform: string; messageAccountId: string }>) => {
      const seed =
        conversationsStableRef.current.length > 0
          ? conversationsStableRef.current
          : user?.id
            ? readInboxConversationsClientCache<Conversation & { platform: string; messageAccountId: string }>(
                user.id
              )
            : [];
      const sorted = incoming.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? ''));
      const merged = mergeInboxConversationsWithUnreadDetection(user?.id, seed, sorted);
      const withPictures = user?.id ? mergeSenderPicturesIntoConversations(merged, user.id) : merged;
      conversationsStableRef.current = withPictures;
      if (user?.id) writeInboxConversationsClientCache(user.id, withPictures);
      setConversations(withPictures);
      conversationsLoadedRef.current = withPictures.length > 0;
      setConversationsLoading(false);
      setConversationsError(null);
    },
    [user?.id]
  );

  // Stable refs so refreshInboxFromServer never needs to be recreated (avoids interval restart).
  const applyCommentsToUiRef = useRef(applyCommentsToUi);
  applyCommentsToUiRef.current = applyCommentsToUi;
  const applyConversationsToUiRef = useRef(applyConversationsToUi);
  applyConversationsToUiRef.current = applyConversationsToUi;

  const refreshInboxFromServer = useCallback(
    async (opts?: { liveMeta?: boolean }) => {
      const accs = effectiveAccountsRef.current;
      if (!user?.id || accs.length === 0 || inboxRefreshInFlightRef.current) return;
      inboxRefreshInFlightRef.current = true;
      try {
        const boot = await api.get<{
          commentsByAccountId?: Record<string, PostComment[]>;
          conversationsByAccountId?: Record<string, Conversation[]>;
        }>('/inbox/bootstrap', { timeout: 60_000 });

        const commentRows: PostComment[] = [];
        const convRows: Array<Conversation & { platform: string; messageAccountId: string }> = [];
        for (const acc of accs) {
          const cs = boot.data?.commentsByAccountId?.[acc.id] ?? [];
          commentRows.push(
            ...cs.map((c) => ({ ...c, accountId: c.accountId ?? acc.id, platform: c.platform ?? acc.platform }))
          );
          const cv = boot.data?.conversationsByAccountId?.[acc.id] ?? [];
          for (const c of cv) {
            convRows.push({
              ...c,
              platform: acc.platform,
              messageAccountId: acc.id,
            });
          }
        }
        if (commentRows.length > 0) {
          applyCommentsToUiRef.current(commentRows);
          for (const acc of accs) {
            const perAcc = commentsStableRef.current.filter((c) => c.accountId === acc.id);
            if (perAcc.length) appDataRef.current?.setCommentsForAccount(acc.id, perAcc);
          }
        } else {
          setCommentsLoading(false);
        }
        if (convRows.length > 0) {
          applyConversationsToUiRef.current(convRows);
          for (const acc of accs) {
            const perAcc = conversationsStableRef.current.filter((c) => c.messageAccountId === acc.id);
            if (perAcc.length) appDataRef.current?.setConversationsForAccount(acc.id, perAcc);
          }
        }

        if (opts?.liveMeta) {
          const metaAccounts = accs.filter(
            (a) => a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK'
          );
          let mergedConvRows = [...convRows];
          for (const acc of metaAccounts) {
            try {
              const convRes = await api.get<{ conversations?: Conversation[] }>(
                `/social/accounts/${acc.id}/conversations?fullEnrich=1&fresh=1`,
                { timeout: 180_000 }
              );
              const enriched = convRes.data?.conversations ?? [];
              if (enriched.length > 0) {
                const byId = new Map(mergedConvRows.map((c) => [c.id, c]));
                for (const c of enriched) {
                  byId.set(c.id, {
                    ...c,
                    platform: acc.platform,
                    messageAccountId: acc.id,
                  });
                }
                mergedConvRows = [...byId.values()];
              }
            } catch {
              /* keep bootstrap data for this account */
            }
            try {
              await api.get(`/social/accounts/${acc.id}/comments?refresh=1`, { timeout: 120_000 });
            } catch {
              /* comments refresh is optional on inbox open */
            }
          }
          if (mergedConvRows.length > 0) {
            applyConversationsToUiRef.current(mergedConvRows);
            for (const acc of metaAccounts) {
              const perAcc = conversationsStableRef.current.filter((c) => c.messageAccountId === acc.id);
              if (perAcc.length) appDataRef.current?.setConversationsForAccount(acc.id, perAcc);
            }
          } else {
            setConversationsLoading(false);
          }
          const boot2 = await api.get<{
            commentsByAccountId?: Record<string, PostComment[]>;
          }>('/inbox/bootstrap', { timeout: 60_000 });
          const commentRows2: PostComment[] = [];
          for (const acc of accs) {
            const cs = boot2.data?.commentsByAccountId?.[acc.id] ?? [];
            commentRows2.push(
              ...cs.map((c) => ({
                ...c,
                accountId: c.accountId ?? acc.id,
                platform: c.platform ?? acc.platform,
              }))
            );
          }
          if (commentRows2.length > 0) {
            applyCommentsToUiRef.current(commentRows2);
            for (const acc of accs) {
              const perAcc = commentsStableRef.current.filter((c) => c.accountId === acc.id);
              if (perAcc.length) appDataRef.current?.setCommentsForAccount(acc.id, perAcc);
            }
          } else {
            setCommentsLoading(false);
          }
        }
      } finally {
        inboxRefreshInFlightRef.current = false;
        const uid = user?.id;
        if (uid) {
          const convPayload = conversationsStableRef.current.map((c) => ({
            id: c.id,
            messageCount: c.messageCount,
            messageAccountId: c.messageAccountId,
            updatedTime: c.updatedTime,
            platform: c.platform,
          }));
          const commentPayload = commentsStableRef.current
            .filter((c) => !c.parentCommentId)
            .map((c) => ({
              commentId: c.commentId,
              platform: c.platform,
              isFromMe: c.isFromMe,
              parentCommentId: c.parentCommentId,
            }));
          if (convPayload.length > 0 || commentPayload.length > 0) {
            if (convPayload.length > 0) {
              reconcileInboxReadStateWithConversations(convPayload, uid);
            }
            syncInboxNavBadgeWithLoadedLists(uid, convPayload, commentPayload);
          }
        }
      }
    },
    [user?.id]
  );

  useLayoutEffect(() => {
    if (pathname !== '/dashboard/inbox' || !user?.id) return;

    // 1. sessionStorage (survives navigation but not full page refresh)
    let cachedComments = readInboxCommentsClientCache<PostComment>(user.id);
    let cachedConvs = readInboxConversationsClientCache<Conversation & { platform: string; messageAccountId: string }>(user.id);

    // 2. Fallback: AppDataContext cache (from localStorage — survives page refresh)
    if (cachedComments.length === 0) {
      const fromCtx: PostComment[] = [];
      for (const acc of effectiveAccountsRef.current) {
        const cs = (appDataRef.current?.getComments(acc.id) ?? []) as PostComment[];
        fromCtx.push(...cs.map((c) => ({ ...c, accountId: c.accountId ?? acc.id, platform: c.platform ?? acc.platform })));
      }
      if (fromCtx.length > 0) cachedComments = fromCtx;
    }
    if (cachedConvs.length === 0) {
      const fromCtx: Array<Conversation & { platform: string; messageAccountId: string }> = [];
      for (const acc of effectiveAccountsRef.current) {
        const cs = appDataRef.current?.getConversations(acc.id) ?? [];
        for (const c of cs) {
          fromCtx.push({ ...(c as Conversation), platform: c.platform ?? acc.platform, messageAccountId: acc.id });
        }
      }
      if (fromCtx.length > 0) cachedConvs = fromCtx;
    }

    if (cachedComments.length > 0) applyCommentsToUi(cachedComments);
    if (cachedConvs.length > 0) applyConversationsToUi(cachedConvs);
  }, [pathname, user?.id, applyCommentsToUi, applyConversationsToUi]);

  const refreshInboxFromServerRef = useRef(refreshInboxFromServer);
  refreshInboxFromServerRef.current = refreshInboxFromServer;

  useEffect(() => {
    if (pathname !== '/dashboard/inbox' || !user?.id || effectiveAccounts.length === 0) return;
    void refreshInboxFromServerRef.current({ liveMeta: true });
    const intervalId = setInterval(() => {
      void refreshInboxFromServerRef.current({ liveMeta: false });
    }, INBOX_SYSTEM_SYNC_MS);
    return () => clearInterval(intervalId);
  }, [pathname, user?.id, effectiveAccounts.map((a) => a.id).join(',')]);

  // Backfill missing DM names/avatars one thread at a time (avoids fullEnrich timeouts).
  useEffect(() => {
    if (pathname !== '/dashboard/inbox' || !user?.id || inboxMode !== 'messages') return;
    let cancelled = false;
    const queue = conversations.filter(
      (c) =>
        c.platform &&
        (c.platform === 'INSTAGRAM' || c.platform === 'FACEBOOK') &&
        convNeedsProfileData(c)
    );
    if (queue.length === 0) return;

    void (async () => {
      for (const conv of queue) {
        if (cancelled) break;
        const accountId =
          (conv as Conversation & { messageAccountId?: string }).messageAccountId ??
          effectiveAccounts.find((a) => a.platform === conv.platform)?.id;
        if (!accountId || !conv.id) continue;
        const attemptKey = `${accountId}:${conv.id}`;
        if (profileEnrichInFlightRef.current.has(attemptKey)) continue;
        profileEnrichInFlightRef.current.add(attemptKey);
        try {
          const sendersJson = encodeURIComponent(JSON.stringify(conv.senders ?? []));
          const res = await api.get<{
            senderId?: string | null;
            name?: string | null;
            username?: string | null;
            pictureUrl?: string | null;
          }>(
            `/social/accounts/${accountId}/conversations/${conv.id}/sender-profile?senders=${sendersJson}`,
            { timeout: 30_000 }
          );
          const { name, username, pictureUrl } = res.data ?? {};
          if (name || username || pictureUrl) {
            applySenderPicture(conv.id, pictureUrl ?? null, name, username, accountId);
          }
        } catch {
          /* try next thread */
        } finally {
          profileEnrichInFlightRef.current.delete(attemptKey);
        }
        await new Promise((r) => setTimeout(r, 120));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname, user?.id, inboxMode, conversations, effectiveAccounts, applySenderPicture]);

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

  // When navigating to Inbox, start with no thread open (empty "Select a conversation" pane).
  const prevPathnameRef = useRef<string | null>(null);
  useEffect(() => {
    const onInbox = pathname === '/dashboard/inbox';
    const wasOnInbox = prevPathnameRef.current === '/dashboard/inbox';
    prevPathnameRef.current = pathname;
    if (onInbox && !wasOnInbox) {
      setSelectedConversationId(null);
      setSelectedComment(null);
      setSelectedEngagement(null);
    }
  }, [pathname]);

  const commentsSupportedPlatforms = selectedPlatforms.filter((p) => COMMENT_STRIP_PLATFORM_IDS.has(p));
  /** Load comment cache for every connected inbox platform; filter in the list UI only. */
  const commentCachePlatforms = useMemo(
    () => connectedPlatforms.filter((p) => COMMENT_STRIP_PLATFORM_IDS.has(p.id)).map((p) => p.id),
    [connectedPlatforms.map((p) => p.id).join(',')]
  );

  /** Comments tab shows every cached comment (platform icons filter messages, not comments). */
  const displayComments = comments;

  const visibleConversations = useMemo(() => {
    if (selectedPlatforms.length === 0) return conversations;
    return conversations.filter(
      (c) => !(c as Conversation & { platform?: string }).platform || selectedPlatforms.includes((c as Conversation & { platform?: string }).platform!)
    );
  }, [conversations, selectedPlatforms.join(',')]);

  useEffect(() => {
    if (selectedPlatform && COMMENT_STRIP_PLATFORM_IDS.has(selectedPlatform)) return;
    const next = commentsSupportedPlatforms[0] ?? null;
    if (next) setSelectedPlatform(next);
  }, [inboxMode, selectedPlatform, commentsSupportedPlatforms.join(',')]);

  // Track unread comment ids. When we first load comments for an account, mark them all as read so we only highlight new notifications after connection.
  useEffect(() => {
    const topLevel = comments.filter((c) => !c.parentCommentId);
    const topLevelIds = new Set(topLevel.map((c) => c.commentId));
    const initializedAccounts = getInboxInitializedAccountIds(user?.id);
    const accountIds = [...new Set(comments.map((c) => c.accountId).filter(Boolean))];
    for (const accountId of accountIds) {
      if (initializedAccounts.has(accountId)) continue;
      addInboxInitializedAccount(accountId, user?.id);
    }
    const readSet = getReadCommentIds(user?.id);
    const unreadIds = topLevel
      .filter((c) => !c.isFromMe && !readSet.has(c.commentId))
      .map((c) => c.commentId);
    setUnreadCommentIds(new Set(unreadIds));
    previousTopLevelCommentIdsRef.current = topLevelIds;
  }, [comments, user?.id, inboxReadStateVersion]);

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

  // Track unread conversation ids and total unread messages using shared unread rules.
  useEffect(() => {
    if (!user?.id) return;
    const ids = new Set(conversations.map((c) => c.id));
    const readSet = getReadConversationIds(user.id);
    let lastRead = getConversationLastReadCounts(user.id);
    const lastSeen = getConversationLastSeenUpdated(user.id);
    const initializedConvAccounts = getInboxInitializedAccountIdsForConversations(user.id);
    const hasAnyMessageCount = conversations.some((c) => typeof c.messageCount === 'number');

    if (hasAnyMessageCount) {
      let didInit = false;
      for (const c of conversations) {
        if (lastRead[c.id] !== undefined) continue;
        const accId = (c as Conversation & { messageAccountId?: string }).messageAccountId;
        if (accId && initializedConvAccounts.has(accId)) continue;
        setConversationLastReadCount(c.id, c.messageCount ?? 0, user.id);
        didInit = true;
      }
      if (didInit) lastRead = getConversationLastReadCounts(user.id);
    }

    const unreadIds = new Set<string>();
    let total = 0;
    for (const c of conversations) {
      const row = {
        id: c.id,
        messageCount: c.messageCount,
        messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
        updatedTime: c.updatedTime,
        platform: c.platform,
      };
      if (!isConversationUnread(row, readSet, lastRead, lastSeen, initializedConvAccounts)) continue;
      unreadIds.add(c.id);
      if (typeof c.messageCount === 'number') {
        const n = Math.max(0, c.messageCount - (lastRead[c.id] ?? 0));
        total += n > 0 ? n : 1;
      } else {
        total += 1;
      }
    }

    for (const id of pendingUnreadConversationIds) {
      if (ids.has(id)) {
        unreadIds.add(id);
      }
    }

    const pendingReadable: string[] = [];
    let pendingInList = 0;
    for (const id of pendingUnreadConversationIds) {
      if (!ids.has(id)) continue;
      const c = conversations.find((x) => x.id === id);
      const row = c
        ? {
            id: c.id,
            messageCount: c.messageCount,
            messageAccountId: (c as Conversation & { messageAccountId?: string }).messageAccountId,
            updatedTime: c.updatedTime,
            platform: c.platform,
          }
        : null;
      const unread =
        row != null &&
        isConversationUnread(row, readSet, lastRead, lastSeen, initializedConvAccounts);
      if (unread) {
        pendingInList += 1;
      } else {
        pendingReadable.push(id);
      }
    }
    if (pendingReadable.length > 0) {
      removePendingUnreadConversationIds(pendingReadable, user.id);
      markConversationsAsRead(pendingReadable, user.id);
    }
    setUnreadConversationIds(unreadIds);
    setTotalUnreadMessages(Math.max(total, pendingInList));
    previousConversationIdsRef.current = ids;
  }, [conversations, user?.id, pendingUnreadConversationIds, inboxReadStateVersion]);

  // Track unread engagement ids: engagement items not in persisted read set
  useEffect(() => {
    const ids = new Set(engagement.map((e) => `${e.platform}-${e.platformPostId}`));
    const readSet = getReadEngagementIds(user?.id);
    const unreadIds = [...ids].filter((id) => !readSet.has(id));
    setUnreadEngagementIds(new Set(unreadIds));
    previousEngagementIdsRef.current = ids;
  }, [engagement, user?.id]);

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
                  {isUnread && (
                    <span
                      className="shrink-0 w-2.5 h-2.5 rounded-full bg-orange-500"
                      title="New notification"
                      aria-label="New notification"
                    />
                  )}
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
      if (commentsLoading && displayComments.length === 0) {
        return (
          <div className="p-6 flex flex-col items-center justify-center gap-3">
            <Loader2 size={32} className="text-orange-500 animate-spin" />
            <p className="text-sm text-neutral-500">Loading comments…</p>
          </div>
        );
      }
      if (commentsError && displayComments.length === 0) {
        return (
          <div className="p-4 space-y-3">
            <div className="rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-4">
              <p className="text-sm font-medium text-amber-900">Could not load comments</p>
              <p className="text-xs text-amber-700 mt-1">{commentsError}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {effectiveAccounts.some((a) => a.platform === 'TWITTER') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get('/social/oauth/TWITTER/start');
                      const url = res?.data?.url;
                      if (url) openOAuthConnectUrl(url);
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
                      const res = await api.get('/social/oauth/INSTAGRAM/start');
                      const url = res?.data?.url;
                      if (url) openOAuthConnectUrl(url);
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
      if (displayComments.length === 0) {
        return (
          <div className="p-6 text-center">
            <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
            <p className="text-sm text-neutral-500">No comments yet.</p>
            <p className="text-xs text-neutral-400 mt-1">Comments on your posts will appear here. Make sure to sync your posts first from the Dashboard.</p>
          </div>
        );
      }
      return (
        <>
          <div className="divide-y divide-neutral-100">
            {(() => {
              const topLevelOnly = displayComments.filter((c) => !c.parentCommentId);
              const hasRepliedByParent = new Set(
                displayComments.filter((r) => r.isFromMe && r.parentCommentId).map((r) => r.parentCommentId)
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
                  const unreadDiff =
                    (isCommentNewNotification(b.commentId) ? 1 : 0) -
                    (isCommentNewNotification(a.commentId) ? 1 : 0);
                  if (unreadDiff !== 0) return unreadDiff;
                  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                });
              return filtered.map((c) => {
                const isUnread = isCommentNewNotification(c.commentId);
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
                      setSelectedComment(c);
                      markInboxCommentRead(c.commentId);
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
                      <div className={isSelected ? 'w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 bg-[var(--button)] border-[var(--button)]' : 'w-5 h-5 rounded flex items-center justify-center shrink-0 border-2 border-neutral-300'}>
                        {isSelected && <Check size={12} className="text-white" />}
                      </div>
                    ) : null}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-neutral-400 mb-1">{new Date(c.createdAt).toLocaleString()}</p>
                      <div className="flex items-start gap-3">
                        <div className="relative shrink-0 w-9 h-9">
                          <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden">
                            {c.authorPictureUrl ? (
                              <img src={c.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-xs font-semibold text-neutral-600">{(c.authorName || '?').slice(0, 2).toUpperCase()}</span>
                            )}
                          </div>
                          {isUnread && <InboxNewDot />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium text-neutral-900 truncate">{c.authorName}</p>
                            <PlatformSourcePill platformId={c.platform} />
                          </div>
                          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-300 truncate mt-0.5">
                            {(c.postPreview || 'Post').slice(0, 48)}{(c.postPreview?.length ?? 0) > 48 ? '…' : ''}
                          </p>
                          <p className="text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 mt-0.5">{c.text}</p>
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
          {showInboxWarmupNotice && (
            <p className="text-xs text-neutral-500 max-w-xs text-center mt-1">
              Instagram and Facebook conversations can take a few minutes to appear right after you connect. Please wait and they will show up here.
            </p>
          )}
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
                <p className="text-xs text-amber-800">Inbox will retry automatically. You can also reload the page.</p>
              )}
              {(isAuthError || !isTimeout) && (
                <>
                  {messageFetchPlatformIds.includes('INSTAGRAM') && effectiveAccounts.some((a) => a.platform === 'INSTAGRAM') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/INSTAGRAM/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') openOAuthConnectUrl(url);
                        } catch (_) {}
                      }}
                      className="px-4 py-2 rounded-lg bg-gradient-to-r from-orange-500 to-pink-500 text-white text-sm font-medium hover:opacity-90"
                    >
                      Reconnect via Facebook
                    </button>
                  )}
                  {messageFetchPlatformIds.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/facebook/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') openOAuthConnectUrl(url);
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
                          const res = await api.get('/social/oauth/INSTAGRAM/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') openOAuthConnectUrl(url);
                        } catch (_) {}
                      }}
                      className="px-3 py-1.5 rounded-lg border border-orange-300 bg-white text-orange-700 text-sm font-medium hover:bg-orange-50"
                    >
                      Reconnect via Facebook
                    </button>
                  )}
                  {messageFetchPlatformIds.includes('FACEBOOK') && effectiveAccounts.some((a) => a.platform === 'FACEBOOK') && (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await api.get('/social/oauth/facebook/start');
                          const url = res?.data?.url;
                          if (url && typeof url === 'string') openOAuthConnectUrl(url);
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
        selectedPlatform === 'THREADS' ||
        messageFetchPlatformIds.every((p) => !DM_THREAD_PLATFORM_IDS.has(p));
      return (
        <div className="p-6 text-center">
          <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
          {dmNotInApp ? (
            <>
              <p className="text-sm font-medium text-neutral-800">
                {selectedPlatform === 'THREADS'
                  ? 'Threads direct messages are not in this app'
                  : 'LinkedIn, Pinterest, and Threads DMs are not in this app'}
              </p>
              <p className="text-xs text-neutral-500 mt-2 max-w-sm mx-auto">
                {selectedPlatform === 'THREADS'
                  ? 'Use the Comments tab for replies on your threads and @mentions. Threads private messages stay in the Threads app for now.'
                  : 'Your LinkedIn inbox on linkedin.com will not sync here. LinkedIn does not expose member messaging to our integration. Use Instagram, Facebook, or X for Messages, or open the Comments tab to read and reply to comments on your LinkedIn posts.'}
              </p>
            </>
          ) : showInboxWarmupNotice ? (
            <>
              <p className="text-sm font-medium text-neutral-800">Loading your Instagram and Facebook inbox</p>
              <p className="text-xs text-neutral-500 mt-2 max-w-sm mx-auto">
                Please wait a few minutes after connecting. Your conversations will appear here as soon as Meta finishes syncing.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-neutral-500">No conversations yet.</p>
              <p className="text-xs text-neutral-400 mt-1">Messages will appear here when you receive them.</p>
            </>
          )}
        </div>
      );
    }
    return (
      <>
        {messageFetchPlatformIds.map((platformId) => {
          const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === platformId);
          const platformLabel = plat?.label ?? platformId;
          const err = conversationsErrorsByPlatform[platformId];
          const hint = conversationsHintsByPlatform[platformId];
          const loadedCount = conversations.filter((c) => c.platform === platformId).length;
          const igEmptyNeedReconnect =
            platformId === 'INSTAGRAM' &&
            !err &&
            !hint &&
            loadedCount === 0 &&
            !conversationsLoading &&
            effectiveAccounts.some((a) => a.platform === 'INSTAGRAM');
          const bannerText =
            err ??
            hint ??
            (igEmptyNeedReconnect
              ? 'No Instagram conversations loaded. Use Reconnect below and sign in with Facebook, then select the Page linked to your Instagram (recommended). Instagram-only login often cannot load DMs until Meta App Review approves messaging.'
              : null);
          if (!bannerText) return null;
          return (
            <div
              key={platformId}
              className={`p-3 border-b flex flex-wrap items-center justify-between gap-2 ${
                err ? 'border-amber-200 bg-amber-50' : 'border-sky-200 bg-sky-50'
              }`}
            >
              <p className={`text-xs ${err ? 'text-amber-900' : 'text-sky-900'}`}>
                <span className="font-semibold">{platformLabel}: </span>
                {bannerText}
              </p>
              <div className="flex gap-2">
                {platformId === 'INSTAGRAM' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await api.get('/social/oauth/INSTAGRAM/start');
                        const url = res?.data?.url;
                        if (url && typeof url === 'string') openOAuthConnectUrl(url);
                      } catch (_) {}
                    }}
                    className="text-xs px-2 py-1 rounded bg-gradient-to-r from-orange-500 to-pink-500 text-white font-medium hover:opacity-90"
                  >
                    Reconnect via Facebook
                  </button>
                )}
                {platformId === 'FACEBOOK' && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await api.get('/social/oauth/facebook/start');
                        const url = res?.data?.url;
                        if (url && typeof url === 'string') openOAuthConnectUrl(url);
                      } catch (_) {}
                    }}
                    className="text-xs px-2 py-1 rounded bg-orange-600 text-white font-medium hover:bg-orange-700"
                  >
                    Reconnect Facebook
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <MessagesConversationList
          conversations={visibleConversations}
          inboxFilter={inboxFilter}
          searchQuery={searchQuery}
          messageInboxPlatformIds={messageFetchPlatformIds}
          selectMode={selectMode}
          selectedConversationIds={selectedConversationIds}
          selectedConversationId={selectedConversationId}
          unreadConversationIds={unreadConversationIds}
          pendingUnreadConversationIds={pendingUnreadConversationIds}
          unreadCountByConversationId={unreadCountByConversationId}
          setSelectedPlatform={setSelectedPlatform}
          setSelectedConversationId={setSelectedConversationId}
          setSelectedConversationIds={setSelectedConversationIds}
          setUnreadConversationIds={setUnreadConversationIds}
          onOpenConversation={markInboxConversationRead}
          user={user}
          threadPictureByConvId={threadPictureByConvId}
          onWarmConversation={(conv) => {
            void warmConversationMessages(conv);
          }}
        />
      </>
    );
  };

  return (
    <div className="inbox-thread-shell relative flex h-[calc(100vh-3.5rem-3rem)] md:h-[calc(100vh-3.5rem-4rem)] bg-white dark:bg-neutral-950 flex-col md:flex-row">
      <LoadingVideoOverlay contained loading={conversationsLoading && conversations.length === 0} />
      {/* Left column: platform filters, search, list */}
      <div className="inbox-sidebar-panel w-full md:w-80 border-r border-neutral-200 dark:border-neutral-800 flex flex-col shrink-0 bg-white dark:bg-neutral-950">
        {/* Platform icons + Connect */}
        <div className="p-3 border-b border-neutral-100 dark:border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            {platformsToShow.map((p) => {
              const Icon = p.icon;
              const isSelected = selectedPlatforms.includes(p.id);
              // For messages: prefer locally-tracked unread count; fall back to total
              // conversations loaded for this platform (always available, no API needed).
              // For comments: use unread count; fall back to API byPlatform.comments.
              const msgUnread =
                unreadMessagesByPlatform[p.id] ??
                (conversationsLoading && conversations.length === 0
                  ? (byPlatform[p.id]?.messages ?? 0)
                  : 0);
              const cmtUnread =
                unreadCommentsByPlatform[p.id] ??
                (commentsLoading && comments.length === 0 ? (byPlatform[p.id]?.comments ?? 0) : 0);
              const displayCount = msgUnread + cmtUnread;
              const msgLabel =
                msgUnread > 0 ? `${msgUnread} message${msgUnread === 1 ? '' : 's'}` : '';
              const cmtLabel =
                cmtUnread > 0 ? `${cmtUnread} comment${cmtUnread === 1 ? '' : 's'}` : '';
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
                  title={
                    isSelected
                      ? `Hide ${p.label}`
                      : `Show ${p.label}${
                          displayCount > 0
                            ? ` (${[msgLabel, cmtLabel].filter(Boolean).join(', ')} unread)`
                            : ''
                        }`
                  }
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
            {messagesTabUnreadCount > 0 ? (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {messagesTabUnreadCount > 99 ? '99' : messagesTabUnreadCount}
              </span>
            ) : null}
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
            {commentsTabUnreadCount > 0 ? (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {commentsTabUnreadCount > 99 ? '99' : commentsTabUnreadCount}
              </span>
            ) : null}
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
            {replySendError && !selectMode && (
              <div className="flex items-start gap-2 px-2 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50">
                <span className="flex-1">{replySendError}</span>
                <button
                  type="button"
                  onClick={() => setReplySendError(null)}
                  className="shrink-0 text-red-400 hover:text-red-600"
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>
            )}
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
          {showInboxWarmupNotice && (
            <div className="mx-3 mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
              <p className="font-medium">Instagram and Facebook are still syncing</p>
              <p className="mt-1 text-sky-800 dark:text-sky-200">
                Please wait a few minutes after connecting. Your conversations will show up here automatically.
              </p>
            </div>
          )}
          {renderSidebarList()}
        </div>
      </div>

      {/* Main content - conversation or comment reply */}
      <div className="inbox-thread-panel flex-1 flex flex-col min-w-0 bg-white dark:bg-neutral-950 min-h-0">
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
            const canReplyPlatforms = new Set(['INSTAGRAM', 'FACEBOOK', 'TWITTER', 'YOUTUBE', 'LINKEDIN', 'THREADS']);
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
                  {!canUseCommentAi && inboxExamplesLoaded && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      AI reply drafts are disabled.{' '}
                      <a href="/dashboard/ai-assistant" className="font-medium underline">
                        Add comment reply examples in AI Assistant
                      </a>{' '}
                      to enable them.
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={aiReplyLoading || replySending || !canUseCommentAi || replyable.length === 0}
                      onClick={async () => {
                        setAiReplyError(null);
                        setAiReplyLoading(true);
                        try {
                          const res = await api.post<{
                            replies?: Record<string, string>;
                            errors?: Record<string, string>;
                          }>('/ai/generate-inbox-reply-batch', {
                            type: 'comment',
                            items: replyable.map((c) => ({
                              id: c.commentId,
                              text: c.text,
                              context: c.postPreview ?? undefined,
                              platform: c.platform,
                            })),
                          }, { timeout: 90_000 });
                          const replies = res.data?.replies ?? {};
                          if (Object.keys(replies).length === 0) {
                            setAiReplyError('No replies generated. Try again.');
                            return;
                          }
                          setBatchCommentTexts((prev) => ({ ...prev, ...replies }));
                          const errCount = Object.keys(res.data?.errors ?? {}).length;
                          if (errCount > 0) {
                            setAiReplyError(
                              `Generated ${Object.keys(replies).length} of ${replyable.length} replies. Fill in any missing ones manually.`
                            );
                          }
                        } catch (e: unknown) {
                          setAiReplyError(readApiErrorMessage(e, AI_REPLY_FAILED_MESSAGE));
                        } finally {
                          setAiReplyLoading(false);
                        }
                      }}
                      className="inbox-reply-ai-btn inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                      title={canUseCommentAi ? 'Generate a unique reply for each selected comment' : 'Add examples in AI Assistant'}
                    >
                      {aiReplyLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                      Generate all with AI
                    </button>
                    {aiReplyLoading && (
                      <span className="text-sm text-neutral-500">Writing {replyable.length} replies…</span>
                    )}
                  </div>
                  {aiReplyError && <p className="text-sm text-amber-700">{aiReplyError}</p>}
                  <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Selected comments</p>
                  <div className="space-y-4">
                    {selectedComments.map((c) => {
                      const plat = INBOX_PLATFORM_DEFS.find((p) => p.id === c.platform);
                      const Icon = plat?.icon;
                      const canReply =
                        replyable.some((r) => r.commentId === c.commentId);
                      const draft = batchCommentTexts[c.commentId] ?? '';
                      return (
                        <div key={c.commentId} className="rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm space-y-3">
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
                                <span className="font-medium text-neutral-900 dark:text-neutral-100">{c.authorName}</span>
                                {Icon && <Icon size={14} className="opacity-70" />}
                                <span className="text-xs text-neutral-500">{new Date(c.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-neutral-700 dark:text-neutral-300 mt-1">{c.text}</p>
                              {c.postPreview && (
                                <p className="text-xs text-neutral-500 mt-1 truncate">Post: {c.postPreview.slice(0, 80)}…</p>
                              )}
                            </div>
                          </div>
                          {canReply ? (
                            <textarea
                              placeholder={aiReplyLoading ? 'Generating…' : 'Your reply to this comment'}
                              rows={2}
                              value={draft}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBatchCommentTexts((prev) => ({ ...prev, [c.commentId]: v }));
                              }}
                              disabled={aiReplyLoading || replySending}
                              readOnly={aiReplyLoading}
                              className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none bg-white dark:bg-neutral-900 dark:text-neutral-100 disabled:opacity-60"
                            />
                          ) : (
                            <p className="text-xs text-amber-700">This comment cannot be replied to from the app.</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="pt-2 border-t border-neutral-200 sticky bottom-0 bg-white dark:bg-neutral-900 pb-2">
                    <button
                      type="button"
                      disabled={
                        aiReplyLoading ||
                        replyable.length === 0 ||
                        !replyable.some((c) => (batchCommentTexts[c.commentId] ?? '').trim())
                      }
                      onClick={() => {
                        const toSend = replyable
                          .map((c) => {
                            const msg = (batchCommentTexts[c.commentId] ?? '').trim();
                            if (!msg) return null;
                            const account = effectiveAccounts.find((a) => a.platform === c.platform);
                            if (!account) return null;
                            return { c, msg, account };
                          })
                          .filter((x): x is NonNullable<typeof x> => x !== null);
                        if (toSend.length === 0) return;

                        setReplySendError(null);
                        const sentIds = toSend.map((x) => x.c.commentId);
                        markCommentsAsRead(sentIds, user?.id);
                        setUnreadCommentIds((prev) => {
                          const next = new Set(prev);
                          for (const id of sentIds) next.delete(id);
                          return next;
                        });
                        setBatchCommentTexts({});
                        setReplyText('');
                        setSelectedCommentIds(new Set());
                        setSelectMode(false);

                        void Promise.allSettled(
                          toSend.map(({ c, msg, account }) =>
                            api.post(`/social/accounts/${account.id}/comments/reply`, {
                              commentId: c.commentId,
                              message: msg,
                              ...(c.platform === 'LINKEDIN' && c.linkedInObjectUrn
                                ? { linkedInObjectUrn: c.linkedInObjectUrn }
                                : {}),
                            })
                          )
                        ).then((results) => {
                          const failed: string[] = [];
                          results.forEach((r, i) => {
                            if (r.status === 'rejected') {
                              failed.push(toSend[i].c.authorName || toSend[i].c.commentId);
                            }
                          });
                          if (failed.length > 0) {
                            setReplySendError(
                              `Some replies failed: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}`
                            );
                          }
                        });
                      }}
                      className="inbox-reply-send-btn mt-3 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      <Send size={18} />
                      Send replies ({replyable.filter((c) => (batchCommentTexts[c.commentId] ?? '').trim()).length || replyable.length})
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
                {!canUseInboxMessageAi && inboxExamplesLoaded && (
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
                      const batchWindowClosed = batchConversationWindowClosed[c.id] === true;
                      return (
                        <div key={c.id} className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-3">
                          <div className="flex items-center gap-3">
                            <InboxAvatar pictureUrl={pictureUrl} label={name} />
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
                            {batchWindowClosed && (
                              <p className="text-xs text-amber-800 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5">
                                {META_MESSAGING_WINDOW_BLOCKED_MESSAGE}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 mb-2">
                              <button
                                type="button"
                                disabled={aiReplyLoading || dmReplySending || !canUseInboxMessageAi || batchWindowClosed}
                                onClick={async () => {
                                  if (batchWindowClosed) return;
                                  setAiReplyError(null);
                                  setBatchDmTexts((prev) => ({ ...prev, [c.id]: '' }));
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
                                    setAiReplyError(readApiErrorMessage(e, AI_REPLY_FAILED_MESSAGE));
                                  } finally {
                                    setAiReplyLoading(false);
                                  }
                                }}
                                className="inbox-reply-ai-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                                title={canUseInboxMessageAi ? 'Generate reply with AI' : 'Add inbox reply examples in AI Assistant'}
                              >
                                {aiReplyLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                                Generate with AI
                              </button>
                            </div>
                            <textarea
                              placeholder={aiReplyLoading ? 'Generating reply…' : 'Type a message for this conversation (or generate with AI above)...'}
                              rows={3}
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value;
                                setBatchDmTexts((prev) => ({ ...prev, [c.id]: v }));
                              }}
                              disabled={batchWindowClosed || aiReplyLoading || dmReplySending}
                              readOnly={aiReplyLoading}
                              className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none bg-white dark:bg-neutral-800 dark:text-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                disabled={dmReplySending || aiReplyLoading || !value.trim() || !accountForConv || batchWindowClosed}
                                onClick={async () => {
                                  const text = value.trim();
                                  if (!text || !accountForConv || batchWindowClosed || aiReplyLoading) return;
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
                                className="inbox-reply-send-btn inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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
                    <div className="relative shrink-0 w-10 h-10">
                      <div className="w-10 h-10 rounded-full bg-neutral-200 overflow-hidden">
                        {selectedComment.authorPictureUrl ? (
                          <img src={selectedComment.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-neutral-600">
                            {(selectedComment.authorName || '?').slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {isCommentNewNotification(selectedComment.commentId) && <InboxNewDot />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <PlatformSourcePill platformId={selectedComment.platform} size="md" />
                        <span className="text-xs text-neutral-500">{new Date(selectedComment.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100 mt-1 truncate">
                        {(selectedComment.postPreview || 'Your post').slice(0, 80)}
                        {(selectedComment.postPreview?.length ?? 0) > 80 ? '…' : ''}
                      </p>
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
                      <div className="flex gap-2 items-end min-w-0 flex-1">
                        <InboxAvatar
                          pictureUrl={selectedComment.authorPictureUrl}
                          label={selectedComment.authorName}
                          className="w-8 h-8 shrink-0"
                        />
                        <div className={`min-w-0 flex-1 rounded-2xl px-4 py-2 rounded-bl-md ${INBOX_RECV_BUBBLE_CLASS}`}>
                          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                            {selectedComment.authorName}
                          </p>
                          <p className="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-wrap break-words">
                            {selectedComment.text}
                          </p>
                        </div>
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
                              const isMine = r.authorName === 'You' || r.isFromMe;
                              return (
                              <div
                                key={r.commentId}
                                className={`flex gap-2 items-end ${isMine ? 'justify-end' : 'justify-start'}`}
                              >
                                {!isMine && (
                                  <InboxAvatar
                                    pictureUrl={avatarUrl}
                                    label={r.authorName}
                                    className="w-8 h-8 shrink-0"
                                  />
                                )}
                                <div
                                  className={`min-w-0 max-w-[85%] rounded-2xl px-3 py-2 ${
                                    isMine
                                      ? `${INBOX_SENT_BUBBLE_CLASS} rounded-br-md`
                                      : `${INBOX_RECV_BUBBLE_CLASS} rounded-bl-md`
                                  }`}
                                >
                                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {r.authorName}
                                    <span className="ml-1">{new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}</span>
                                  </p>
                                  <p className="text-sm text-neutral-800 dark:text-neutral-100 mt-0.5 whitespace-pre-wrap break-words">{r.text}</p>
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
                selectedComment.platform !== 'LINKEDIN' &&
                selectedComment.platform !== 'THREADS' ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p className="font-medium">Reply from the app is available for Instagram, Facebook, YouTube, X (Twitter), LinkedIn, and Threads.</p>
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
                    placeholder={aiReplyLoading ? 'Generating reply…' : 'Type your reply...'}
                    rows={2}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    disabled={aiReplyLoading || replySending}
                    readOnly={aiReplyLoading}
                    className="flex-1 px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none bg-white dark:bg-neutral-800 dark:text-neutral-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={aiReplyLoading || replySending || !canUseCommentAi}
                    onClick={async () => {
                      if (!selectedComment) return;
                      setAiReplyError(null);
                      setReplyText('');
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
                        setAiReplyError(readApiErrorMessage(e, AI_REPLY_FAILED_MESSAGE));
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="inbox-reply-ai-btn p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title={canUseCommentAi ? 'Generate reply with AI' : 'Add comment reply examples in AI Assistant to enable AI drafts'}
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  </button>
                  <button
                  type="button"
                  disabled={replySending || aiReplyLoading || !replyText.trim()}
                  onClick={async () => {
                    const account = effectiveAccounts.find((a) => a.platform === selectedComment.platform);
                    if (!account || !selectedComment) return;
                    if (aiReplyLoading) return;
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
                    } catch (e: unknown) {
                      const err = e as { response?: { data?: unknown }; message?: string };
                      const data = err?.response?.data;
                      const msg = (data as { message?: string })?.message ?? err?.message ?? 'Failed to send reply. Please try again.';
                      setReplySendError(msg);
                    } finally {
                      setReplySending(false);
                    }
                  }}
                  className="inbox-reply-send-btn p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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
                {!canUseCommentAi && inboxExamplesLoaded && (
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
                  <div className="inbox-thread-panel bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-neutral-700 shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="p-4 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-800/50 shrink-0">
                      {(() => {
                        const selectedConv = conversations.find((c) => c.id === selectedConversationId);
                        const cached = selectedConversationId ? conversationMessagesCache[selectedConversationId] : undefined;
                        const recipientNameFromCache = cached?.recipientName;
                        const recipientPic =
                          cached?.recipientPictureUrl || selectedConv?.senders?.[0]?.pictureUrl || null;
                        const displayName =
                          selectedConv?.senders?.map((s) => s.name ?? s.username).filter(Boolean).join(', ') ||
                          recipientNameFromCache ||
                          conversationMessages.find((m) => !m.isFromPage && m.fromName?.trim())?.fromName?.trim() ||
                          null;
                        const threadTitle =
                          displayName || (dmThreadPlatform === 'TWITTER' ? 'X user' : 'Unknown');
                        const stripPlat = dmThreadPlatform ?? selectedPlatform;
                        return (
                          <div className="flex items-center gap-3">
                            <InboxAvatar
                              pictureUrl={recipientPic}
                              label={displayName || (dmThreadPlatform === 'TWITTER' ? 'X' : '?')}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-neutral-800">{threadTitle}</p>
                              <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                                <PlatformSourcePill platformId={stripPlat} size="md" />
                                <span className="text-xs text-neutral-500">Direct message</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="inbox-thread-messages p-6 flex-1 min-h-0 overflow-y-auto bg-white dark:bg-neutral-900">
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
                        {(() => {
                          const selectedConv = conversations.find((c) => c.id === selectedConversationId);
                          const cached = selectedConversationId
                            ? conversationMessagesCache[selectedConversationId]
                            : undefined;
                          const recipientPic =
                            cached?.recipientPictureUrl || selectedConv?.senders?.[0]?.pictureUrl || null;
                          const recipientLabel =
                            cached?.recipientName ||
                            selectedConv?.senders?.map((s) => s.username ?? s.name).filter(Boolean).join(', ') ||
                            (dmThreadPlatform === 'TWITTER' ? 'X user' : 'Unknown');
                          return (
                            <div className="space-y-4">
                              {conversationMessages.map((msg) => (
                                <div
                                  key={msg.id}
                                  className={`flex gap-2 ${msg.isFromPage ? 'justify-end' : 'justify-start items-end'}`}
                                >
                                  {!msg.isFromPage && (
                                    <InboxAvatar
                                      pictureUrl={recipientPic}
                                      label={msg.fromName || recipientLabel}
                                      className="w-8 h-8"
                                    />
                                  )}
                                  <div
                                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                                      msg.isFromPage
                                        ? `${INBOX_SENT_BUBBLE_CLASS} rounded-br-md`
                                        : `${INBOX_RECV_BUBBLE_CLASS} rounded-bl-md`
                                    }`}
                                  >
                                    {!msg.isFromPage && (
                                      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400 mb-0.5">
                                        {msg.fromName || recipientLabel}
                                      </p>
                                    )}
                                    <InboxMessageContent msg={msg} />
                                    {msg.createdTime && (
                                      <p className="text-xs mt-1 text-neutral-400 dark:text-neutral-500">
                                        {new Date(msg.createdTime).toLocaleString()}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
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
                  placeholder={aiReplyLoading ? 'Generating reply…' : 'Type a reply...'}
                  rows={2}
                    value={dmReplyText}
                    onChange={(e) => setDmReplyText(e.target.value)}
                    disabled={dmReplySending || aiReplyLoading || !!dmSendBlockedReason}
                    readOnly={aiReplyLoading}
                    className="flex-1 px-4 py-3 border border-neutral-200 dark:border-neutral-700 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed bg-white dark:bg-neutral-800 dark:text-neutral-100"
                />
                <button
                  type="button"
                    disabled={dmReplySending || aiReplyLoading || !canUseInboxMessageAi || !!dmSendBlockedReason}
                    onClick={async () => {
                      if (dmSendBlockedReason) return;
                      const lastFromUser = [...conversationMessages].reverse().find((m) => !m.isFromPage && m.message);
                      const textToReplyTo = (lastFromUser?.message ?? conversationMessages.filter((m) => !m.isFromPage).map((m) => m.message).join('\n')) || 'Hello';
                      setAiReplyError(null);
                      setDmReplyText('');
                      setAiReplyLoading(true);
                      try {
                        const res = await api.post<{ reply?: string }>(
                          '/ai/generate-inbox-reply',
                          {
                            type: 'message',
                            text: textToReplyTo,
                            platform: dmThreadPlatform ?? selectedPlatform ?? undefined,
                          },
                          { timeout: 45_000 }
                        );
                        const reply = res.data?.reply?.trim();
                        if (reply) setDmReplyText(reply);
                        else setAiReplyError('No reply generated. Try again.');
                      } catch (e: unknown) {
                        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                        setAiReplyError(
                          readApiErrorMessage(e, AI_REPLY_FAILED_MESSAGE) ||
                            (msg?.includes('OPENAI') ? AI_REPLY_NOT_CONFIGURED_MESSAGE : AI_REPLY_FAILED_MESSAGE)
                        );
                      } finally {
                        setAiReplyLoading(false);
                      }
                    }}
                    className="inbox-reply-ai-btn p-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    title={canUseInboxMessageAi ? 'Generate reply with AI' : 'Add inbox reply examples in AI Assistant to enable AI drafts'}
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                </button>
                  {!canUseInboxMessageAi && inboxExamplesLoaded && (
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg bg-neutral-800 text-white text-xs pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10">
                      Add reply examples in AI Assistant to unlock
              </div>
                  )}
                <button
                  type="button"
                  disabled={dmReplySending || aiReplyLoading || !dmReplyText.trim() || !!dmSendBlockedReason}
                  onClick={async () => {
                    const account = currentAccountForDmThread;
                    if (dmSendBlockedReason) {
                      setDmSendError(dmSendBlockedReason);
                      return;
                    }
                    if (!account || !selectedConversationId || !dmReplyText.trim()) return;
                    if (dmSendInFlightRef.current || aiReplyLoading) return;

                    const textToSend = dmReplyText.trim();
                    const cid2 = selectedConversationId;
                    const recipientId = resolveDmRecipientIdForSend(
                      cid2,
                      conversationsRef.current,
                      conversationRecipientIdRef.current,
                      conversationMessagesCacheRef.current
                    );

                    setDmSendError(null);
                    setAiReplyError(null);
                    setDmReplyText('');

                    const optimisticId = `local-${Date.now()}`;
                    const optimistic: ConversationMessage = {
                      id: optimisticId,
                      fromId: null,
                      fromName: null,
                      message: textToSend,
                      createdTime: new Date().toISOString(),
                      isFromPage: true,
                    };
                    setConversationMessages((prev) => [...prev, optimistic]);
                    setConversationMessagesError(null);
                    setConversationMessagesCache((prev) =>
                      withCacheEntry(prev, cid2, {
                        messages: [...(prev[cid2]?.messages ?? []), optimistic],
                        recipientId: recipientId ?? prev[cid2]?.recipientId ?? null,
                        recipientName: prev[cid2]?.recipientName ?? null,
                        recipientPictureUrl: prev[cid2]?.recipientPictureUrl ?? null,
                        error: null,
                        accountId: account.id,
                      })
                    );

                    dmSendInFlightRef.current = true;
                    setDmReplySending(true);
                    try {
                      await api.post(
                        `/social/accounts/${account.id}/conversations/${cid2}/messages`,
                        { text: textToSend, recipientId },
                        { timeout: 20_000 }
                      );
                      void api
                        .get(`/social/accounts/${account.id}/conversations/${cid2}/messages`, {
                          params: { convUpdatedTime: new Date().toISOString() },
                          timeout: 25_000,
                        })
                        .then((res) => {
                          const messages = res.data?.messages ?? [];
                          if (messages.length === 0) return;
                          setConversationMessages(messages);
                          const nextRecipientId =
                            res.data?.recipientId ?? recipientId ?? conversationRecipientIdRef.current ?? null;
                          setConversationRecipientId(nextRecipientId);
                          setConversationMessagesError(res.data?.error ?? null);
                          setConversationMessagesCache((prev) =>
                            withCacheEntry(prev, cid2, {
                              messages,
                              recipientId: nextRecipientId,
                              recipientName: res.data?.recipientName ?? prev[cid2]?.recipientName ?? null,
                              recipientPictureUrl:
                                res.data?.recipientPictureUrl ?? prev[cid2]?.recipientPictureUrl ?? null,
                              error: res.data?.error ?? null,
                              accountId: account.id,
                            })
                          );
                        })
                        .catch(() => {});
                      void api
                        .get<{
                          inbox?: number;
                          comments?: number;
                          messages?: number;
                          byPlatform?: Record<string, { comments: number; messages: number }>;
                        }>('/social/notifications')
                        .catch(() => {});
                    } catch (e: unknown) {
                      setConversationMessages((prev) => prev.filter((m) => m.id !== optimisticId));
                      setConversationMessagesCache((prev) => {
                        const entry = prev[cid2];
                        if (!entry) return prev;
                        return withCacheEntry(prev, cid2, {
                          ...entry,
                          messages: entry.messages.filter((m) => m.id !== optimisticId),
                        });
                      });
                      setDmReplyText(textToSend);
                      const errMsg = readApiErrorMessage(e, 'Failed to send message.');
                      const isDevMode =
                        errMsg.toLowerCase().includes('does not exist') ||
                        errMsg.toLowerCase().includes('missing permissions') ||
                        errMsg.toLowerCase().includes('unsupported');
                      setDmSendError(
                        isDevMode
                          ? 'Could not send: Instagram may be in Development Mode. Only users added as Testers in your Meta App can receive messages while the app is not published.'
                          : errMsg
                      );
                    } finally {
                      dmSendInFlightRef.current = false;
                      setDmReplySending(false);
                    }
                  }}
                  className="inbox-reply-send-btn p-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  title="Send"
                >
                  <Send size={20} />
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
