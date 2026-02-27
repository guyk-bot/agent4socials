'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  MessageCircle,
  Plus,
  Search,
  Check,
  Send,
  Image as ImageIcon,
  Smile,
  Loader2,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import api from '@/lib/api';
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
type Conversation = { id: string; updatedTime: string | null; senders: Array<{ username?: string; name?: string }> };
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
  postPreview: string;
  postImageUrl?: string | null;
  text: string;
  authorName: string;
  authorPictureUrl?: string | null;
  createdAt: string;
  platform: string;
};

export default function InboxPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const platformFromUrl = searchParams.get('platform')?.toUpperCase();
  const setSelectedPlatformForConnect = useSelectedAccount()?.setSelectedPlatformForConnect ?? (() => {});
  const appData = useAppData();
  const { cachedAccounts } = useAccountsCache() ?? { cachedAccounts: [] };
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<'unresolved' | 'unread'>('unresolved');
  const [searchQuery, setSearchQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [inboxMode, setInboxMode] = useState<'messages' | 'comments' | 'engagement'>('messages');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [conversationsDebug, setConversationsDebug] = useState<{ rawMessage?: string; code?: number; responseData?: unknown } | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState<string | null>(null);
  const [selectedComment, setSelectedComment] = useState<PostComment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [conversationRecipientId, setConversationRecipientId] = useState<string | null>(null);
  const [conversationMessagesLoading, setConversationMessagesLoading] = useState(false);
  const [conversationMessagesError, setConversationMessagesError] = useState<string | null>(null);
  const [dmReplyText, setDmReplyText] = useState('');
  const [dmReplySending, setDmReplySending] = useState(false);
  const [aiReplyLoading, setAiReplyLoading] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{ comments: number; messages: number; byPlatform?: Record<string, { comments: number; messages: number }> }>({ comments: 0, messages: 0 });
  const connectRef = useRef<HTMLDivElement>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  useEffect(() => {
    if ((cachedAccounts as Account[]).length > 0) return;
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setAccounts(data);
      const first =
        data.some((a: Account) => a.platform === 'INSTAGRAM') ? 'INSTAGRAM'
          : data.some((a: Account) => a.platform === 'FACEBOOK') ? 'FACEBOOK'
          : null;
      setSelectedPlatform(first);
      setSelectedPlatforms(first ? [first] : []);
    }).catch(() => setAccounts([]));
  }, [cachedAccounts.length]);

  useEffect(() => {
    if (platformFromUrl && PLATFORMS.some((p) => p.id === platformFromUrl)) {
      const id = platformFromUrl;
      setSelectedPlatform(id);
      setSelectedPlatforms((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, [platformFromUrl]);

  const effectiveAccounts = (cachedAccounts as Account[]).length > 0 ? (cachedAccounts as Account[]) : accounts;
  const connectedPlatforms = PLATFORMS.filter((p) => effectiveAccounts.some((a) => a.platform === p.id));
  const unconnectedPlatforms = PLATFORMS.filter((p) => !effectiveAccounts.some((a) => a.platform === p.id));
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
      return;
    }
    setConversationMessagesLoading(true);
    setConversationMessagesError(null);
    api.get(`/social/accounts/${currentAccountForMessages.id}/conversations/${selectedConversationId}/messages`)
      .then((res) => {
        setConversationMessages(res.data?.messages ?? []);
        setConversationRecipientId(res.data?.recipientId ?? null);
        setConversationMessagesError(res.data?.error ?? null);
      })
      .catch(() => {
        setConversationMessages([]);
        setConversationRecipientId(null);
        setConversationMessagesError('Could not load messages.');
      })
      .finally(() => setConversationMessagesLoading(false));
  }, [selectedConversationId, currentAccountForMessages?.id, selectedPlatform]);

  useEffect(() => {
    setAiReplyError(null);
  }, [selectedComment?.commentId, selectedConversationId]);

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

  const dmOrFbPlatforms = selectedPlatforms.filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK');
  useEffect(() => {
    if (dmOrFbPlatforms.length === 0) {
      setConversations([]);
      setConversationsError(null);
      setConversationsDebug(null);
      return;
    }
    let cancelled = false;
    const merge: Array<Conversation & { platform: string }> = [];
    const errors: string[] = [];
    const debugs: Array<{ rawMessage?: string; code?: number }> = [];
    let pending = dmOrFbPlatforms.length;

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
      if (fromCache !== undefined && fromCache !== null) {
        merge.push(...fromCache.map((c) => ({ ...c, platform })));
        if (--pending === 0 && !cancelled) {
          setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
          setConversationsError(null);
          setConversationsDebug(null);
          setConversationsLoading(false);
        }
        return;
      }
      api.get(`/social/accounts/${account.id}/conversations`)
        .then((res) => {
          if (cancelled) return;
          const list = (res.data?.conversations ?? []).map((c: Conversation) => ({ ...c, platform }));
          merge.push(...list);
          if (res.data?.error) errors.push(res.data.error);
          if (res.data?.debug) debugs.push(res.data.debug);
          appData?.setConversationsForAccount(account.id, res.data?.conversations ?? []);
          if (--pending === 0) {
            setConversations(merge.sort((a, b) => (b.updatedTime ?? '').localeCompare(a.updatedTime ?? '')));
            setConversationsError(errors[0] ?? null);
            setConversationsDebug(debugs[0] ?? null);
          }
        })
        .catch((err: { message?: string; response?: { status?: number; data?: unknown } }) => {
          if (cancelled) return;
          const msg = err?.message ?? 'Could not load conversations.';
          const isTimeout = err?.response?.status === 408 || /timeout|408/i.test(msg);
          errors.push(isTimeout ? 'Request timed out. Try again or reconnect and choose your Page.' : msg);
          debugs.push({ rawMessage: msg });
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

    setConversationsLoading(true);
    setConversationsError(null);
    setConversationsDebug(null);
    return () => { cancelled = true; };
  }, [dmOrFbPlatforms.join(','), effectiveAccounts, appData]);

  const commentsSupportedPlatforms = selectedPlatforms.filter((p) => p === 'INSTAGRAM' || p === 'FACEBOOK' || p === 'TWITTER');
  useEffect(() => {
    if (inboxMode !== 'comments' || commentsSupportedPlatforms.length === 0) {
      setComments([]);
      setCommentsError(null);
      setSelectedComment(null);
      return;
    }
    let cancelled = false;
    const merge: PostComment[] = [];
    let pending = commentsSupportedPlatforms.length;

    commentsSupportedPlatforms.forEach((platform) => {
      const account = effectiveAccounts.find((a) => a.platform === platform);
      if (!account) {
        if (--pending === 0 && !cancelled) {
          setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          setCommentsLoading(false);
        }
        return;
      }
      const fromCache = appData?.getComments(account.id);
      if (fromCache !== undefined && fromCache !== null) {
        merge.push(...fromCache);
        if (--pending === 0 && !cancelled) {
          setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          setCommentsError(null);
          setCommentsLoading(false);
        }
        return;
      }
      api.get(`/social/accounts/${account.id}/comments`)
        .then((res) => {
          if (cancelled) return;
          const list = res.data?.comments ?? [];
          merge.push(...list);
          appData?.setCommentsForAccount(account.id, list);
          if (--pending === 0) {
            setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setCommentsError(res.data?.error ?? null);
          }
        })
        .catch(() => {
          if (cancelled) return;
          if (--pending === 0) {
            setComments(merge.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setCommentsError('Could not load comments.');
          }
        })
        .finally(() => {
          if (pending === 0 && !cancelled) setCommentsLoading(false);
        });
    });

    setCommentsLoading(true);
    setCommentsError(null);
    return () => { cancelled = true; };
  }, [inboxMode, commentsSupportedPlatforms.join(','), effectiveAccounts, appData]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) setConnectOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if ((cachedAccounts as Account[]).length > 0 && selectedPlatforms.length === 0) {
      const accs = cachedAccounts as Account[];
      const first = accs.some((a) => a.platform === 'INSTAGRAM') ? 'INSTAGRAM' : accs.some((a) => a.platform === 'FACEBOOK') ? 'FACEBOOK' : accs.some((a) => a.platform === 'TWITTER') ? 'TWITTER' : null;
      if (first) {
        setSelectedPlatforms([first]);
        setSelectedPlatform(first);
      }
    }
  }, [cachedAccounts, selectedPlatforms.length]);

  const handlePlatformClick = (platformId: string) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(platformId) ? prev.filter((p) => p !== platformId) : [...prev, platformId];
      if (!next.includes(selectedPlatform)) {
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
    <div className="flex h-[calc(100vh-3.5rem)] bg-white flex-col md:flex-row">
      {/* Left sidebar - Metricool style */}
      <div className="w-full md:w-80 border-r border-neutral-200 flex flex-col shrink-0 bg-white">
        {/* Platform icons + Connect */}
        <div className="p-3 border-b border-neutral-100">
          <div className="flex items-center gap-2 flex-wrap">
            {connectedPlatforms.map((p) => {
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
                className="w-10 h-10 rounded-lg flex items-center justify-center border-2 border-dashed border-red-300 bg-red-50/50 text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors"
                title="Connect account"
              >
                <Plus size={22} />
              </button>
              {connectOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 py-1 bg-white border border-neutral-200 rounded-xl shadow-lg z-50">
                  <p className="px-3 py-2 text-xs font-semibold text-neutral-500 uppercase tracking-wider">Connect account</p>
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
                          <span className="flex-1">Connect a {p.label} account</span>
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
              placeholder={inboxMode === 'comments' ? 'Search comments...' : inboxMode === 'engagement' ? 'Search engagement...' : 'Search conversation...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Messages / Comments / Engagement */}
        <div className="flex border-b border-neutral-200">
          <button
            type="button"
            onClick={() => { setInboxMode('messages'); setSelectedComment(null); }}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${inboxMode === 'messages' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Messages
            {inboxMode !== 'messages' && effectiveNotifications.messages > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {effectiveNotifications.messages > 99 ? '99' : effectiveNotifications.messages}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setInboxMode('comments'); setSelectedConversationId(null); }}
            className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-1.5 ${inboxMode === 'comments' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Comments
            {inboxMode !== 'comments' && effectiveNotifications.comments > 0 && (
              <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                {effectiveNotifications.comments > 99 ? '99' : effectiveNotifications.comments}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => { setInboxMode('engagement'); setSelectedConversationId(null); setSelectedComment(null); }}
            className={`flex-1 py-3 text-sm font-medium ${inboxMode === 'engagement' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Engagement
          </button>
        </div>

        {inboxMode === 'messages' && (
          <div className="flex border-b border-neutral-200">
            <button
              type="button"
              onClick={() => setInboxFilter('unresolved')}
              className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'unresolved' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
            >
              Unresolved
            </button>
            <button
              type="button"
              onClick={() => setInboxFilter('unread')}
              className={`flex-1 py-2 text-xs font-medium ${inboxFilter === 'unread' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
            >
              Unread
            </button>
          </div>
        )}

        {/* Conversation, comment, or engagement list */}
        <div className="flex-1 overflow-y-auto">
          {inboxMode === 'engagement' ? (
            <div className="p-6 text-center">
              <BarChart3 size={40} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm font-medium text-neutral-900">Engagement</p>
              <p className="text-sm text-neutral-500 mt-1">Likes, shares, and mentions for your posts. Select a platform above to see engagement for that account.</p>
            </div>
          ) : inboxMode === 'comments' && commentsSupportedPlatforms.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm text-neutral-500">Comments are available for Instagram, Facebook, and X. Select one or more of those platforms above.</p>
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
            ) : commentsError ? (
              <div className="p-4">
                <p className="text-sm text-neutral-700">{commentsError}</p>
              </div>
            ) : comments.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
                <p className="text-sm text-neutral-500">No comments yet.</p>
                <p className="text-xs text-neutral-400 mt-1">Comments on your posts will appear here.</p>
              </div>
            ) : (
              <div className="p-2 space-y-0">
                {comments
                  .filter((c) => !searchQuery || c.text.toLowerCase().includes(searchQuery.toLowerCase()) || c.authorName.toLowerCase().includes(searchQuery.toLowerCase()))
                  .map((c) => (
                    <button
                      key={c.commentId}
                      type="button"
                      onClick={() => setSelectedComment(c)}
                      className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                        selectedComment?.commentId === c.commentId ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="w-9 h-9 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 overflow-hidden">
                        {c.authorPictureUrl ? (
                          <img src={c.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-neutral-600">{(c.authorName || '?').slice(0, 2).toUpperCase()}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{c.authorName}</p>
                        <p className="text-xs text-neutral-600 line-clamp-2">{c.text}</p>
                        <p className="text-xs text-neutral-400 mt-0.5 truncate">{c.postPreview}</p>
                        <p className="text-xs text-neutral-400 mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
                      </div>
                    </button>
                  ))}
              </div>
            )
          ) : conversationsLoading ? (
            <div className="p-6 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-neutral-500">Loading conversations…</p>
            </div>
          ) : conversationsError ? (
            <div className="p-4">
              <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-4">
                <p className="text-sm font-medium text-indigo-900">To load conversations, reconnect and choose your Page.</p>
                <p className="text-xs text-indigo-700 mt-1">{conversationsError}</p>
                {conversationsDebug && (conversationsDebug.rawMessage || conversationsDebug.code != null) && (
                  <p className="text-xs text-neutral-500 mt-1 font-mono">API: {conversationsDebug.rawMessage ?? ''} {conversationsDebug.code != null ? `(code ${conversationsDebug.code})` : ''}</p>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get('/social/oauth/facebook/start');
                      const url = res?.data?.url;
                      if (url && typeof url === 'string') window.location.href = url;
                    } catch (_) {}
                  }}
                  className="mt-3 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
                >
                  Reconnect Facebook & Instagram
                </button>
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-500">No conversations yet.</p>
              <p className="text-xs text-neutral-400 mt-1">Messages will appear here when you receive them.</p>
            </div>
          ) : (
            <div className="p-2 space-y-0">
              {conversations
                .filter((c) => !searchQuery || (c.senders?.[0]?.username ?? c.senders?.[0]?.name ?? c.id).toLowerCase().includes(searchQuery.toLowerCase()))
                .map((c) => {
                  const name = c.senders?.[0]?.username ?? c.senders?.[0]?.name ?? 'Unknown';
                  const initials = name.slice(0, 2).toUpperCase();
                  const platform = (c as Conversation & { platform?: string }).platform;
                  return (
                    <button
                      key={platform ? `${platform}-${c.id}` : c.id}
                      type="button"
                      onClick={() => {
                        if (platform) setSelectedPlatform(platform);
                        setSelectedConversationId(c.id);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors ${
                        selectedConversationId === c.id ? 'bg-indigo-50 border border-indigo-100' : 'hover:bg-neutral-50'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 text-sm font-semibold text-neutral-600">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-neutral-900 truncate">{name}</p>
                        <p className="text-xs text-neutral-500 truncate">Conversation</p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1">
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
                Click an Instagram, Facebook, TikTok, YouTube, or X icon in the left sidebar to view that platform&apos;s conversations and comments.
              </p>
            </div>
          </div>
        ) : inboxMode === 'comments' && selectedComment ? (
          <>
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50/50 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-neutral-200 shrink-0 overflow-hidden">
                      {selectedComment.authorPictureUrl ? (
                        <img src={selectedComment.authorPictureUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-sm font-semibold text-neutral-600">
                          {(selectedComment.authorName || '?').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-neutral-800">Comment on your post</p>
                      <p className="text-xs text-neutral-500">{selectedComment.authorName} · {PLATFORMS.find((p) => p.id === selectedPlatform)?.label}</p>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Comment</p>
                      <p className="text-sm text-neutral-800 mt-1">{selectedComment.text}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Your post</p>
                      {selectedComment.postImageUrl && (
                        <div className="mt-2 rounded-lg overflow-hidden border border-neutral-100 bg-neutral-50 max-w-xs">
                          <img src={selectedComment.postImageUrl} alt="Post" className="w-full h-auto object-contain max-h-48" />
                        </div>
                      )}
                      <p className="text-sm text-neutral-600 mt-1 line-clamp-2">{selectedComment.postPreview}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-neutral-200 bg-white p-4 shrink-0 pb-6">
              <div className="max-w-2xl mx-auto">
                {aiReplyError && (
                  <p className="text-sm text-amber-700 mb-2">{aiReplyError}</p>
                )}
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
                    disabled={aiReplyLoading}
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
                    className="p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 shrink-0 border border-indigo-200"
                    title="Generate reply with AI"
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  </button>
                  <button
                  type="button"
                  disabled={replySending || !replyText.trim()}
                  onClick={async () => {
                    const account = effectiveAccounts.find((a) => a.platform === selectedPlatform);
                    if (!account || !selectedComment) return;
                    setReplySending(true);
                    try {
                      await api.post(`/social/accounts/${account.id}/comments/reply`, {
                        commentId: selectedComment.commentId,
                        message: replyText.trim(),
                      });
                      setReplyText('');
                      setSelectedComment(null);
                    } catch (e: unknown) {
                      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                      alert(msg ?? 'Failed to send reply.');
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
                <p className="text-xs text-neutral-400 mt-2">Use the sparkle button to generate a reply with AI, then edit or send.</p>
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
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <BarChart3 size={48} className="mx-auto text-neutral-300 mb-3" />
              <h2 className="text-lg font-semibold text-neutral-800">Engagement</h2>
              <p className="text-sm text-neutral-500 mt-2">
                View likes, shares, and mentions for your posts. Content for this view is coming soon.
              </p>
            </div>
          </div>
        ) : !selectedConversationId ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={48} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-600">Select a conversation from the list</p>
              <p className="text-xs text-neutral-400 mt-1">
                {PLATFORMS.find((p) => p.id === selectedPlatform)?.label} inbox
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 min-h-0">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                    <p className="text-sm font-medium text-neutral-800">Conversation</p>
                    <p className="text-xs text-neutral-500 mt-0.5">{PLATFORMS.find((p) => p.id === selectedPlatform)?.label} inbox</p>
                  </div>
                  <div className="p-6 min-h-[200px]">
                    {conversationMessagesLoading ? (
                      <div className="flex flex-col items-center justify-center gap-3 py-8">
                        <Loader2 size={32} className="text-indigo-500 animate-spin" />
                        <p className="text-sm text-neutral-500">Loading messages…</p>
                      </div>
                    ) : conversationMessagesError ? (
                      <p className="text-sm text-amber-700">{conversationMessagesError}</p>
                    ) : conversationMessages.length === 0 ? (
                      <p className="text-sm text-neutral-500 italic">No messages in this conversation yet.</p>
                    ) : (
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
                              {!msg.isFromPage && msg.fromName && (
                                <p className="text-xs font-medium text-neutral-500 mb-0.5">{msg.fromName}</p>
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
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-neutral-200 bg-white p-4 shrink-0">
              <div className="max-w-2xl mx-auto">
                {aiReplyError && (
                  <p className="text-sm text-amber-700 mb-2">{aiReplyError}</p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    placeholder="Type a reply..."
                    rows={2}
                    value={dmReplyText}
                    onChange={(e) => setDmReplyText(e.target.value)}
                    disabled={dmReplySending || !conversationRecipientId}
                    className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    disabled={dmReplySending || !conversationRecipientId || aiReplyLoading}
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
                    className="p-3 rounded-xl bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 shrink-0 border border-indigo-200"
                    title="Generate reply with AI"
                  >
                    {aiReplyLoading ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} />}
                  </button>
                  <button
                  type="button"
                  disabled={dmReplySending || !dmReplyText.trim() || !conversationRecipientId}
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
                      setConversationMessages(res.data?.messages ?? []);
                      setConversationRecipientId(res.data?.recipientId ?? null);
                      setConversationMessagesError(res.data?.error ?? null);
                    } catch (e: unknown) {
                      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                      alert(msg ?? 'Failed to send message.');
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
              <p className="text-xs text-neutral-400 mt-2 text-center">Send a message to this conversation. Use the sparkle button to generate a reply with AI.</p>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
