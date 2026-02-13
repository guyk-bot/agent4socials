'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount, useResolvedSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import api from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { ConfirmModal } from '@/components/ConfirmModal';
import ConnectView from '@/components/dashboard/ConnectView';
import {
  Users,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  BarChart3,
  Image,
  Instagram,
  Youtube,
  Facebook,
  Linkedin,
  RefreshCw,
  ExternalLink,
  Star,
  MoreVertical,
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
  const pid = (account as { platformUserId?: string }).platformUserId;
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

export default function DashboardPage() {
  const { user } = useAuth();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const { selectedPlatformForConnect } = useSelectedAccount() ?? { selectedPlatformForConnect: null };
  const selectedAccount = useResolvedSelectedAccount(cachedAccounts as SocialAccount[]);

  const [stats, setStats] = useState({ accounts: 0, scheduled: 0, posted: 0, failed: 0 });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectingMethod, setConnectingMethod] = useState<string | undefined>(undefined);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState('account');
  const [importedPosts, setImportedPosts] = useState<Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>([]);
  const [importedPostsLoading, setImportedPostsLoading] = useState(false);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState('');

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/social/accounts');
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
      setStats((s) => ({ ...s, accounts: data.length }));
    } catch (_) {}
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const accountsRes = await api.get('/social/accounts').catch(() => ({ data: [] }));
        const accounts = Array.isArray(accountsRes.data) ? accountsRes.data : [];
        setCachedAccounts(accounts);
        setStats((s) => ({ ...s, accounts: accounts.length }));

        const postsRes = await api.get('/posts').catch(() => ({ data: [] }));
        const posts = Array.isArray(postsRes.data) ? postsRes.data : [];
        setStats((s) => ({
          ...s,
          scheduled: posts.filter((p: any) => p.status === 'SCHEDULED' || p.status === 'POSTING').length,
          posted: posts.filter((p: any) => p.status === 'POSTED').length,
          failed: posts.filter((p: any) => p.status === 'FAILED').length,
        }));
        setRecentPosts(posts.slice(0, 5));
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [setCachedAccounts]);

  useEffect(() => {
    if (analyticsTab !== 'posts' || !selectedAccount?.id) return;
    api.get(`/social/accounts/${selectedAccount.id}/posts`)
      .then((res) => setImportedPosts(res.data?.posts ?? []))
      .catch(() => setImportedPosts([]));
  }, [analyticsTab, selectedAccount?.id]);

  const handleConnect = async (platform: string, method?: string) => {
    const getMessage = (err: unknown): string | null => {
      if (!err || typeof err !== 'object' || !('response' in err)) return null;
      const res = (err as { response?: { data?: { message?: string } } }).response;
      return res?.data?.message ?? null;
    };
    setConnectingPlatform(platform);
    setConnectingMethod(method);
    try {
      await supabase.auth.getSession();
      await api.get('/auth/profile').catch(() => null);
      let res;
      try {
        res = await api.get(`/social/oauth/${platform}/start`, { params: method ? { method } : {} });
      } catch (firstErr: unknown) {
        if ((firstErr as { response?: { status?: number } })?.response?.status === 401) {
          await api.get('/auth/profile').catch(() => null);
          res = await api.get(`/social/oauth/${platform}/start`, { params: method ? { method } : {} });
        } else {
          throw firstErr;
        }
      }
      const url = res?.data?.url;
      if (url && typeof url === 'string') {
        window.location.href = url;
        return;
      }
      setAlertMessage('Invalid response from server. Check server logs.');
    } catch (err: unknown) {
      const msg = getMessage(err);
      if (msg) {
        if (msg.includes('META_APP_ID') || msg.includes('META_APP_SECRET')) {
          setAlertMessage('Instagram/Facebook: set META_APP_ID and META_APP_SECRET in Vercel → Environment Variables.');
        } else if (msg === 'Unauthorized') {
          setAlertMessage('Account not synced. Sign out, sign back in, then try Connect again.');
        } else {
          setAlertMessage(msg);
        }
      } else {
        setAlertMessage('Failed to start OAuth. Check Vercel → Logs.');
      }
    } finally {
      setConnectingPlatform(null);
      setConnectingMethod(undefined);
    }
  };

  if (selectedPlatformForConnect) {
    return (
      <>
        <ConfirmModal open={alertMessage !== null} onClose={() => setAlertMessage(null)} message={alertMessage ?? ''} variant="alert" confirmLabel="OK" />
        <ConnectView
          platform={selectedPlatformForConnect}
          onConnect={handleConnect}
          connecting={connectingPlatform !== null}
          connectingMethod={connectingMethod}
        />
      </>
    );
  }

  const connectedPlatforms = (cachedAccounts as SocialAccount[]).map((a) => a.platform);
  const hasFacebook = connectedPlatforms.includes('FACEBOOK');
  const hasInstagram = connectedPlatforms.includes('INSTAGRAM');
  const totalInteractions = importedPosts.reduce((s, p) => s + (p.interactions || 0), 0);
  const POSTS_PER_PAGE = 5;
  const paginatedPosts = importedPosts
    .filter((p) => !postsSearch || (p.content?.toLowerCase().includes(postsSearch.toLowerCase())));
  const totalPostsPages = Math.max(1, Math.ceil(paginatedPosts.length / POSTS_PER_PAGE));
  const currentPagePosts = paginatedPosts.slice((postsPage - 1) * POSTS_PER_PAGE, postsPage * POSTS_PER_PAGE);

  if (selectedAccount) {
    return (
      <div className="space-y-0">
        {/* Top row: ACCOUNT | POSTS tabs + date range (Metricool-style) */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-neutral-200">
          <div className="flex gap-1 p-1 bg-neutral-100 rounded-lg w-fit">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAnalyticsTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${analyticsTab === tab.id ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-600 hover:bg-white/70'}`}
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

        {/* Upgrade banner (Metricool-style) */}
        <div className="mt-4 flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">You need an upgraded plan to view data older than 30 days and without a watermark.</p>
          <Link href="/pricing" className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-600">Upgrade your plan</Link>
        </div>

        {/* Account block: clickable profile */}
        <div className="mt-6">
          <a
            href={profileUrlForAccount(selectedAccount)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex gap-3 p-3 bg-white rounded-xl border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/50 transition-colors w-fit"
          >
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center overflow-hidden shrink-0">
              {selectedAccount.profilePicture ? <img src={selectedAccount.profilePicture} alt="" className="w-full h-full object-cover" /> : PLATFORM_ICON[selectedAccount.platform]}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">{selectedAccount.username || selectedAccount.platform}</p>
              <p className="text-sm text-neutral-500">{selectedAccount.platform} · Open profile</p>
            </div>
          </a>
        </div>

        {analyticsTab === 'account' && (
          <div className="mt-6 space-y-6">
            <h2 className="text-lg font-semibold text-neutral-900">Account</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Followers card (Metricool Summary: number + bar, then platform buttons with count) */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm font-medium text-neutral-500">Followers</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-3xl font-bold text-neutral-900">0</span>
                  <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: '0%' }} />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">0 Instagram</span>}
                  {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">— Facebook</span>}
                </div>
                <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl flex items-center justify-center" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                  <div className="flex items-end gap-1 h-full w-full p-4 pb-2">
                    {[28, 35, 42, 38, 45].map((pct, i) => (
                      <div key={i} className="flex-1 bg-neutral-200/60 rounded-t min-h-[20%]" style={{ height: `${pct}%` }} />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-neutral-400 mt-1 px-1">Jan 14 – Feb 10</p>
              </div>
              {/* Impressions card */}
              <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
                <p className="text-sm font-medium text-neutral-500">Impressions</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-3xl font-bold text-neutral-900">0</span>
                  <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                    <div className="h-full rounded-full bg-indigo-500" style={{ width: '0%' }} />
                  </div>
                </div>
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {hasFacebook && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">0 Facebook</span>}
                  {hasInstagram && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">0 Instagram</span>}
                </div>
                <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center relative overflow-hidden">
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

        {analyticsTab === 'posts' && (
          <div className="mt-6 space-y-6">
            {/* Interactions widget (Metricool Summary: title, number + bar, platform buttons with count) */}
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
            {/* Number of posts widget */}
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

            {/* List of posts (Metricool-style): Search, Download CSV, Columns, table, pagination */}
            <div>
              <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
                <h3 className="text-sm font-semibold text-neutral-800">List of posts</h3>
                <div className="flex items-center gap-2 flex-wrap">
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
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 p-3 border-b border-neutral-200 flex-wrap">
                  <input
                    type="search"
                    placeholder="Search"
                    value={postsSearch}
                    onChange={(e) => { setPostsSearch(e.target.value); setPostsPage(1); }}
                    className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-48"
                  />
                  <button type="button" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 inline-flex items-center gap-1.5">
                    Download CSV
                  </button>
                  <button type="button" className="px-3 py-2 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 inline-flex items-center gap-1.5">
                    Columns
                  </button>
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
                                    <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                                      Open <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{post.impressions}</td>
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
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user?.name || 'there'}!</h1>
        <p className="text-gray-500">Select a platform from the left to connect or view analytics.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Accounts" value={stats.accounts} icon={<Users size={20} className="text-neutral-600" />} bg="bg-neutral-100" />
        <StatCard title="Scheduled" value={stats.scheduled} icon={<Calendar size={20} className="text-neutral-600" />} bg="bg-neutral-100" />
        <StatCard title="Posted" value={stats.posted} icon={<CheckCircle size={20} className="text-neutral-600" />} bg="bg-neutral-100" />
        <StatCard title="Failed" value={stats.failed} icon={<AlertCircle size={20} className="text-red-500" />} bg="bg-red-50" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">Recent Posts</h2>
            <Link href="/composer" className="btn-primary flex items-center space-x-2 text-sm">
              <Plus size={18} />
              <span>Create Post</span>
            </Link>
          </div>
          <div className="card !p-0 overflow-hidden">
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading posts...</div>
            ) : recentPosts.length > 0 ? (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platforms</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Schedule</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {recentPosts.map((post: any) => (
                    <tr key={post.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4"><div className="text-sm font-medium text-gray-900 truncate max-w-xs">{post.title || post.content}</div></td>
                      <td className="px-6 py-4">
                        <div className="flex -space-x-2">
                          {post.targets?.map((t: any) => (
                            <div key={t.id} title={t.platform} className="w-8 h-8 rounded-full border-2 border-white bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">{t.platform?.[0]}</div>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${post.status === 'POSTED' ? 'bg-green-100 text-green-800' : post.status === 'FAILED' ? 'bg-red-100 text-red-800' : 'bg-indigo-100 text-indigo-800'}`}>{post.status}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{post.scheduledAt ? new Date(post.scheduledAt).toLocaleDateString() : 'Draft'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-12 text-center">
                <Clock size={48} className="mx-auto text-gray-400 mb-4" strokeWidth={1} />
                <h3 className="text-lg font-medium text-gray-900">No posts yet</h3>
                <p className="text-gray-500 mt-1">Start by creating your first scheduled post.</p>
                <Link href="/composer" className="btn-primary mt-6 inline-block">Create First Post</Link>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <h2 className="text-xl font-semibold text-gray-900">Quick start</h2>
          <div className="card space-y-4">
            <p className="text-sm text-gray-500">Select a platform from the left sidebar to connect an account or view its analytics.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, bg }: { title: string; value: number; icon: React.ReactNode; bg: string }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        <div className={`p-3 rounded-xl ${bg}`}>{icon}</div>
      </div>
    </div>
  );
}
