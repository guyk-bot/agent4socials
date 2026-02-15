'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  MessageCircle,
  Plus,
  Search,
  Check,
  Send,
  Image as ImageIcon,
  Smile,
  Building2,
  Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORMS = [
  { id: 'INSTAGRAM', label: 'Instagram', icon: InstagramIcon },
  { id: 'FACEBOOK', label: 'Facebook', icon: FacebookIcon },
  { id: 'TIKTOK', label: 'TikTok', icon: TikTokIcon },
  { id: 'YOUTUBE', label: 'YouTube', icon: YoutubeIcon },
  { id: 'TWITTER', label: 'X (Twitter)', icon: XTwitterIcon, color: 'text-neutral-800' },
  { id: 'GMB', label: 'Google Business', icon: Building2, color: 'text-green-600', comingSoon: true },
  { id: 'LINKEDIN', label: 'LinkedIn', icon: LinkedinIcon, comingSoon: true },
] as const;

type Account = { id: string; platform: string; username?: string | null };
type Conversation = { id: string; updatedTime: string | null; senders: Array<{ username?: string; name?: string }> };

export default function InboxPage() {
  const searchParams = useSearchParams();
  const platformFromUrl = searchParams.get('platform')?.toUpperCase();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [inboxFilter, setInboxFilter] = useState<'unresolved' | 'unread'>('unresolved');
  const [searchQuery, setSearchQuery] = useState('');
  const [connectOpen, setConnectOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const connectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setAccounts(data);
    }).catch(() => setAccounts([]));
  }, []);

  useEffect(() => {
    if (platformFromUrl && PLATFORMS.some((p) => p.id === platformFromUrl && p.id !== 'GMB' && p.id !== 'LINKEDIN')) {
      setSelectedPlatform(platformFromUrl);
    }
  }, [platformFromUrl]);

  useEffect(() => {
    if (!selectedPlatform || (selectedPlatform !== 'INSTAGRAM' && selectedPlatform !== 'FACEBOOK')) {
      setConversations([]);
      setConversationsError(null);
      return;
    }
    const account = accounts.find((a) => a.platform === selectedPlatform);
    if (!account) {
      setConversations([]);
      setConversationsError(`Connect a ${selectedPlatform === 'INSTAGRAM' ? 'Instagram' : 'Facebook'} account from the Dashboard to see conversations here.`);
      return;
    }
    setConversationsLoading(true);
    setConversationsError(null);
    api.get(`/social/accounts/${account.id}/conversations`)
      .then((res) => {
        setConversations(res.data?.conversations ?? []);
        setConversationsError(res.data?.error ?? null);
      })
      .catch(() => {
        setConversations([]);
        setConversationsError('Could not load conversations.');
      })
      .finally(() => setConversationsLoading(false));
  }, [selectedPlatform, accounts]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) setConnectOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handlePlatformClick = (platformId: string) => {
    if (platformId === 'GMB' || platformId === 'LINKEDIN') return;
    setSelectedPlatform(platformId);
    setSelectedConversationId(null);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-white">
      {/* Left sidebar - Metricool style */}
      <div className="w-80 border-r border-neutral-200 flex flex-col shrink-0 bg-white">
        {/* Platform icons + Connect */}
        <div className="p-3 border-b border-neutral-100">
          <div className="flex items-center gap-2 flex-wrap">
            {PLATFORMS.filter((p) => p.id !== 'GMB' && p.id !== 'LINKEDIN').map((p) => {
              const Icon = p.icon;
              const isSelected = selectedPlatform === p.id;
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
                  <Icon size={22} className={p.color} />
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
                  {PLATFORMS.map((p) => {
                    const Icon = p.icon;
                    const isComingSoon = p.id === 'GMB' || p.id === 'LINKEDIN';
                    return (
                      <Link
                        key={p.id}
                        href={isComingSoon ? '#' : '/dashboard'}
                        onClick={(e) => {
                          if (isComingSoon) e.preventDefault();
                          setConnectOpen(false);
                        }}
                        className={`flex items-center gap-3 px-3 py-2.5 text-sm transition-colors ${
                          isComingSoon ? 'text-neutral-400 cursor-default' : 'text-neutral-700 hover:bg-neutral-50'
                        }`}
                      >
                        <Icon size={20} className={`shrink-0 ${p.color}`} />
                        <span className="flex-1">Connect a {p.label} account</span>
                        {isComingSoon && (
                          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded">Coming soon</span>
                        )}
                      </Link>
                    );
                  })}
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
              placeholder="Search conversation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-neutral-200 rounded-lg text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Unresolved / Unread */}
        <div className="flex border-b border-neutral-200">
          <button
            type="button"
            onClick={() => setInboxFilter('unresolved')}
            className={`flex-1 py-3 text-sm font-medium ${inboxFilter === 'unresolved' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Unresolved
          </button>
          <button
            type="button"
            onClick={() => setInboxFilter('unread')}
            className={`flex-1 py-3 text-sm font-medium ${inboxFilter === 'unread' ? 'text-neutral-900 border-b-2 border-neutral-900' : 'text-neutral-500 border-b-2 border-transparent hover:text-neutral-700'}`}
          >
            Unread
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {!selectedPlatform ? (
            <div className="p-6 text-center">
              <MessageCircle size={40} className="mx-auto text-neutral-300 mb-3" />
              <p className="text-sm text-neutral-500">Click a platform icon above to open its inbox.</p>
            </div>
          ) : conversationsLoading ? (
            <div className="p-6 flex flex-col items-center justify-center gap-3">
              <Loader2 size={32} className="text-indigo-500 animate-spin" />
              <p className="text-sm text-neutral-500">Loading conversations…</p>
            </div>
          ) : conversationsError ? (
            <div className="p-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                {conversationsError}
              </div>
              <p className="text-xs text-neutral-500 mt-3 text-center">Connect from the Dashboard and ensure messaging permissions are granted.</p>
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
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedConversationId(c.id)}
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

      {/* Main content - conversation view */}
      <div className="flex-1 flex flex-col min-w-0 bg-neutral-50/50">
        {!selectedPlatform ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-sm">
              <MessageCircle size={64} className="mx-auto text-neutral-300 mb-4" />
              <h2 className="text-lg font-semibold text-neutral-800">Open an inbox</h2>
              <p className="text-sm text-neutral-500 mt-2">
                Click an Instagram, Facebook, TikTok, YouTube, or X icon in the left sidebar to view that platform&apos;s conversations.
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
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-neutral-100 bg-neutral-50/50">
                    <p className="text-sm font-medium text-neutral-800">Conversation thread</p>
                    <p className="text-xs text-neutral-500 mt-0.5">Unified inbox — reply below when the API is connected.</p>
                  </div>
                  <div className="p-6 min-h-[200px]">
                    <p className="text-sm text-neutral-500 italic">No messages loaded yet. Connect your accounts and enable the Inbox API to see and reply to conversations here.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-neutral-200 bg-white p-4">
              <div className="max-w-2xl mx-auto flex items-end gap-2">
                <button type="button" className="p-2 rounded-lg border border-neutral-200 text-neutral-400 hover:bg-neutral-50" title="Add image">
                  <ImageIcon size={20} />
                </button>
                <button type="button" className="p-2 rounded-lg border border-neutral-200 text-neutral-400 hover:bg-neutral-50" title="Emoji">
                  <Smile size={20} />
                </button>
                <textarea
                  placeholder="Type a reply..."
                  rows={2}
                  className="flex-1 px-4 py-3 border border-neutral-200 rounded-xl text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 resize-none"
                  disabled
                />
                <button
                  type="button"
                  disabled
                  className="p-3 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Send (⇧ + Enter)"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-xs text-neutral-400 mt-2 text-center">Send (⇧ + Enter)</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
