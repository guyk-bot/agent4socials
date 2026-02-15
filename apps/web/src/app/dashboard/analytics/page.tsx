'use client';

import React, { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useResolvedSelectedAccount } from '@/context/SelectedAccountContext';
import {
  BarChart3,
  Users,
  Image,
  Calendar,
  RefreshCw,
  ExternalLink,
  Star,
  MoreVertical,
  HelpCircle,
  ArrowUpDown,
} from 'lucide-react';
import Link from 'next/link';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={22} />,
  FACEBOOK: <FacebookIcon size={22} />,
  TIKTOK: <TikTokIcon size={22} />,
  YOUTUBE: <YoutubeIcon size={22} />,
  TWITTER: <XTwitterIcon size={22} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={22} />,
};

function profileUrlForAccount(account: { platform: string; username?: string | null; platformUserId?: string }): string {
  const platform = (account.platform || '').toUpperCase();
  const username = account.username?.trim();
  const pid = account.platformUserId;
  if (platform === 'INSTAGRAM' && username) return `https://instagram.com/${username.replace(/^@/, '')}`;
  if (platform === 'FACEBOOK' && pid) return `https://www.facebook.com/${pid}`;
  if (platform === 'TIKTOK' && username) return `https://www.tiktok.com/@${username.replace(/^@/, '')}`;
  if (platform === 'YOUTUBE') return 'https://www.youtube.com';
  if (platform === 'TWITTER' && username) return `https://x.com/${username.replace(/^@/, '')}`;
  if (platform === 'LINKEDIN') return 'https://www.linkedin.com';
  return '#';
}

const TABS = [
  { id: 'account', label: 'ACCOUNT', icon: BarChart3 },
  { id: 'posts', label: 'POSTS', icon: Image },
];

export default function AnalyticsPage() {
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const selectedAccount = useResolvedSelectedAccount(cachedAccounts as { id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[]);
  const [activeTab, setActiveTab] = useState('account');
  const [importedPosts, setImportedPosts] = useState<Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>([]);
  const [importedPostsLoading, setImportedPostsLoading] = useState(false);
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState('');
  const [postsPerPage, setPostsPerPage] = useState(5);
  const [sortBy, setSortBy] = useState<'date' | 'impressions' | 'interactions'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [insights, setInsights] = useState<{ platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number; insightsHint?: string } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [postsSyncError, setPostsSyncError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const accounts = cachedAccounts as { id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[];
  const connectedPlatforms = accounts.map((a) => a.platform);
  const hasFacebook = connectedPlatforms.includes('FACEBOOK');
  const hasInstagram = connectedPlatforms.includes('INSTAGRAM');
  const totalInteractions = importedPosts.reduce((s, p) => s + (p.interactions || 0), 0);
  const filteredPosts = importedPosts.filter((p) => !postsSearch || (p.content?.toLowerCase().includes(postsSearch.toLowerCase())));
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'date') return sortDesc ? new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime() : new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
    if (sortBy === 'impressions') return sortDesc ? (b.impressions ?? 0) - (a.impressions ?? 0) : (a.impressions ?? 0) - (b.impressions ?? 0);
    return sortDesc ? (b.interactions ?? 0) - (a.interactions ?? 0) : (a.interactions ?? 0) - (b.interactions ?? 0);
  });
  const totalPostsPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const currentPagePosts = sortedPosts.slice((postsPage - 1) * postsPerPage, postsPage * postsPerPage);
  const maxImpressions = insights?.impressionsTimeSeries?.length ? Math.max(...insights.impressionsTimeSeries.map((d) => d.value), 1) : 1;
  const hasFbOrIg = connectedPlatforms.includes('FACEBOOK') || connectedPlatforms.includes('INSTAGRAM');
  const showReconnectBanner = hasFbOrIg && (insights?.insightsHint || postsSyncError);

  useEffect(() => {
    if (cachedAccounts.length > 0) return;
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
    }).catch(() => {});
  }, [cachedAccounts.length, setCachedAccounts]);

  const postsCacheRef = useRef<Record<string, Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>>({});

  // Load posts whenever an account is selected (so ACCOUNT tab shows Total content and POSTS tab has data).
  useEffect(() => {
    if (!selectedAccount?.id) return;
    const cached = postsCacheRef.current[selectedAccount.id];
    if (cached) {
      setImportedPosts(cached);
      setImportedPostsLoading(false);
    } else {
      setImportedPosts([]);
      setImportedPostsLoading(true);
    }
    const syncFirst = !cached;
    api.get(`/social/accounts/${selectedAccount.id}/posts`, { params: syncFirst ? { sync: 1 } : {} })
      .then((res) => {
        const list = res.data?.posts ?? [];
        postsCacheRef.current[selectedAccount.id] = list;
        setImportedPosts(list);
        setPostsSyncError(res.data?.syncError ?? null);
      })
      .catch(() => { setImportedPosts([]); setPostsSyncError(null); })
      .finally(() => setImportedPostsLoading(false));
  }, [selectedAccount?.id]);

  const insightsCacheRef = useRef<Record<string, { platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number; insightsHint?: string }>>({});

  useEffect(() => {
    if (activeTab !== 'account' || !selectedAccount?.id || !dateRange.start || !dateRange.end) return;
    const cacheKey = `${selectedAccount.id}-${dateRange.start}-${dateRange.end}`;
    const cached = insightsCacheRef.current[cacheKey];
    if (cached) {
      setInsights(cached);
      setInsightsLoading(false);
      return;
    }
    setInsights(null);
    setInsightsLoading(true);
    api.get(`/social/accounts/${selectedAccount.id}/insights`, { params: { since: dateRange.start, until: dateRange.end } })
      .then((res) => {
        const data = res.data ?? null;
        if (data) insightsCacheRef.current[cacheKey] = data;
        setInsights(data);
      })
      .catch(() => setInsights(null))
      .finally(() => setInsightsLoading(false));
  }, [activeTab, selectedAccount?.id, dateRange.start, dateRange.end]);

  return (
    <div className="space-y-6">
      {showReconnectBanner && (
        <div className="rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-4">
          <p className="text-sm font-medium text-indigo-900">To see analytics, posts, and inbox like Metricool, reconnect and choose your Page.</p>
          <p className="text-xs text-indigo-700 mt-1">Click the button below, sign in with Facebook when asked, then select your Page.</p>
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
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-neutral-900">Analytics</h1>
          <p className="text-neutral-500 mt-1">View performance for your connected accounts.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg">
            <Calendar size={18} className="text-neutral-500" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))}
              className="text-sm text-neutral-700 border-0 bg-transparent focus:ring-0 p-0"
            />
            <span className="text-neutral-400">–</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))}
              className="text-sm text-neutral-700 border-0 bg-transparent focus:ring-0 p-0"
            />
          </div>
        </div>
      </div>

      {!selectedAccount ? (
        <div className="card border-2 border-dashed border-neutral-200 bg-neutral-50/50 flex flex-col items-center justify-center py-16 text-center">
          <BarChart3 size={48} className="text-neutral-300 mb-4" />
          <h2 className="text-lg font-semibold text-neutral-700">Select an account</h2>
          <p className="text-sm text-neutral-500 mt-2 max-w-md">
            Choose a connected account from the left sidebar to view its analytics here.
          </p>
          <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors">
            Go to Dashboard
          </Link>
        </div>
      ) : (
        <>
          {/* Top row: ACCOUNT | POSTS + date range (Metricool-style) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-neutral-200">
            <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg w-fit">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${activeTab === tab.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-600 hover:bg-white/70'}`}
                >
                  <tab.icon size={18} />
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg shrink-0">
              <Calendar size={16} className="text-neutral-500" />
              <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))} className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-neutral-700 w-[7.5rem]" />
              <span className="text-neutral-400">–</span>
              <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))} className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-neutral-700 w-[7.5rem]" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm text-amber-800">You need an upgraded plan to view data older than 30 days and without a watermark.</p>
            <Link href="/pricing" className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Upgrade your plan</Link>
          </div>

          <a
            href={profileUrlForAccount(selectedAccount)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-3 bg-white rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50 transition-colors w-fit"
          >
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden shrink-0">
              {selectedAccount.profilePicture ? (
                <img src={selectedAccount.profilePicture} alt="" className="w-full h-full object-cover" />
              ) : (
                PLATFORM_ICON[selectedAccount.platform]
              )}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{selectedAccount.username || selectedAccount.platform}</p>
              <p className="text-sm text-neutral-500">{selectedAccount.platform} · Open profile</p>
            </div>
          </a>

          {activeTab === 'account' && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-neutral-900">Account</h2>
              {insightsLoading && <p className="text-sm text-neutral-500">Loading analytics…</p>}
              {insights?.insightsHint && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{insights.insightsHint}</p>
                  {(selectedAccount?.platform === 'INSTAGRAM' || selectedAccount?.platform === 'FACEBOOK') && (
                    <p className="mt-2 text-xs text-amber-700">Use Reconnect in the left sidebar for this account, then choose your Page when asked.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                  <p className="text-sm font-medium text-neutral-500">Followers</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-3xl font-bold text-neutral-900">{insights?.followers ?? 0}</span>
                    <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, ((insights?.followers ?? 0) / 2000) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {selectedAccount?.platform === 'INSTAGRAM' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{insights?.followers ?? 0} Instagram</span>}
                    {selectedAccount?.platform === 'FACEBOOK' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{insights?.followers ?? 0} Facebook</span>}
                  </div>
                  <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                    {insights?.impressionsTimeSeries?.length ? (
                      <div className="flex items-end gap-0.5 h-full w-full p-4 pb-2">
                        {insights.impressionsTimeSeries.map((d) => (
                          <div key={d.date} className="flex-1 bg-indigo-200/80 rounded-t min-h-[4px]" style={{ height: `${(d.value / maxImpressions) * 100}%` }} title={`${d.date}: ${d.value}`} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-end gap-1 h-full w-full p-4 pb-2">
                        {[28, 35, 42, 38, 45].map((pct, i) => (
                          <div key={i} className="flex-1 bg-neutral-200/60 rounded-t min-h-[20%]" style={{ height: `${pct}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 px-1">{dateRange.start} – {dateRange.end}</p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                  <p className="text-sm font-medium text-neutral-500">Views</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-3xl font-bold text-neutral-900">{insights?.impressionsTotal ?? 0}</span>
                    <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                      <div className="h-full rounded-full bg-indigo-500" style={{ width: `${insights?.impressionsTotal ? Math.min(100, (insights.impressionsTotal / 50)) : 0}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1.5 mt-3 flex-wrap">
                    {selectedAccount?.platform === 'FACEBOOK' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{insights?.impressionsTotal ?? 0} Facebook</span>}
                    {selectedAccount?.platform === 'INSTAGRAM' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{insights?.impressionsTotal ?? 0} Instagram</span>}
                  </div>
                  <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                    {insights?.impressionsTimeSeries?.length ? (
                      <div className="flex items-end gap-0.5 h-full w-full p-4 pb-2">
                        {insights.impressionsTimeSeries.map((d) => (
                          <div key={d.date} className="flex-1 bg-indigo-200/80 rounded-t min-h-[4px]" style={{ height: `${(d.value / maxImpressions) * 100}%` }} title={`${d.date}: ${d.value}`} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-end gap-1 h-full w-full p-4 pb-2">
                        {[32, 40, 35, 48, 42].map((pct, i) => (
                          <div key={i} className="flex-1 bg-neutral-200/60 rounded-t min-h-[20%]" style={{ height: `${pct}%` }} />
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 px-1">{dateRange.start} – {dateRange.end}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {selectedAccount?.platform === 'INSTAGRAM' ? (
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-neutral-500">Profile views</p>
                    <p className="text-xl font-bold text-neutral-900 mt-0.5">{insights?.profileViewsTotal ?? '—'}</p>
                  </div>
                ) : (
                  <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-neutral-500">Page visits</p>
                    <p className="text-xl font-bold text-neutral-900 mt-0.5">{insights?.pageViewsTotal ?? '—'}</p>
                  </div>
                )}
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-neutral-500">Reach</p>
                  <p className="text-xl font-bold text-neutral-900 mt-0.5">{insights?.reachTotal ?? '—'}</p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-neutral-500">Total content</p>
                  <p className="text-xl font-bold text-neutral-900 mt-0.5">{importedPosts.length}</p>
                </div>
              </div>
              {(() => {
                const start = dateRange.start ? new Date(dateRange.start) : null;
                const end = dateRange.end ? new Date(dateRange.end) : null;
                const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;
                const weeks = days ? days / 7 : 0;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-medium text-neutral-500">Average daily new followers</p>
                      <p className="text-lg font-semibold text-neutral-700 mt-0.5">—</p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-medium text-neutral-500">Daily page views</p>
                      <p className="text-lg font-semibold text-neutral-700 mt-0.5">
                        {days && selectedAccount?.platform === 'INSTAGRAM' && insights?.profileViewsTotal != null
                          ? (insights.profileViewsTotal / days).toFixed(2)
                          : days && insights?.pageViewsTotal != null
                            ? (insights.pageViewsTotal / days).toFixed(2)
                            : '—'}
                      </p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-medium text-neutral-500">Daily posts</p>
                      <p className="text-lg font-semibold text-neutral-700 mt-0.5">{days ? (importedPosts.length / days).toFixed(2) : '—'}</p>
                    </div>
                    <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                      <p className="text-xs font-medium text-neutral-500">Posts per week</p>
                      <p className="text-lg font-semibold text-neutral-700 mt-0.5">{weeks ? (importedPosts.length / weeks).toFixed(2) : '—'}</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm font-medium text-neutral-700">Interactions</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-bold text-neutral-900">{totalInteractions}</span>
                  <div className="flex-1 h-2 max-w-[100px] rounded-full bg-pink-200 overflow-hidden">
                    <div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(100, totalInteractions * 25)}%` }} />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{importedPosts.filter((p) => p.platform === 'INSTAGRAM').reduce((s, p) => s + p.interactions, 0)} Instagram</span>}
                  {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{importedPosts.filter((p) => p.platform === 'FACEBOOK').reduce((s, p) => s + p.interactions, 0) || '—'} Facebook</span>}
                </div>
                <div className="mt-4 h-24 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-xl" style={{ transform: 'rotate(-15deg)' }}>agent4socials</div>
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm font-medium text-neutral-700">Number of posts</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-2xl font-bold text-neutral-900">{importedPosts.length}</span>
                  <div className="flex-1 h-2 max-w-[100px] rounded-full bg-neutral-200 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: importedPosts.length ? `${Math.min(100, importedPosts.length * 20)}%` : '0%' }} />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{importedPosts.filter((p) => p.platform === 'FACEBOOK').length} Facebook</span>}
                  {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{importedPosts.filter((p) => p.platform === 'INSTAGRAM').length} Instagram</span>}
                </div>
                <div className="mt-4 h-24 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-xl" style={{ transform: 'rotate(-15deg)' }}>agent4socials</div>
                </div>
              </div>
              <div>
                {postsSyncError && (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <p>{postsSyncError}</p>
                    <p className="mt-2 text-xs text-amber-700">Use Reconnect in the left sidebar for this account, then choose your Page when asked.</p>
                  </div>
                )}
                <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
                  <h3 className="text-sm font-semibold text-neutral-800">List of posts</h3>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!selectedAccount?.id) return;
                      setImportedPostsLoading(true);
                      try {
                        const res = await api.get(`/social/accounts/${selectedAccount.id}/posts`, { params: { sync: 1 } });
                        setImportedPosts(res.data?.posts ?? []);
                        setPostsSyncError(res.data?.syncError ?? null);
                        setPostsPage(1);
                      } catch (_) {
                        setImportedPosts([]);
                        setPostsSyncError(null);
                      } finally {
                        setImportedPostsLoading(false);
                      }
                    }}
                    disabled={importedPostsLoading}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={importedPostsLoading ? 'animate-spin' : ''} />
                    {importedPostsLoading ? 'Syncing…' : 'Sync posts'}
                  </button>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center gap-2 p-3 border-b border-neutral-200 flex-wrap">
                    <input type="search" placeholder="Search" value={postsSearch} onChange={(e) => { setPostsSearch(e.target.value); setPostsPage(1); }} className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-48" />
                    <button type="button" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 inline-flex items-center gap-1.5">Download CSV</button>
                    <button type="button" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 inline-flex items-center gap-1.5">Columns</button>
                  </div>
                  {importedPosts.length === 0 && !importedPostsLoading ? (
                    <div className="p-12 text-center">
                      <Image size={48} className="mx-auto text-neutral-300 mb-4" />
                      <p className="text-sm text-neutral-500">No posts loaded. Click &quot;Sync posts&quot; to import from {selectedAccount?.platform}.</p>
                    </div>
                  ) : (
                    <>
                      <table className="min-w-full divide-y divide-neutral-200">
                        <thead className="bg-neutral-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Content</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                              <span className="inline-flex items-center gap-1">Reach
                                <button type="button" onClick={() => { setSortBy('impressions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200"><ArrowUpDown size={14} /></button>
                              </span>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                              <span className="inline-flex items-center gap-1">Views
                                <span title="Number of times this post was shown" className="text-neutral-400 cursor-help"><HelpCircle size={14} /></span>
                                <button type="button" onClick={() => { setSortBy('impressions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200"><ArrowUpDown size={14} /></button>
                              </span>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Reactions</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Comments</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Shares</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                              <span className="inline-flex items-center gap-1">Interactions
                                <button type="button" onClick={() => { setSortBy('interactions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200"><ArrowUpDown size={14} /></button>
                              </span>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Network</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                              <span className="inline-flex items-center gap-1">Date
                                <button type="button" onClick={() => { setSortBy('date'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200"><ArrowUpDown size={14} /></button>
                              </span>
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
                            <th className="px-4 py-3 w-20" />
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-neutral-200">
                          {currentPagePosts.map((post) => (
                            <tr key={post.id} className="hover:bg-neutral-50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  {post.thumbnailUrl ? (
                                    <img src={post.thumbnailUrl} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
                                  ) : (
                                    <div className="w-12 h-12 rounded bg-neutral-100 flex items-center justify-center shrink-0">{PLATFORM_ICON[post.platform]}</div>
                                  )}
                                  <div className="min-w-0 max-w-xs">
                                    <p className="text-sm text-neutral-900 truncate">{post.content || 'Without text'}</p>
                                    {post.permalinkUrl && (
                                      <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5">Open <ExternalLink size={12} /></a>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{post.impressions}</td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{post.impressions}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{(post as { reactions?: number }).reactions ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{(post as { comments?: number }).comments ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{(post as { shares?: number }).shares ?? '—'}</td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{post.interactions}</td>
                              <td className="px-4 py-3">{PLATFORM_ICON[post.platform]}</td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{new Date(post.publishedAt).toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{post.mediaType || '–'}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1">
                                  <button type="button" className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-amber-500" title="Save"><Star size={16} /></button>
                                  <button type="button" className="p-1.5 rounded hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600" title="More"><MoreVertical size={16} /></button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50/50 text-sm text-neutral-600 flex-wrap gap-2">
                        <span className="inline-flex items-center gap-2">
                          Items per page:
                          <select value={postsPerPage} onChange={(e) => { setPostsPerPage(Number(e.target.value)); setPostsPage(1); }} className="border border-neutral-200 rounded px-2 py-1 text-neutral-700 bg-white">
                            {[5, 10, 25].map((n) => (<option key={n} value={n}>{n}</option>))}
                          </select>
                        </span>
                        <span>{(postsPage - 1) * postsPerPage + 1}–{Math.min(postsPage * postsPerPage, sortedPosts.length)} of {sortedPosts.length}</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setPostsPage(1)} disabled={postsPage <= 1} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">«</button>
                          <button type="button" onClick={() => setPostsPage((p) => Math.max(1, p - 1))} disabled={postsPage <= 1} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">←</button>
                          <button type="button" onClick={() => setPostsPage((p) => Math.min(totalPostsPages, p + 1))} disabled={postsPage >= totalPostsPages} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">→</button>
                          <button type="button" onClick={() => setPostsPage(totalPostsPages)} disabled={postsPage >= totalPostsPages} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">»</button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
