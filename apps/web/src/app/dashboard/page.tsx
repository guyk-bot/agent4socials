'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const { selectedPlatformForConnect, clearSelection } = useSelectedAccount() ?? { selectedPlatformForConnect: null, clearSelection: () => {} };
  const selectedAccount = useResolvedSelectedAccount(cachedAccounts as SocialAccount[]);
  const [justConnected, setJustConnected] = useState(false);
  const connectingParam = searchParams.get('connecting');

  const [stats, setStats] = useState({ accounts: 0, scheduled: 0, posted: 0, failed: 0 });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectingMethod, setConnectingMethod] = useState<string | undefined>(undefined);
  const [oauthRedirectUrl, setOauthRedirectUrl] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState('account');
  const [importedPosts, setImportedPosts] = useState<Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>([]);
  const [importedPostsLoading, setImportedPostsLoading] = useState(false);
  const [postsSyncError, setPostsSyncError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState('');
  const [postsPerPage, setPostsPerPage] = useState(5);
  const [insights, setInsights] = useState<{ platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number; insightsHint?: string } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'impressions' | 'interactions'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [aggregatedInsights, setAggregatedInsights] = useState<{
    totalFollowers: number;
    totalImpressions: number;
    byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }>;
    combinedTimeSeries: Array<{ date: string; value: number }>;
  } | null>(null);
  const [aggregatedLoading, setAggregatedLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const accounts = (cachedAccounts as SocialAccount[]) ?? [];
  const hasAccounts = accounts.length > 0;

  const fetchAccounts = async () => {
    try {
      const res = await api.get('/social/accounts');
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
      setStats((s) => ({ ...s, accounts: data.length }));
    } catch (_) {}
  };

  useEffect(() => {
    if (connectingParam !== '1') return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    fetchAccounts().then(() => {
      router.replace('/dashboard', { scroll: false });
      setJustConnected(true);
      timeoutId = setTimeout(() => setJustConnected(false), 5000);
    }).catch(() => router.replace('/dashboard', { scroll: false }));
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [connectingParam, router]);

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

  const postsCacheRef = useRef<Record<string, Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>>({});

  useEffect(() => {
    if (selectedAccount?.id) {
      if (analyticsTab === 'posts') {
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
      }
      return;
    }
    if (!hasAccounts) {
      setImportedPosts([]);
      return;
    }
    if (analyticsTab !== 'posts') return;
    setImportedPostsLoading(true);
    Promise.all(accounts.map((acc) => api.get(`/social/accounts/${acc.id}/posts`).then((r) => ({ id: acc.id, posts: r.data?.posts ?? [] }))))
      .then((results) => {
        const merged = results.flatMap((r) => r.posts).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        setImportedPosts(merged);
      })
      .catch(() => setImportedPosts([]))
      .finally(() => setImportedPostsLoading(false));
  }, [analyticsTab, selectedAccount?.id, hasAccounts, accounts.map((a) => a.id).join(',')]);

  const insightsCacheRef = useRef<Record<string, { platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number }>>({});
  const aggregatedCacheRef = useRef<{ key: string; data: { totalFollowers: number; totalImpressions: number; byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }>; combinedTimeSeries: Array<{ date: string; value: number }> } } | null>(null);

  useEffect(() => {
    if (selectedAccount?.id) {
      setAggregatedInsights(null);
      const cacheKey = `${selectedAccount.id}-${dateRange.start}-${dateRange.end}`;
      const cached = analyticsTab === 'account' ? insightsCacheRef.current[cacheKey] : undefined;
      if (cached && analyticsTab === 'account') {
        setInsights(cached);
        setInsightsLoading(false);
        return;
      }
      if (analyticsTab !== 'account' || !dateRange.start || !dateRange.end) return;
      if (analyticsTab !== 'account') return;
      if (analyticsTab === 'account') {
        setInsights(null);
        setInsightsLoading(true);
      }
      api.get(`/social/accounts/${selectedAccount.id}/insights`, { params: { since: dateRange.start, until: dateRange.end } })
        .then((res) => {
          const data = res.data ?? null;
          if (data) insightsCacheRef.current[cacheKey] = data;
          setInsights(data);
        })
        .catch(() => setInsights(null))
        .finally(() => setInsightsLoading(false));
      return;
    }
    if (!hasAccounts || analyticsTab !== 'account' || !dateRange.start || !dateRange.end) {
      setAggregatedInsights(null);
      return;
    }
    const insightAccounts = accounts.filter((a) => a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK');
    if (insightAccounts.length === 0) {
      setAggregatedInsights(null);
      return;
    }
    const aggCacheKey = `agg-${dateRange.start}-${dateRange.end}-${insightAccounts.map((a) => a.id).join(',')}`;
    const cachedAgg = aggregatedCacheRef.current;
    if (cachedAgg && cachedAgg.key === aggCacheKey) {
      setAggregatedInsights(cachedAgg.data);
      setAggregatedLoading(false);
    } else {
      setAggregatedInsights(null);
      setAggregatedLoading(true);
    }
    Promise.all(
      insightAccounts.map((acc) =>
        api.get(`/social/accounts/${acc.id}/insights`, { params: { since: dateRange.start, until: dateRange.end } }).then((r) => ({ platform: acc.platform, data: r.data }))
      )
    )
      .then((results) => {
        const byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }> = {};
        let totalFollowers = 0;
        let totalImpressions = 0;
        const dateMap: Record<string, number> = {};
        for (const { platform, data } of results) {
          if (!data) continue;
          const fol = data.followers ?? 0;
          const imp = data.impressionsTotal ?? 0;
          const ts = data.impressionsTimeSeries ?? [];
          byPlatform[platform] = { followers: fol, impressions: imp, timeSeries: ts };
          totalFollowers += fol;
          totalImpressions += imp;
          for (const d of ts) {
            dateMap[d.date] = (dateMap[d.date] ?? 0) + d.value;
          }
        }
        const combinedTimeSeries = Object.entries(dateMap)
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
        const data = { totalFollowers, totalImpressions, byPlatform, combinedTimeSeries };
        aggregatedCacheRef.current = { key: aggCacheKey, data };
        setAggregatedInsights(data);
      })
      .catch(() => setAggregatedInsights(null))
      .finally(() => setAggregatedLoading(false));
  }, [analyticsTab, selectedAccount?.id, hasAccounts, dateRange.start, dateRange.end, accounts.map((a) => a.id).join(',')]);

  const handleConnect = async (platform: string, method?: string) => {
    const getMessage = (err: unknown): string | null => {
      if (!err || typeof err !== 'object' || !('response' in err)) return null;
      const res = (err as { response?: { data?: { message?: string } } }).response;
      return res?.data?.message ?? null;
    };
    setAlertMessage(null);
    setConnectingPlatform(platform);
    setConnectingMethod(method);
    let redirecting = false;
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
        redirecting = true;
        setOauthRedirectUrl(url);
        setTimeout(() => {
          window.location.href = url;
        }, 200);
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
      if (!redirecting) {
        setConnectingPlatform(null);
        setConnectingMethod(undefined);
        setOauthRedirectUrl(null);
      }
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
          oauthRedirectUrl={oauthRedirectUrl}
          connectError={alertMessage}
        />
      </>
    );
  }

  const connectedPlatforms = (cachedAccounts as SocialAccount[]).map((a) => a.platform);
  const hasFacebook = connectedPlatforms.includes('FACEBOOK');
  const hasInstagram = connectedPlatforms.includes('INSTAGRAM');
  const totalInteractions = importedPosts.reduce((s, p) => s + (p.interactions || 0), 0);
  const filteredPosts = importedPosts.filter((p) => !postsSearch || (p.content?.toLowerCase().includes(postsSearch.toLowerCase())));
  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'date') {
      const t = new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime();
      return sortDesc ? -t : t;
    }
    if (sortBy === 'impressions') {
      const t = (a.impressions ?? 0) - (b.impressions ?? 0);
      return sortDesc ? -t : t;
    }
    const t = (a.interactions ?? 0) - (b.interactions ?? 0);
    return sortDesc ? -t : t;
  });
  const totalPostsPages = Math.max(1, Math.ceil(sortedPosts.length / postsPerPage));
  const currentPagePosts = sortedPosts.slice((postsPage - 1) * postsPerPage, postsPage * postsPerPage);

  const effectiveFollowers = selectedAccount ? (insights?.followers ?? 0) : (aggregatedInsights?.totalFollowers ?? 0);
  const effectiveImpressions = selectedAccount ? (insights?.impressionsTotal ?? 0) : (aggregatedInsights?.totalImpressions ?? 0);
  const effectiveTimeSeries = selectedAccount ? (insights?.impressionsTimeSeries ?? []) : (aggregatedInsights?.combinedTimeSeries ?? []);
  const effectivePageVisits = selectedAccount ? (insights?.pageViewsTotal ?? 0) : 0;
  const effectiveReach = selectedAccount ? (insights?.reachTotal ?? 0) : 0;
  const effectiveProfileViews = selectedAccount ? (insights?.profileViewsTotal ?? 0) : 0;
  const effectiveInsightsLoading = selectedAccount ? insightsLoading : aggregatedLoading;
  const maxImpressions = effectiveTimeSeries.length ? Math.max(...effectiveTimeSeries.map((d) => d.value), 1) : 1;
  const hasFbOrIg = accounts.some((a) => a.platform === 'FACEBOOK' || a.platform === 'INSTAGRAM');
  const showReconnectBanner = hasFbOrIg && (insights?.insightsHint || postsSyncError);

  return (
    <div className="space-y-0">
      {(connectingParam === '1' || justConnected) && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${justConnected ? 'border-green-200 bg-green-50 text-green-800' : 'border-indigo-200 bg-indigo-50 text-indigo-800'}`}>
          {justConnected ? 'Account connected. You can select it from the sidebar.' : 'Connecting your account…'}
        </div>
      )}
      {showReconnectBanner && (
        <div className="mb-4 rounded-xl border-2 border-indigo-200 bg-indigo-50 px-4 py-4">
          <p className="text-sm font-medium text-indigo-900">To see analytics, posts, and inbox like Metricool, reconnect and choose your Page.</p>
          <p className="text-xs text-indigo-700 mt-1">Click the button below, sign in with Facebook when asked, then select your Page. This loads all data for that Page and its linked Instagram.</p>
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

      {/* Account block: profile link when one account selected; "All connected" or connect CTA otherwise */}
      <div className="mt-6 flex flex-col gap-3">
        {selectedAccount ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
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
              <button
                type="button"
                onClick={async () => {
                  if (reconnectingId) return;
                  setReconnectingId(selectedAccount.id);
                  try {
                    const res = await api.get(`/social/oauth/${selectedAccount.platform.toLowerCase()}/start`);
                    const url = res?.data?.url;
                    if (url && typeof url === 'string') window.location.href = url;
                  } catch (_) {}
                  setReconnectingId(null);
                }}
                disabled={!!reconnectingId}
                title="Reconnect account"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reconnectingId === selectedAccount.id ? <RefreshCw size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                {reconnectingId === selectedAccount.id ? 'Reconnecting…' : 'Reconnect'}
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (disconnectingId) return;
                  if (!window.confirm(`Disconnect ${selectedAccount.username || selectedAccount.platform}? You can connect again anytime from the sidebar.`)) return;
                  setDisconnectingId(selectedAccount.id);
                  try {
                    await api.delete(`/social/accounts/${selectedAccount.id}`);
                    clearSelection();
                    const res = await api.get('/social/accounts');
                    const data = Array.isArray(res.data) ? res.data : [];
                    setCachedAccounts(data);
                    setInsights(null);
                    setAggregatedInsights(null);
                  } catch (_) {}
                  setDisconnectingId(null);
                }}
                disabled={!!disconnectingId}
                className="shrink-0 px-4 py-2 rounded-lg border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnectingId === selectedAccount.id ? 'Disconnecting…' : 'Disconnect account'}
              </button>
            </div>
          </>
        ) : hasAccounts ? (
          <div className="flex gap-3 p-3 bg-white rounded-xl border border-neutral-200 w-fit">
            <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center shrink-0">{PLATFORM_ICON.INSTAGRAM}</div>
            <div>
              <p className="font-semibold text-neutral-900">All connected accounts</p>
              <p className="text-sm text-neutral-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''} · Select one in the sidebar for a single profile</p>
            </div>
          </div>
        ) : (
          <div className="flex gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200 w-full max-w-md">
            <p className="text-sm text-neutral-600">Connect a platform from the left sidebar to see your analytics and posts here.</p>
          </div>
        )}
      </div>

      {analyticsTab === 'account' && (
        <div className="mt-6 space-y-6">
          <h2 className="text-lg font-semibold text-neutral-900">Account</h2>
          {effectiveInsightsLoading && <p className="text-sm text-neutral-500">Loading analytics…</p>}
          {insights?.insightsHint && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p>{insights.insightsHint}</p>
              {(selectedAccount?.platform === 'INSTAGRAM' || selectedAccount?.platform === 'FACEBOOK') && (
                <p className="mt-2 text-xs text-amber-700">Use the Reconnect button above for this account, then choose your Page when asked.</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Followers card */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm font-medium text-neutral-500">Followers</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-3xl font-bold text-neutral-900">{effectiveFollowers}</span>
                <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.min(100, (effectiveFollowers / 2000) * 100)}%` }} />
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {selectedAccount ? (
                  <>
                    {selectedAccount.platform === 'INSTAGRAM' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{effectiveFollowers} Instagram</span>}
                    {selectedAccount.platform === 'FACEBOOK' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{effectiveFollowers} Facebook</span>}
                    {selectedAccount.platform && selectedAccount.platform !== 'INSTAGRAM' && selectedAccount.platform !== 'FACEBOOK' && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700">{effectiveFollowers} {selectedAccount.platform}</span>
                    )}
                  </>
                ) : (
                  <>
                    {aggregatedInsights?.byPlatform?.INSTAGRAM != null && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{aggregatedInsights.byPlatform.INSTAGRAM.followers} Instagram</span>}
                    {aggregatedInsights?.byPlatform?.FACEBOOK != null && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{aggregatedInsights.byPlatform.FACEBOOK.followers || '—'} Facebook</span>}
                  </>
                )}
              </div>
              <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl flex items-center justify-center" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                {effectiveTimeSeries.length ? (
                  <div className="flex items-end gap-0.5 h-full w-full p-4 pb-2">
                    {effectiveTimeSeries.map((d) => (
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
            {/* Impressions card */}
            <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
              <p className="text-sm font-medium text-neutral-500">Views</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-3xl font-bold text-neutral-900">{effectiveImpressions}</span>
                <div className="flex-1 h-2 max-w-[120px] rounded-full bg-neutral-200 overflow-hidden">
                  <div className="h-full rounded-full bg-indigo-500" style={{ width: effectiveImpressions ? `${Math.min(100, effectiveImpressions / 50)}%` : '0%' }} />
                </div>
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {selectedAccount ? (
                  <>
                    {selectedAccount.platform === 'FACEBOOK' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{effectiveImpressions} Facebook</span>}
                    {selectedAccount.platform === 'INSTAGRAM' && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{effectiveImpressions} Instagram</span>}
                    {selectedAccount.platform && selectedAccount.platform !== 'INSTAGRAM' && selectedAccount.platform !== 'FACEBOOK' && (
                      <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-neutral-100 text-neutral-700">{effectiveImpressions} {selectedAccount.platform}</span>
                    )}
                  </>
                ) : (
                  <>
                    {aggregatedInsights?.byPlatform?.FACEBOOK != null && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">{aggregatedInsights.byPlatform.FACEBOOK.impressions || '—'} Facebook</span>}
                    {aggregatedInsights?.byPlatform?.INSTAGRAM != null && <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-pink-100 text-pink-800">{aggregatedInsights.byPlatform.INSTAGRAM.impressions} Instagram</span>}
                  </>
                )}
              </div>
              <div className="mt-4 h-40 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-[0.03] font-semibold text-neutral-400 text-2xl flex items-center justify-center" style={{ transform: 'rotate(-20deg)' }}>agent4socials</div>
                {effectiveTimeSeries.length ? (
                  <div className="flex items-end gap-0.5 h-full w-full p-4 pb-2">
                    {effectiveTimeSeries.map((d) => (
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
            {/* Page visits / Profile views, Reach, Total content */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:col-span-2">
              {selectedAccount?.platform === 'INSTAGRAM' ? (
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-neutral-500">Profile views</p>
                  <p className="text-xl font-bold text-neutral-900 mt-0.5">{effectiveProfileViews || '—'}</p>
                </div>
              ) : (
                <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                  <p className="text-xs font-medium text-neutral-500">Page visits</p>
                  <p className="text-xl font-bold text-neutral-900 mt-0.5">{effectivePageVisits || '—'}</p>
                </div>
              )}
              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs font-medium text-neutral-500">Reach</p>
                <p className="text-xl font-bold text-neutral-900 mt-0.5">{effectiveReach || '—'}</p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm">
                <p className="text-xs font-medium text-neutral-500">Total content</p>
                <p className="text-xl font-bold text-neutral-900 mt-0.5">{importedPosts.length}</p>
              </div>
            </div>
            {/* Derived: daily page views, daily posts, posts per week */}
            {(() => {
              const start = dateRange.start ? new Date(dateRange.start) : null;
              const end = dateRange.end ? new Date(dateRange.end) : null;
              const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;
              const weeks = days ? days / 7 : 0;
              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 lg:col-span-2">
                  <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-neutral-500">Average daily new followers</p>
                    <p className="text-lg font-semibold text-neutral-700 mt-0.5">—</p>
                  </div>
                  <div className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 shadow-sm">
                    <p className="text-xs font-medium text-neutral-500">Daily page views</p>
                    <p className="text-lg font-semibold text-neutral-700 mt-0.5">{days ? (effectivePageVisits / days).toFixed(2) : '—'}</p>
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
                      setImportedPostsLoading(true);
                      try {
                        if (selectedAccount?.id) {
                          const res = await api.get(`/social/accounts/${selectedAccount.id}/posts`, { params: { sync: 1 } });
                          setImportedPosts(res.data?.posts ?? []);
                          setPostsSyncError(res.data?.syncError ?? null);
                        } else if (accounts.length > 0) {
                          await Promise.all(accounts.map((acc) => api.get(`/social/accounts/${acc.id}/posts`, { params: { sync: 1 } })));
                          const results = await Promise.all(accounts.map((acc) => api.get(`/social/accounts/${acc.id}/posts`).then((r) => r.data?.posts ?? [])));
                          const merged = results.flat().sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
                          setImportedPosts(merged);
                        }
                        setPostsPage(1);
                      } catch (_) {
                        setImportedPosts([]);
                      } finally {
                        setImportedPostsLoading(false);
                      }
                    }}
                    disabled={importedPostsLoading || !hasAccounts}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    <RefreshCw size={16} className={importedPostsLoading ? 'animate-spin' : ''} />
                    {importedPostsLoading ? 'Syncing…' : 'Sync posts'}
                  </button>
                </div>
              </div>
              {postsSyncError && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p>{postsSyncError}</p>
                  <p className="mt-2 text-xs text-amber-700">Use Reconnect in the left sidebar for Instagram or Facebook, then choose your Page when asked.</p>
                </div>
              )}
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
                    <p className="text-sm text-neutral-500">
                      {hasAccounts ? 'No posts loaded. Click &quot;Sync posts&quot; to import from your connected accounts.' : 'Connect a platform and sync to see posts here.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <table className="min-w-full divide-y divide-neutral-200">
                      <thead className="bg-neutral-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Content</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Reach
                              <button type="button" onClick={() => { setSortBy('impressions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Views
                              <span title="Number of times this post was shown" className="text-neutral-400 cursor-help"><HelpCircle size={14} /></span>
                              <button type="button" onClick={() => { setSortBy('impressions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Reactions</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Comments</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Shares</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Interactions
                              <button type="button" onClick={() => { setSortBy('interactions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Network</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Date
                              <button type="button" onClick={() => { setSortBy('date'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort by date"><ArrowUpDown size={14} /></button>
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
                                    <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                                      Open <ExternalLink size={12} />
                                    </a>
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
