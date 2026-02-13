'use client';

import React, { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useResolvedSelectedAccount } from '@/context/SelectedAccountContext';
import {
  BarChart3,
  Users,
  Image,
  Calendar,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';

function TikTokIcon({ size = 24 }: { size?: number }) {
  return <span className="font-bold text-neutral-800" style={{ fontSize: size }}>TT</span>;
}

function TwitterIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className="text-neutral-800">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <Instagram size={22} className="text-pink-600" />,
  FACEBOOK: <Facebook size={22} className="text-blue-600" />,
  TIKTOK: <TikTokIcon size={22} />,
  YOUTUBE: <Youtube size={22} className="text-red-600" />,
  TWITTER: <TwitterIcon size={22} />,
  LINKEDIN: <Linkedin size={22} className="text-blue-700" />,
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
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const accounts = cachedAccounts as { id: string; platform: string; username?: string; profilePicture?: string | null; platformUserId?: string }[];
  const POSTS_PER_PAGE = 5;
  const connectedPlatforms = accounts.map((a) => a.platform);
  const hasFacebook = connectedPlatforms.includes('FACEBOOK');
  const hasInstagram = connectedPlatforms.includes('INSTAGRAM');
  const totalInteractions = importedPosts.reduce((s, p) => s + (p.interactions || 0), 0);
  const paginatedPosts = importedPosts.filter((p) => !postsSearch || (p.content?.toLowerCase().includes(postsSearch.toLowerCase())));
  const totalPostsPages = Math.max(1, Math.ceil(paginatedPosts.length / POSTS_PER_PAGE));
  const currentPagePosts = paginatedPosts.slice((postsPage - 1) * POSTS_PER_PAGE, postsPage * POSTS_PER_PAGE);

  useEffect(() => {
    if (cachedAccounts.length > 0) return;
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
    }).catch(() => {});
  }, [cachedAccounts.length, setCachedAccounts]);

  useEffect(() => {
    if (activeTab !== 'posts' || !selectedAccount?.id) return;
    api.get(`/social/accounts/${selectedAccount.id}/posts`)
      .then((res) => setImportedPosts(res.data?.posts ?? []))
      .catch(() => setImportedPosts([]));
  }, [activeTab, selectedAccount?.id]);

  return (
    <div className="space-y-6">
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-neutral-500">Followers</p>
                      <p className="text-3xl font-bold text-neutral-900 mt-1">0</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">Facebook</span>}
                      {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">Instagram</span>}
                    </div>
                  </div>
                  <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl flex items-center justify-center" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                    <div className="flex items-end gap-1 h-full w-full p-4 pb-2">
                      {[28, 35, 42, 38, 45].map((pct, i) => (
                        <div key={i} className="flex-1 bg-neutral-200/60 rounded-t min-h-[20%]" style={{ height: `${pct}%` }} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 px-1">Jan 14 – Feb 10</p>
                </div>
                <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-neutral-500">Impressions</p>
                      <p className="text-3xl font-bold text-neutral-900 mt-1">0</p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">Facebook</span>}
                      {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">Instagram</span>}
                    </div>
                  </div>
                  <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                    <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl flex items-center justify-center" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                    <div className="flex items-end gap-1 h-full w-full p-4 pb-2">
                      {[32, 40, 35, 48, 42].map((pct, i) => (
                        <div key={i} className="flex-1 bg-neutral-200/60 rounded-t min-h-[20%]" style={{ height: `${pct}%` }} />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-neutral-400 mt-1 px-1">Jan 14 – Feb 10</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'posts' && (
            <div className="space-y-6">
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-700">Interactions</p>
                    <span className="text-2xl font-bold text-neutral-900">{totalInteractions}</span>
                    <div className="w-16 h-2 rounded-full bg-pink-200 overflow-hidden"><div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(100, totalInteractions * 20)}%` }} /></div>
                  </div>
                  <div className="flex gap-1.5">
                    {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{importedPosts.filter((p) => p.platform === 'FACEBOOK').reduce((s, p) => s + p.interactions, 0)} Facebook</span>}
                    {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{importedPosts.filter((p) => p.platform === 'INSTAGRAM').reduce((s, p) => s + p.interactions, 0)} Instagram</span>}
                  </div>
                </div>
                <div className="mt-4 h-24 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-xl" style={{ transform: 'rotate(-15deg)' }}>agent4socials</div>
                </div>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-700">Number of posts</p>
                    <span className="text-2xl font-bold text-neutral-900">{importedPosts.length}</span>
                  </div>
                  <div className="flex gap-1.5">
                    {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{importedPosts.filter((p) => p.platform === 'FACEBOOK').length} Facebook</span>}
                    {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{importedPosts.filter((p) => p.platform === 'INSTAGRAM').length} Instagram</span>}
                  </div>
                </div>
                <div className="mt-4 h-24 rounded-lg bg-neutral-50 border border-neutral-100 relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-xl" style={{ transform: 'rotate(-15deg)' }}>agent4socials</div>
                </div>
              </div>
              <div>
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
                        setPostsPage(1);
                      } catch (_) {
                        setImportedPosts([]);
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
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Impressions</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Interactions</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Network</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Date</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Type</th>
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
                              <td className="px-4 py-3 text-sm text-neutral-600">{post.interactions}</td>
                              <td className="px-4 py-3">{PLATFORM_ICON[post.platform]}</td>
                              <td className="px-4 py-3 text-sm text-neutral-600">{new Date(post.publishedAt).toLocaleString()}</td>
                              <td className="px-4 py-3 text-sm text-neutral-500">{post.mediaType || '–'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50/50 text-sm text-neutral-600">
                        <span>Items per page: {POSTS_PER_PAGE}</span>
                        <span>{(postsPage - 1) * POSTS_PER_PAGE + 1}–{Math.min(postsPage * POSTS_PER_PAGE, paginatedPosts.length)} of {paginatedPosts.length}</span>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setPostsPage((p) => Math.max(1, p - 1))} disabled={postsPage <= 1} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">←</button>
                          <button type="button" onClick={() => setPostsPage((p) => Math.min(totalPostsPages, p + 1))} disabled={postsPage >= totalPostsPages} className="p-1.5 rounded hover:bg-neutral-200 disabled:opacity-50">→</button>
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
