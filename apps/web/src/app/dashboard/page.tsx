'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useAppData, getDefaultDateRange } from '@/context/AppDataContext';
import { useSelectedAccount, useResolvedSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import api from '@/lib/api';
import { getSupabaseBrowser } from '@/lib/supabase/client';
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
  HelpCircle,
  ArrowUpDown,
} from 'lucide-react';
import Link from 'next/link';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import type { Demographics, GrowthDataPoint, TrafficSourceItem } from '@/types/analytics';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-lg ${className}`}
      style={{
        background: 'linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

function DataSyncBanner({
  platform,
  insightsLoading,
  postsLoading,
}: {
  platform?: string | null;
  insightsLoading: boolean;
  postsLoading: boolean;
}) {
  const platformIcons: Record<string, React.ReactNode> = {
    INSTAGRAM: <InstagramIcon size={20} />,
    FACEBOOK: <FacebookIcon size={20} />,
    TIKTOK: <TikTokIcon size={20} />,
    YOUTUBE: <YoutubeIcon size={20} />,
    TWITTER: <XTwitterIcon size={20} className="text-neutral-800" />,
    LINKEDIN: <LinkedinIcon size={20} />,
  };
  const platformColors: Record<string, string> = {
    INSTAGRAM: 'from-pink-500 via-fuchsia-500 to-purple-600',
    FACEBOOK: 'from-blue-500 to-blue-700',
    TIKTOK: 'from-neutral-900 to-neutral-800',
    YOUTUBE: 'from-red-500 to-red-700',
    TWITTER: 'from-sky-400 to-sky-600',
    LINKEDIN: 'from-blue-600 to-blue-800',
    DEFAULT: 'from-indigo-500 to-violet-600',
  };
  const grad = platformColors[platform ?? ''] ?? platformColors.DEFAULT;
  const icon = platform ? platformIcons[platform] : null;
  const analyticsStep = insightsLoading ? 'loading' : 'done';
  const postsStep = postsLoading ? 'loading' : 'done';
  const allDone = !insightsLoading && !postsLoading;

  const Step = ({ state, label }: { state: 'done' | 'loading' | 'pending'; label: string }) => (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        state === 'done' ? 'bg-emerald-500 text-white' :
        state === 'loading' ? 'bg-white text-indigo-600' : 'bg-white/30 text-white/60'
      }`}>
        {state === 'done' ? '✓' : state === 'loading' ? (
          <span className="inline-block w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        ) : '○'}
      </div>
      <span className={`text-xs font-medium truncate ${
        state === 'done' ? 'text-emerald-100' : state === 'loading' ? 'text-white' : 'text-white/50'
      }`}>{label}</span>
    </div>
  );

  return (
    <div className={`mb-5 rounded-2xl overflow-hidden shadow-lg bg-gradient-to-r ${grad}`}>
      {/* indeterminate progress bar */}
      {!allDone && (
        <div className="h-1 bg-black/10 overflow-hidden">
          <div
            className="h-full w-1/3 rounded-full bg-white/50"
            style={{ animation: 'indeterminate-bar 1.4s ease-in-out infinite' }}
          />
        </div>
      )}
      <div className="px-5 py-4 flex items-center gap-4">
        {/* icon with ping ring */}
        {icon && (
          <div className="relative shrink-0">
            {!allDone && <div className="absolute inset-0 rounded-full bg-white/30 animate-ping" />}
            <div className="relative w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
              {icon}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm leading-tight">
            {allDone ? 'Data loaded! Your account is ready.' : 'Loading your data…'}
          </p>
          <p className="text-white/70 text-xs mt-0.5">
            {allDone ? 'Scroll down to see analytics and posts.' : 'This takes a few seconds. The page will update automatically.'}
          </p>
          {/* steps */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <Step state="done" label="Account connected" />
            <Step state={analyticsStep} label="Analytics" />
            <Step state={postsStep} label="Syncing posts" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SkeletonAnalyticsCards() {
  return (
    <div className="space-y-6">
      {/* metric cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[0, 1].map((i) => (
          <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-9 w-20" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
      {/* chart card */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm">
        <Skeleton className="h-4 w-32 mb-4" />
        <div className="flex items-end gap-1 h-24">
          {Array.from({ length: 14 }).map((_, i) => (
            <Skeleton key={i} className="flex-1 rounded-sm" style={{ height: `${20 + Math.sin(i) * 15 + 20}px` }} />
          ))}
        </div>
      </div>
      {/* stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-14" />
          </div>
        ))}
      </div>
    </div>
  );
}

function SkeletonPostsTable() {
  return (
    <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
      <div className="p-3 border-b border-neutral-200 flex gap-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-16 rounded-full" />
      </div>
      <div className="divide-y divide-neutral-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <Skeleton className="w-12 h-12 rounded shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-4 w-8 shrink-0" />
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const { cachedAccounts, setCachedAccounts, accountsLoadError, setAccountsLoadError } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {}, accountsLoadError: null, setAccountsLoadError: () => {} };
  const appData = useAppData();
  const { selectedPlatformForConnect, clearSelection, setSelectedAccountId, setSelectedPlatformForConnect } = useSelectedAccount() ?? { selectedPlatformForConnect: null, clearSelection: () => {}, setSelectedAccountId: () => {}, setSelectedPlatformForConnect: () => {} };
  const selectedAccount = useResolvedSelectedAccount(cachedAccounts as SocialAccount[]);
  const [justConnected, setJustConnected] = useState(false);
  const connectingParam = searchParams.get('connecting');

  const [stats, setStats] = useState({ accounts: 0, scheduled: 0, posted: 0, failed: 0 });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingPlatform, setConnectingPlatform] = useState<string | null>(null);
  const [connectingMethod, setConnectingMethod] = useState<string | undefined>(undefined);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState('account');
  const [importedPosts, setImportedPosts] = useState<Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>([]);
  const [importedPostsLoading, setImportedPostsLoading] = useState(false);
  const [postsSyncError, setPostsSyncError] = useState<string | null>(null);
  const [allPostsSyncError, setAllPostsSyncError] = useState<string | null>(null);
  const [syncAllTrigger, setSyncAllTrigger] = useState(0);
  const [dateRange, setDateRange] = useState(() => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  });
  const [postsPage, setPostsPage] = useState(1);
  const [postsSearch, setPostsSearch] = useState('');
  const [postsPerPage, setPostsPerPage] = useState(5);
  const [insights, setInsights] = useState<{
    platform: string;
    followers: number;
    impressionsTotal: number;
    impressionsTimeSeries: Array<{ date: string; value: number }>;
    pageViewsTotal?: number;
    reachTotal?: number;
    profileViewsTotal?: number;
    insightsHint?: string;
    demographics?: Demographics;
    growthTimeSeries?: GrowthDataPoint[];
    trafficSources?: TrafficSourceItem[];
    extra?: Record<string, number | number[] | Array<{ date: string; value: number }>>;
    tweetCount?: number;
    recentTweets?: Array<{ id: string; text: string; created_at: string | null; like_count: number; reply_count: number; retweet_count: number; impression_count: number }>;
  } | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'impressions' | 'interactions'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [postsPlatformFilter, setPostsPlatformFilter] = useState<string>('all');
  const [aggregatedInsights, setAggregatedInsights] = useState<{
    totalFollowers: number;
    totalImpressions: number;
    totalReach: number;
    totalProfileViews: number;
    totalPageViews: number;
    byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }>;
    combinedTimeSeries: Array<{ date: string; value: number }>;
  } | null>(null);
  const [aggregatedLoading, setAggregatedLoading] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const [disconnectingLabel, setDisconnectingLabel] = useState<string | null>(null);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [reconnectingId, setReconnectingId] = useState<string | null>(null);
  const [enablingTwitter1oa, setEnablingTwitter1oa] = useState(false);
  const [tokenDebugLoading, setTokenDebugLoading] = useState<string | null>(null);
  const [pageReviews, setPageReviews] = useState<Array<{ created_time: string | null; rating: number | null; recommendation_type: string | null; review_text: string | null; has_rating: boolean; has_review: boolean }>>([]);
  const [pageReviewsLoading, setPageReviewsLoading] = useState(false);
  const [pageReviewsError, setPageReviewsError] = useState<string | null>(null);
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

  const accountIdFromUrl = searchParams.get('accountId');
  const twitter1oaNext = searchParams.get('twitter_1oa_next');
  const connectParam = searchParams.get('connect');

  // When connect= is in URL (e.g. clicked + from Inbox): show Connect view for that platform. Survives full page load.
  useEffect(() => {
    if (!connectParam) return;
    const upper = connectParam.toUpperCase();
    const allowed = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];
    if (allowed.includes(upper)) {
      setSelectedPlatformForConnect(upper);
      router.replace('/dashboard', { scroll: false });
    }
  }, [connectParam, router, setSelectedPlatformForConnect]);

  // When accountId is in URL (e.g. after connecting any social): select that account and clean URL. No loading banner.
  useEffect(() => {
    if (!accountIdFromUrl || twitter1oaNext === '1') return;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    fetchAccounts().then(() => {
      setSelectedAccountId(accountIdFromUrl);
      delete postsCacheRef.current[accountIdFromUrl];
      Object.keys(insightsCacheRef.current).forEach((k) => {
        if (k.startsWith(accountIdFromUrl + '-')) delete insightsCacheRef.current[k];
      });
      appData?.clearAccountData(accountIdFromUrl);
      router.replace('/dashboard', { scroll: false });
      if (connectingParam === '1') {
        setJustConnected(true);
        timeoutId = setTimeout(() => setJustConnected(false), 5000);
      }
    }).catch(() => router.replace('/dashboard', { scroll: false }));
    return () => { if (timeoutId) clearTimeout(timeoutId); };
  }, [accountIdFromUrl, connectingParam, twitter1oaNext, router, setSelectedAccountId, appData]);

  useEffect(() => {
    if (twitter1oaNext !== '1') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/social/oauth/twitter-1oa/start');
        const url = res?.data?.url;
        if (cancelled || !url || typeof url !== 'string') {
          router.replace('/dashboard', { scroll: false });
          return;
        }
        window.location.href = url;
      } catch {
        if (!cancelled) router.replace('/dashboard', { scroll: false });
      }
    })();
    return () => { cancelled = true; };
  }, [twitter1oaNext, router]);

  useEffect(() => {
    const twitter1oa = searchParams.get('twitter_1oa');
    const err = searchParams.get('error');
    if (twitter1oa === 'ok') {
      fetchAccounts().catch(() => {});
      router.replace('/dashboard', { scroll: false });
    } else if (err?.startsWith('twitter_1oa_')) {
      const msg = err === 'twitter_1oa_no_account' ? 'Connect X (Twitter) first with Reconnect, then enable image upload.'
        : err === 'twitter_1oa_session_expired' ? 'Session expired. Click Enable image upload again.'
        : 'Something went wrong. Try again or add TWITTER_API_KEY and TWITTER_API_SECRET in Vercel.';
      setAlertMessage(msg);
      router.replace('/dashboard', { scroll: false });
    }
  }, [searchParams, router]);

  useEffect(() => {
    setStats((s) => ({ ...s, accounts: (cachedAccounts as SocialAccount[]).length }));
  }, [(cachedAccounts as SocialAccount[]).length]);

  useEffect(() => {
    const fetchData = async () => {
      try {
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
  }, []);

  const postsCacheRef = useRef<Record<string, Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>>({});
  const syncAllRequestedRef = useRef<string | null>(null);

  // Auto-select the platform filter when switching accounts (or reset to 'all' for Summary)
  useEffect(() => {
    setPostsPlatformFilter(selectedAccount ? selectedAccount.platform : 'all');
    setPostsPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccount?.id]);

  useEffect(() => {
    if (selectedAccount?.id) {
      if (analyticsTab === 'posts') {
        const fromCache = appData?.getPosts(selectedAccount.id);
        const cached = fromCache ?? postsCacheRef.current[selectedAccount.id];
        if (cached !== undefined && cached !== null) {
          setImportedPosts(cached);
          setImportedPostsLoading(false);
          return;
        }
        setImportedPosts([]);
        setImportedPostsLoading(true);
        const syncFirst = !postsCacheRef.current[selectedAccount.id];
        api.get(`/social/accounts/${selectedAccount.id}/posts`, { params: syncFirst ? { sync: 1 } : {} })
          .then((res) => {
            const list = res.data?.posts ?? [];
            postsCacheRef.current[selectedAccount.id] = list;
            appData?.setPostsForAccount(selectedAccount.id, list);
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
    if (analyticsTab !== 'posts' && analyticsTab !== 'account') return;
    const accountIds = accounts.map((a) => a.id);
    if (appData && accountIds.length > 0) {
      const merged: Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }> = [];
      let allCached = true;
      for (const id of accountIds) {
        const list = appData.getPosts(id);
        if (list === undefined) {
          allCached = false;
          break;
        }
        merged.push(...list);
      }
      if (allCached && merged.length >= 0) {
        const sorted = [...merged].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        setImportedPosts(sorted);
        setImportedPostsLoading(false);
        setAllPostsSyncError(null);
        return;
      }
    }
    setImportedPostsLoading(true);
    const accountIdsKey = accountIds.sort().join(',');
    const syncAllFirst = syncAllRequestedRef.current !== accountIdsKey;
    if (syncAllFirst) syncAllRequestedRef.current = accountIdsKey;
    setAllPostsSyncError(null);
    const timeoutMs = syncAllFirst ? 60_000 : 25_000;
    Promise.allSettled(
      accounts.map((acc) =>
        api.get(`/social/accounts/${acc.id}/posts`, { params: syncAllFirst ? { sync: 1 } : {}, timeout: timeoutMs }).then((r) => ({
          id: acc.id,
          posts: r.data?.posts ?? [],
          syncError: r.data?.syncError as string | undefined,
        }))
      )
    )
      .then((outcomes) => {
        const results: Array<{ posts: Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>; syncError?: string }> = [];
        const errors: string[] = [];
        for (const outcome of outcomes) {
          if (outcome.status === 'fulfilled' && outcome.value) {
            results.push({ posts: outcome.value.posts ?? [], syncError: outcome.value.syncError });
            if (outcome.value.syncError) errors.push(outcome.value.syncError);
            appData?.setPostsForAccount(outcome.value.id, outcome.value.posts ?? []);
          } else if (outcome.status === 'rejected') {
            const err = outcome.reason;
            const msg = err?.response?.data?.message ?? err?.message ?? 'Request failed';
            if (msg.includes('timeout') || msg.includes('Timeout')) {
              errors.push('Sync is taking too long. Try selecting one account in the sidebar and click Sync there, or try again in a moment.');
            } else if (err?.response?.status === 401) {
              errors.push('Session expired. Please log out and log back in.');
            } else {
              errors.push(msg);
            }
          }
        }
        const merged = results.flatMap((r) => r.posts).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        setImportedPosts(merged);
        if (errors.length) setAllPostsSyncError(errors[0]);
      })
      .finally(() => setImportedPostsLoading(false));
  }, [analyticsTab, selectedAccount?.id, hasAccounts, syncAllTrigger, accounts.map((a) => a.id).join(','), appData]);

  const insightsCacheRef = useRef<Record<string, { platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number }>>({});
  const selectedAccountIdRef = useRef<string | null>(null);
  const aggregatedCacheRef = useRef<{ key: string; data: { totalFollowers: number; totalImpressions: number; totalReach: number; totalProfileViews: number; totalPageViews: number; byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }>; combinedTimeSeries: Array<{ date: string; value: number }> } } | null>(null);

  // Single-account insights: when an account is selected
  useEffect(() => {
    if (!selectedAccount?.id || analyticsTab !== 'account' || !dateRange.start || !dateRange.end) return;
    selectedAccountIdRef.current = selectedAccount.id;
    const accountId = selectedAccount.id;
    const platform = selectedAccount.platform;
    const cacheKey = `${accountId}-${dateRange.start}-${dateRange.end}`;
    const defaultRange = getDefaultDateRange();
    const usePrefetchedInsights = dateRange.start === defaultRange.start && dateRange.end === defaultRange.end && appData?.getInsights(accountId);
    const cached = usePrefetchedInsights ?? insightsCacheRef.current[cacheKey];
    const postsCached = postsCacheRef.current[accountId] ?? appData?.getPosts(accountId);

    // Helper: run background sync (posts + re-fetch insights) without blocking the UI
    const runBackgroundSync = () => {
      api.get(`/social/accounts/${accountId}/posts`, { params: { sync: 1 } })
        .then((postsRes) => {
          const list = postsRes.data?.posts ?? [];
          postsCacheRef.current[accountId] = list;
          appData?.setPostsForAccount(accountId, list);
          if (selectedAccountIdRef.current === accountId) setImportedPosts(list);
          setPostsSyncError(postsRes.data?.syncError ?? null);
          if ((platform === 'TIKTOK' || platform === 'YOUTUBE') && selectedAccountIdRef.current === accountId) {
            delete insightsCacheRef.current[cacheKey];
            return api.get(`/social/accounts/${accountId}/insights`, { params: { since: dateRange.start, until: dateRange.end, extended: 1 } });
          }
        })
        .then((insightsRes) => {
          if (!insightsRes?.data || selectedAccountIdRef.current !== accountId) return;
          const next = insightsRes.data;
          insightsCacheRef.current[cacheKey] = next;
          appData?.setInsightsForAccount(accountId, next);
          setInsights(next);
        })
        .catch(() => {});
    };

    // If we already have cached data, show it immediately and sync in background
    if (cached) {
      setInsights(cached);
      setInsightsLoading(false);
      if (postsCached !== undefined && postsCached !== null) {
        setImportedPosts(postsCached);
        setImportedPostsLoading(false);
        // Still refresh in background so posts/views stay up to date
        runBackgroundSync();
      } else {
        setImportedPostsLoading(true);
        api.get(`/social/accounts/${accountId}/posts`, { params: { sync: 1 } })
          .then((postsRes) => {
            const list = postsRes.data?.posts ?? [];
            postsCacheRef.current[accountId] = list;
            appData?.setPostsForAccount(accountId, list);
            if (selectedAccountIdRef.current === accountId) setImportedPosts(list);
            setPostsSyncError(postsRes.data?.syncError ?? null);
          })
          .catch(() => setPostsSyncError(null))
          .finally(() => setImportedPostsLoading(false));
      }
      return;
    }

    setInsights(null);
    setInsightsLoading(true);
    setImportedPostsLoading(true);

    // Step 1: fetch insights + posts from DB quickly (no sync) so UI shows data in ~1s
    const insightsPromise = api.get(`/social/accounts/${accountId}/insights`, { params: { since: dateRange.start, until: dateRange.end, extended: 1 } });
    const fastPostsPromise = api.get(`/social/accounts/${accountId}/posts`);

    insightsPromise
      .then((res) => {
        const data = res.data ?? null;
        if (data) {
          insightsCacheRef.current[cacheKey] = data;
          appData?.setInsightsForAccount(accountId, data);
        }
        if (selectedAccountIdRef.current === accountId) setInsights(data);
      })
      .catch(() => { if (selectedAccountIdRef.current === accountId) setInsights(null); })
      .finally(() => setInsightsLoading(false));

    fastPostsPromise
      .then((postsRes) => {
        const list = postsRes.data?.posts ?? [];
        postsCacheRef.current[accountId] = list;
        appData?.setPostsForAccount(accountId, list);
        if (selectedAccountIdRef.current === accountId) setImportedPosts(list);
      })
      .catch(() => {})
      .finally(() => setImportedPostsLoading(false));

    // Step 2: sync in background to pull latest from platform, then update silently
    runBackgroundSync();
  }, [analyticsTab, selectedAccount?.id, selectedAccount?.platform, dateRange.start, dateRange.end, appData, syncAllTrigger]);

  // Facebook Page reviews (pages_read_user_content)
  useEffect(() => {
    if (selectedAccount?.platform !== 'FACEBOOK' || !selectedAccount?.id || analyticsTab !== 'account') {
      setPageReviews([]);
      setPageReviewsError(null);
      return;
    }
    setPageReviewsLoading(true);
    setPageReviewsError(null);
    api.get(`/social/accounts/${selectedAccount.id}/page-reviews`)
      .then((res) => {
        const list = res.data?.reviews ?? [];
        setPageReviews(Array.isArray(list) ? list : []);
        if (res.data?.error) setPageReviewsError(res.data.error);
      })
      .catch(() => {
        setPageReviews([]);
        setPageReviewsError('Could not load Page reviews.');
      })
      .finally(() => setPageReviewsLoading(false));
  }, [selectedAccount?.id, selectedAccount?.platform, analyticsTab]);

  // Aggregated insights: fetch for all connected platforms so Summary shows everything instantly
  useEffect(() => {
    if (!hasAccounts || analyticsTab !== 'account' || !dateRange.start || !dateRange.end) {
      if (!hasAccounts) setAggregatedInsights(null);
      return;
    }
    const insightAccounts = accounts;
    if (insightAccounts.length === 0) {
      setAggregatedInsights(null);
      return;
    }
    const aggCacheKey = `agg-${dateRange.start}-${dateRange.end}-${insightAccounts.map((a) => a.id).sort().join(',')}`;
    const cachedAgg = aggregatedCacheRef.current;
    if (cachedAgg && cachedAgg.key === aggCacheKey) {
      setAggregatedInsights(cachedAgg.data);
      setAggregatedLoading(false);
    } else {
      setAggregatedLoading(true);
    }
    Promise.all(
      insightAccounts.map((acc) =>
        api.get(`/social/accounts/${acc.id}/insights`, { params: { since: dateRange.start, until: dateRange.end, extended: 1 } }).then((r) => ({ platform: acc.platform, data: r.data }))
      )
    )
      .then((results) => {
        const byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }> = {};
        let totalFollowers = 0;
        let totalImpressions = 0;
        let totalReach = 0;
        let totalProfileViews = 0;
        let totalPageViews = 0;
        const dateMap: Record<string, number> = {};
        for (const { platform, data } of results) {
          if (!data) continue;
          const fol = data.followers ?? 0;
          const imp = platform === 'TWITTER' ? (data.impressionsTotal ?? (data as { tweetCount?: number }).tweetCount ?? 0) : (data.impressionsTotal ?? 0);
          const ts = data.impressionsTimeSeries ?? [];
          byPlatform[platform] = { followers: fol, impressions: imp, timeSeries: ts };
          totalFollowers += fol;
          totalImpressions += imp;
          totalReach += data.reachTotal ?? 0;
          totalProfileViews += data.profileViewsTotal ?? 0;
          totalPageViews += data.pageViewsTotal ?? 0;
          for (const d of ts) {
            dateMap[d.date] = (dateMap[d.date] ?? 0) + d.value;
          }
        }
        const data = { totalFollowers, totalImpressions, totalReach, totalProfileViews, totalPageViews, byPlatform, combinedTimeSeries: Object.entries(dateMap).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)) };
        aggregatedCacheRef.current = { key: aggCacheKey, data };
        setAggregatedInsights(data);
      })
      .catch(() => setAggregatedInsights(null))
      .finally(() => setAggregatedLoading(false));
  }, [analyticsTab, hasAccounts, dateRange.start, dateRange.end, accounts.map((a) => a.id).join(',')]);

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
      const supabase = getSupabaseBrowser();
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
      if (!redirecting) {
        setConnectingPlatform(null);
        setConnectingMethod(undefined);
      }
    }
  };

  // Must run unconditionally before any early return (hooks rule)
  const postsByDateSeries = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of importedPosts) {
      const d = p.publishedAt ? String(p.publishedAt).slice(0, 10) : '';
      if (d) map[d] = (map[d] ?? 0) + 1;
    }
    return Object.entries(map).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [importedPosts]);
  const interactionsByDateSeries = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of importedPosts) {
      const d = p.publishedAt ? String(p.publishedAt).slice(0, 10) : '';
      if (d) map[d] = (map[d] ?? 0) + (p.interactions ?? 0);
    }
    return Object.entries(map).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [importedPosts]);

  const hasFbOrIg = accounts.some((a) => a.platform === 'FACEBOOK' || a.platform === 'INSTAGRAM');
  const reconnectCondition = hasFbOrIg && (insights?.insightsHint || postsSyncError || (allPostsSyncError && (allPostsSyncError.includes('Reconnect') || allPostsSyncError.includes('Session expired') || allPostsSyncError.includes('log back in'))));
  const autoSyncAttemptedRef = useRef(false);

  // Auto-sync when we would have shown the reconnect banner: refresh FB/IG accounts in background, then refetch data (no user button).
  useEffect(() => {
    if (!reconnectCondition || autoSyncAttemptedRef.current) return;
    const fbIgAccounts = accounts.filter((a) => a.platform === 'FACEBOOK' || a.platform === 'INSTAGRAM');
    if (fbIgAccounts.length === 0) return;
    autoSyncAttemptedRef.current = true;
    Promise.allSettled(fbIgAccounts.map((acc) => api.patch(`/social/accounts/${acc.id}/refresh`)))
      .then(() => fetchAccounts())
      .then(() => {
        fbIgAccounts.forEach((acc) => {
          appData?.clearAccountData(acc.id);
          delete postsCacheRef.current[acc.id];
          Object.keys(insightsCacheRef.current).forEach((k) => { if (k.startsWith(acc.id + '-')) delete insightsCacheRef.current[k]; });
        });
        syncAllRequestedRef.current = null;
        setSyncAllTrigger((t) => t + 1);
        setPostsSyncError(null);
        setAllPostsSyncError(null);
        if (insights?.insightsHint) {
          setInsights((prev) => (prev ? { ...prev, insightsHint: undefined } : null));
        }
      })
      .catch(() => {});
  }, [reconnectCondition, accounts, appData, insights?.insightsHint]);

  if (selectedPlatformForConnect) {
    return (
      <>
        <ConfirmModal open={alertMessage !== null} onClose={() => setAlertMessage(null)} message={alertMessage ?? ''} variant="alert" confirmLabel="OK" />
        <ConnectView
          platform={selectedPlatformForConnect}
          onConnect={handleConnect}
          connecting={connectingPlatform !== null}
          connectingMethod={connectingMethod}

          connectError={alertMessage}
        />
      </>
    );
  }

  const connectedPlatforms = (cachedAccounts as SocialAccount[]).map((a) => a.platform);
  // For tabs in the posts list, only show a platform tab when posts actually exist for it.
  const hasFacebook = importedPosts.some((p) => p.platform === 'FACEBOOK');
  const hasInstagram = importedPosts.some((p) => p.platform === 'INSTAGRAM');
  const totalInteractions = importedPosts.reduce((s, p) => s + (p.interactions || 0), 0);
  const filteredPosts = importedPosts
    .filter((p) => !postsSearch || (p.content?.toLowerCase().includes(postsSearch.toLowerCase())))
    .filter((p) => postsPlatformFilter === 'all' || p.platform === postsPlatformFilter);
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

  const postsTabDisplaySeries = postsByDateSeries.length > 0 ? postsByDateSeries : (importedPosts.length > 0 ? [{ date: dateRange.end || new Date().toISOString().slice(0, 10), value: importedPosts.length }] : []);
  const interactionsTabDisplaySeries = interactionsByDateSeries.length > 0 ? interactionsByDateSeries : (totalInteractions > 0 ? [{ date: dateRange.end || new Date().toISOString().slice(0, 10), value: totalInteractions }] : []);
  const maxPostsTabValue = Math.max(...postsTabDisplaySeries.map((d) => d.value), 1);
  const maxInteractionsTabValue = Math.max(...interactionsTabDisplaySeries.map((d) => d.value), 1);
  void maxPostsTabValue; void maxInteractionsTabValue;

  const plat = selectedAccount ? aggregatedInsights?.byPlatform[selectedAccount.platform] : null;
  const effectiveFollowers = selectedAccount
    ? Math.max(insights?.followers ?? 0, plat?.followers ?? 0)
    : (aggregatedInsights?.totalFollowers ?? 0);
  const effectiveImpressions = selectedAccount
    ? Math.max(insights?.impressionsTotal ?? 0, plat?.impressions ?? 0)
    : (aggregatedInsights?.totalImpressions ?? 0);
  const isTwitter = selectedAccount?.platform === 'TWITTER';
  const effectiveTweets = isTwitter ? (insights?.tweetCount ?? 0) : 0;
  const recentTweets = isTwitter ? (insights?.recentTweets ?? []) : [];
  const effectiveTimeSeries = selectedAccount
    ? ((insights?.impressionsTimeSeries?.length && insights.impressionsTimeSeries.some((d) => d.value > 0)) ? insights.impressionsTimeSeries : (plat?.timeSeries?.length ? plat.timeSeries : []))
    : (aggregatedInsights?.combinedTimeSeries ?? []);
  const effectivePageVisits = selectedAccount
    ? (insights?.pageViewsTotal ?? aggregatedInsights?.totalPageViews ?? 0)
    : (aggregatedInsights?.totalPageViews ?? 0);
  const effectiveReach = selectedAccount
    ? (insights?.reachTotal ?? aggregatedInsights?.totalReach ?? 0)
    : (aggregatedInsights?.totalReach ?? 0);
  const effectiveProfileViews = selectedAccount
    ? (insights?.profileViewsTotal ?? aggregatedInsights?.totalProfileViews ?? 0)
    : (aggregatedInsights?.totalProfileViews ?? 0);
  const effectiveInsightsLoading = selectedAccount
    ? (insightsLoading && !insights && !plat)
    : aggregatedLoading;
  const fallbackSeriesValue = effectiveImpressions || effectiveFollowers || 0;
  const hasNonZeroSeries = effectiveTimeSeries.length > 0 && effectiveTimeSeries.some((d) => d.value > 0);
  const endDate = dateRange.end || new Date().toISOString().slice(0, 10);
  const startDate = dateRange.start || endDate;
  // Views/impressions chart: use only impressions time series or fallback to views (never mix in followers)
  const displayTimeSeries =
    hasNonZeroSeries
      ? effectiveTimeSeries
      : effectiveImpressions > 0
        ? [{ date: startDate, value: effectiveImpressions }, { date: endDate, value: effectiveImpressions }]
        : [];
  // Followers chart: use its own series so it never shows views. When we have no historical data, show flat line at current follower count.
  const followersTimeSeries = (insights as { followersTimeSeries?: Array<{ date: string; value: number }> })?.followersTimeSeries;
  const displayFollowersTimeSeries =
    followersTimeSeries?.length
      ? followersTimeSeries
      : selectedAccount && (effectiveFollowers > 0 || effectiveImpressions > 0)
        ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
        : !selectedAccount && aggregatedInsights
          ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
          : [];
  const maxImpressions = displayTimeSeries.length ? Math.max(...displayTimeSeries.map((d) => d.value), 1) : 1;
  const showViewsHint = hasFbOrIg && effectiveFollowers > 0 && effectiveImpressions === 0 && !effectiveTimeSeries.some((d) => d.value > 0) && (selectedAccount?.platform === 'INSTAGRAM' || selectedAccount?.platform === 'FACEBOOK' || !selectedAccount);
  const showTikTokFollowersHint = selectedAccount?.platform === 'TIKTOK' && effectiveFollowers === 0 && effectiveImpressions > 0;

  return (
    <div className="space-y-0">
      <ConfirmModal open={alertMessage !== null} onClose={() => setAlertMessage(null)} message={alertMessage ?? ''} variant="alert" confirmLabel="OK" />
      {disconnectingId && (
        <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800" role="status" aria-live="polite">
          <RefreshCw size={20} className="animate-spin shrink-0 text-amber-600" aria-hidden />
          <p className="text-sm font-medium">
            Disconnecting {disconnectingLabel ? `@${disconnectingLabel}` : 'account'}…
          </p>
          <p className="text-xs text-amber-700">Finishing in the background. You can reconnect anytime from the sidebar.</p>
        </div>
      )}
      {(connectingParam === '1' || justConnected || insightsLoading || importedPostsLoading) && (
        <DataSyncBanner
          platform={selectedAccount?.platform}
          insightsLoading={insightsLoading || connectingParam === '1'}
          postsLoading={importedPostsLoading || connectingParam === '1'}
        />
      )}
      {showViewsHint && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">You're seeing follower counts. Views, reach, and trend graphs need Page/Instagram insights.</p>
          <p className="mt-1 text-xs text-amber-700">Data will sync automatically when your Page is linked.</p>
        </div>
      )}
      {showTikTokFollowersHint && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">TikTok follower count needs the user.info.stats scope.</p>
          <p className="mt-1 text-xs text-amber-700">Use Reconnect in the sidebar and approve all requested permissions to see your follower count here. Views are from your synced videos.</p>
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

      {/* API limit / upgrade banner */}
      <div className="mt-4 flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-800">
          {selectedAccount?.platform === 'INSTAGRAM'
            ? "Instagram's API only allows the last 28 days of insights. We show that data; older ranges are capped to 28 days."
            : selectedAccount?.platform === 'FACEBOOK'
              ? "Facebook Page insights are limited to 90 days per API request. Upgrade for export options."
              : 'Upgrade to export reports without a watermark.'}
        </p>
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
              {(selectedAccount.platform === 'INSTAGRAM' || selectedAccount.platform === 'FACEBOOK') && (
                <button
                  type="button"
                  onClick={async () => {
                    if (tokenDebugLoading) return;
                    setTokenDebugLoading(selectedAccount.id);
                    try {
                      const res = await api.get(`/social/accounts/${selectedAccount.id}/token-debug`);
                      const d = res.data as { isValid?: boolean; scopes?: string[]; hasPublishScope?: boolean; expiresAt?: number };
                      const exp = d.expiresAt ? new Date(d.expiresAt * 1000).toISOString().slice(0, 10) : 'N/A';
                      const scopeList = (d.scopes ?? []).join(', ') || 'none';
                      const msg = `Token valid: ${d.isValid ?? false}. Publish scope: ${d.hasPublishScope ? 'yes' : 'no'}. Expires: ${exp}. Scopes: ${scopeList}`;
                      setAlertMessage(msg);
                    } catch (e: unknown) {
                      const err = e as { response?: { data?: { message?: string; error?: string } } };
                      setAlertMessage(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Could not validate token.');
                    }
                    setTokenDebugLoading(null);
                  }}
                  disabled={!!tokenDebugLoading}
                  title="Validate Meta token and show granted scopes"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {tokenDebugLoading === selectedAccount.id ? <RefreshCw size={16} className="animate-spin" /> : <HelpCircle size={16} />}
                  {tokenDebugLoading === selectedAccount.id ? 'Checking…' : 'Check permissions'}
                </button>
              )}
              {selectedAccount.platform === 'TWITTER' && !(selectedAccount as { imageUploadEnabled?: boolean }).imageUploadEnabled && (
                <button
                  type="button"
                  onClick={async () => {
                    if (enablingTwitter1oa) return;
                    setEnablingTwitter1oa(true);
                    try {
                      const res = await api.get('/social/oauth/twitter-1oa/start');
                      const url = res?.data?.url;
                      if (url && typeof url === 'string') window.location.href = url;
                      else setAlertMessage(res?.data?.message ?? 'Could not start. Add TWITTER_API_KEY and TWITTER_API_SECRET in Vercel.');
                    } catch (e: unknown) {
                      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
                      setAlertMessage(msg ?? 'Enable image upload failed. Add TWITTER_API_KEY and TWITTER_API_SECRET in Vercel.');
                    }
                    setEnablingTwitter1oa(false);
                  }}
                  disabled={!!enablingTwitter1oa}
                  title="Enable image upload for X posts (OAuth 1.0a)"
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-700 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {enablingTwitter1oa ? <RefreshCw size={16} className="animate-spin" /> : <Image size={16} />}
                  Enable image upload
                </button>
              )}
              <button
                type="button"
                onClick={() => { if (!disconnectingId) setDisconnectConfirmOpen(true); }}
                disabled={!!disconnectingId}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 bg-white text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {disconnectingId === selectedAccount.id ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" aria-hidden />
                    Disconnecting…
                  </>
                ) : (
                  'Disconnect account'
                )}
              </button>
              <ConfirmModal
                open={disconnectConfirmOpen}
                onClose={() => setDisconnectConfirmOpen(false)}
                title="Disconnect account?"
                message={`Disconnect @${selectedAccount.username || selectedAccount.platform}? All synced posts and insights for this account will be removed. You can reconnect anytime from the sidebar.`}
                confirmLabel="Disconnect"
                cancelLabel="Keep connected"
                variant="danger"
                onConfirm={async () => {
                  const accountIdToRemove = selectedAccount.id;
                  const platformJustDisconnected = selectedAccount.platform;
                  const label = selectedAccount.username || selectedAccount.platform;
                  const previousAccounts = (cachedAccounts as SocialAccount[]) ?? [];
                  setDisconnectingId(selectedAccount.id);
                  setDisconnectingLabel(label);
                  setDisconnectConfirmOpen(false);
                  setSelectedPlatformForConnect(platformJustDisconnected);
                  setCachedAccounts(previousAccounts.filter((a) => a.id !== accountIdToRemove));
                  setInsights(null);
                  setAggregatedInsights(null);
                  router.replace('/dashboard', { scroll: false });
                  try {
                    await api.delete(`/social/accounts/${accountIdToRemove}`);
                    const res = await api.get('/social/accounts');
                    const data = Array.isArray(res.data) ? res.data : [];
                    setCachedAccounts(data);
                  } catch (e) {
                    setCachedAccounts(previousAccounts);
                    setSelectedPlatformForConnect(null);
                    setSelectedAccountId(accountIdToRemove);
                    const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Could not disconnect. Try again.';
                    setAlertMessage(msg);
                  } finally {
                    setDisconnectingId(null);
                    setDisconnectingLabel(null);
                  }
                }}
              />
            </div>
          </>
        ) : hasAccounts ? (
          <div className="flex gap-3 p-3 bg-white rounded-xl border border-neutral-200 w-fit">
            <div className="flex items-center gap-1 shrink-0">
              {accounts.slice(0, 6).map((acc) => (
                <span key={acc.id} className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4" title={acc.platform}>
                  {PLATFORM_ICON[acc.platform] ?? acc.platform}
                </span>
              ))}
            </div>
            <div>
              <p className="font-semibold text-neutral-900">All connected accounts</p>
              <p className="text-sm text-neutral-500">{accounts.length} account{accounts.length !== 1 ? 's' : ''} · Click an account in the left sidebar to see its profile picture, name, and analytics</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 w-full max-w-md">
            {accountsLoadError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-800 font-medium">Accounts could not be loaded</p>
                <p className="text-sm text-amber-700 mt-1">{accountsLoadError}</p>
                <button
                  type="button"
                  onClick={() => { setAccountsLoadError(null); setCachedAccounts([]); }}
                  className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700"
                >
                  Refresh
                </button>
              </div>
            )}
            <div className="flex gap-3 p-4 bg-neutral-50 rounded-xl border border-neutral-200 w-full max-w-md">
              <p className="text-sm text-neutral-600">Connect a platform from the left sidebar to see your analytics and posts here.</p>
            </div>
          </div>
        )}
      </div>

      {analyticsTab === 'account' && (
        <div className="mt-6 space-y-6">
          <h2 className="text-lg font-semibold text-neutral-900">Account</h2>
          {effectiveInsightsLoading && <SkeletonAnalyticsCards />}
          {!effectiveInsightsLoading && (
          <>{/* analytics content */}
          {!selectedAccount && hasAccounts && (importedPosts.length === 0 || allPostsSyncError) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {importedPosts.length === 0 && <p>No posts in this period yet. Sync to load posts from your connected accounts (Instagram, Facebook, X, etc.) and see interactions, number of posts, and total content.</p>}
              {allPostsSyncError && <p className="mt-1 font-medium">{allPostsSyncError}</p>}
              <p className="mt-2 text-xs text-amber-700">Tip: If syncing all accounts fails or times out, select one account in the sidebar and click Sync there.</p>
              <button
                type="button"
                onClick={() => {
                  syncAllRequestedRef.current = null;
                  setSyncAllTrigger((t) => t + 1);
                }}
                disabled={importedPostsLoading}
                className="mt-3 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {importedPostsLoading ? 'Syncing…' : 'Sync posts'}
              </button>
            </div>
          )}
          {/* ── Analytics cards (Metricool-style) ──────────────────────────── */}
          {(() => {
            const platColor =
              selectedAccount?.platform === 'INSTAGRAM' ? '#E1306C' :
              selectedAccount?.platform === 'FACEBOOK' ? '#1877F2' :
              selectedAccount?.platform === 'YOUTUBE' ? '#FF0000' :
              selectedAccount?.platform === 'TIKTOK' ? '#010101' :
              selectedAccount?.platform === 'TWITTER' ? '#1D9BF0' :
              selectedAccount?.platform === 'LINKEDIN' ? '#0A66C2' :
              '#6366f1';
            const start = dateRange.start ? new Date(dateRange.start) : null;
            const end = dateRange.end ? new Date(dateRange.end) : null;
            const days = start && end ? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))) : 0;
            const weeks = days ? days / 7 : 0;

            const platformBadge = (platform: string, value: number | null, suffix?: string) => {
              const cls =
                platform === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' :
                platform === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' :
                platform === 'TWITTER' ? 'bg-sky-100 text-sky-800' :
                platform === 'TIKTOK' ? 'bg-neutral-900/10 text-neutral-800' :
                platform === 'YOUTUBE' ? 'bg-red-100 text-red-800' :
                platform === 'LINKEDIN' ? 'bg-blue-50 text-blue-800' :
                'bg-neutral-100 text-neutral-700';
              const label = platform === 'TWITTER' ? 'X' : platform.charAt(0) + platform.slice(1).toLowerCase();
              return (
                <span key={platform} className={`px-2.5 py-1 rounded-md text-xs font-medium ${cls}`}>
                  {value != null ? value.toLocaleString() : '—'} {label}{suffix ?? ''}
                </span>
              );
            };

            return (
              <div className="space-y-4">
                {/* Row 1: Followers + Views — full charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Followers card */}
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    style={{ borderLeft: `4px solid ${platColor}` }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {selectedAccount?.platform === 'YOUTUBE' ? 'Subscribers' : 'Followers'}
                    </p>
                    <p className="text-3xl font-bold text-neutral-900 mt-1 tabular-nums">{effectiveFollowers.toLocaleString()}</p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {selectedAccount
                        ? platformBadge(selectedAccount.platform, effectiveFollowers)
                        : Array.from(new Set(accounts.map((a) => a.platform))).map((pl) => {
                            const v = aggregatedInsights?.byPlatform?.[pl]?.followers ?? null;
                            return platformBadge(pl, v);
                          })}
                    </div>
                    <div className="mt-3 rounded-xl overflow-hidden bg-neutral-50" style={{ height: 180 }}>
                      {displayFollowersTimeSeries.length ? (
                        <InteractiveLineChart data={displayFollowersTimeSeries} height={180} valueLabel={selectedAccount?.platform === 'YOUTUBE' ? 'Subscribers' : 'Followers'} color={platColor} crosshair />
                      ) : (
                        <div className="h-full flex items-end gap-1 px-3 pb-3 pt-4">
                          {[28,35,42,38,45,40,50].map((pct, i) => (
                            <div key={i} className="flex-1 rounded-t animate-pulse" style={{ height: `${pct}%`, backgroundColor: platColor + '33' }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">{dateRange.start} – {dateRange.end}</p>
                  </div>

                  {/* Views / Impressions card */}
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
                    style={{ borderLeft: `4px solid #6366f1` }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                      {isTwitter ? 'Tweets' : 'Impressions / views'}
                    </p>
                    <p className="text-3xl font-bold text-neutral-900 mt-1 tabular-nums">
                      {(isTwitter ? effectiveTweets : effectiveImpressions).toLocaleString()}
                    </p>
                    <div className="flex gap-1.5 mt-2 flex-wrap">
                      {selectedAccount
                        ? platformBadge(selectedAccount.platform, isTwitter ? effectiveTweets : effectiveImpressions)
                        : Array.from(new Set(accounts.map((a) => a.platform))).map((pl) => {
                            const v = aggregatedInsights?.byPlatform?.[pl]?.impressions ?? null;
                            return platformBadge(pl, v);
                          })}
                    </div>
                    <div className="mt-3 rounded-xl overflow-hidden bg-neutral-50" style={{ height: 180 }}>
                      {displayTimeSeries.length ? (
                        <InteractiveLineChart data={displayTimeSeries} height={180} valueLabel={isTwitter ? 'Tweets' : 'Impressions / views'} color="#6366f1" crosshair />
                      ) : (
                        <div className="h-full flex items-end gap-1 px-3 pb-3 pt-4">
                          {[32,40,35,48,42,38,52].map((pct, i) => (
                            <div key={i} className="flex-1 rounded-t animate-pulse bg-indigo-200/60" style={{ height: `${pct}%` }} />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1">{dateRange.start} – {dateRange.end}</p>
                  </div>
                </div>

                {/* Row 2: stat tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Interactions', value: totalInteractions.toLocaleString(), sub: `${importedPosts.length} posts`, accent: platColor },
                    { label: 'Reach', value: effectiveReach ? effectiveReach.toLocaleString() : '—', sub: selectedAccount?.platform === 'INSTAGRAM' ? 'Unique viewers' : 'Engaged users', accent: '#22c55e' },
                    { label: effectiveProfileViews > 0 ? 'Profile views' : 'Page visitors', value: (effectiveProfileViews || effectivePageVisits) ? (effectiveProfileViews || effectivePageVisits).toLocaleString() : '—', sub: selectedAccount?.platform === 'INSTAGRAM' ? 'Profile visits' : selectedAccount?.platform === 'FACEBOOK' ? 'Page visits in period' : 'Profile or page visits', accent: '#a855f7' },
                    { label: 'Total content', value: importedPosts.length.toLocaleString(), sub: `${days ? (importedPosts.length / days).toFixed(1) : 0} per day`, accent: '#0ea5e9' },
                  ].map((tile, i) => (
                    <div
                      key={i}
                      className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
                      style={{ borderLeft: `3px solid ${tile.accent}`, animation: `slide-up 0.4s ease-out ${i * 60}ms both` }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{tile.label}</p>
                      <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">{tile.value}</p>
                      <p className="text-xs text-neutral-400 mt-0.5">{tile.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Row 2b: Watch time (YT) and Follower growth when available */}
                {(() => {
                  const watchTimeMinutes = selectedAccount?.platform === 'YOUTUBE' && typeof insights?.extra?.estimatedMinutesWatched === 'number' ? insights.extra.estimatedMinutesWatched : 0;
                  const growthSeries = insights?.growthTimeSeries ?? [];
                  const netGrowth = growthSeries.reduce((s, p) => s + (p.net ?? p.gained - p.lost), 0);
                  const hasWatchTime = watchTimeMinutes > 0;
                  const hasGrowth = growthSeries.length > 0;
                  if (!hasWatchTime && !hasGrowth) return null;
                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {hasWatchTime && (
                        <div
                          className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200"
                          style={{ borderLeft: '3px solid #FF0000' }}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Watch time (YT)</p>
                          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">
                            {watchTimeMinutes >= 60 ? `${(watchTimeMinutes / 60).toFixed(1)} hrs` : `${Math.round(watchTimeMinutes)} min`}
                          </p>
                          <p className="text-xs text-neutral-400 mt-0.5">Total minutes watched in period</p>
                        </div>
                      )}
                      {hasGrowth && (
                        <div
                          className="bg-white border border-neutral-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-200"
                          style={{ borderLeft: '3px solid #22c55e' }}
                        >
                          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">Follower growth</p>
                          <p className="text-2xl font-bold text-neutral-900 mt-1 tabular-nums">
                            {netGrowth >= 0 ? `+${netGrowth.toLocaleString()}` : netGrowth.toLocaleString()}
                          </p>
                          <p className="text-xs text-neutral-400 mt-0.5">{selectedAccount?.platform === 'YOUTUBE' ? 'Subscribers gained minus lost' : 'Page fans added in period'}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Row 3: derived stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Daily page views', value: days && effectivePageVisits ? (effectivePageVisits / days).toFixed(1) : '—' },
                    { label: 'Daily posts', value: days ? (importedPosts.length / days).toFixed(2) : '—' },
                    { label: 'Posts per week', value: weeks ? (importedPosts.length / weeks).toFixed(1) : '—' },
                    { label: 'Avg. interactions / post', value: importedPosts.length ? (totalInteractions / importedPosts.length).toFixed(1) : '—' },
                  ].map((tile, i) => (
                    <div
                      key={i}
                      className="bg-neutral-50 border border-neutral-100 rounded-xl p-4 hover:bg-white hover:shadow-sm transition-all duration-150"
                      style={{ animation: `slide-up 0.4s ease-out ${(i + 4) * 60}ms both` }}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{tile.label}</p>
                      <p className="text-xl font-bold text-neutral-800 mt-1 tabular-nums">{tile.value}</p>
                    </div>
                  ))}
                </div>

                {/* Demographics: Country, Age, Gender */}
                {(() => {
                  const demo = insights?.demographics;
                  const hasCountry = (demo?.byCountry?.length ?? 0) > 0;
                  const hasAge = (demo?.byAge?.length ?? 0) > 0;
                  const hasGender = (demo?.byGender?.length ?? 0) > 0;
                  if (!hasCountry && !hasAge && !hasGender) return null;
                  const renderBreakdown = (title: string, items: Array<{ dimensionValue: string; label?: string; value: number }> | undefined, maxItems = 8) => {
                    if (!items?.length) return null;
                    const sorted = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
                    const total = items.reduce((s, i) => s + i.value, 0);
                    return (
                      <div key={title} className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
                        <ul className="space-y-1.5">
                          {sorted.map((item, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-sm">
                              <span className="text-neutral-700 truncate">{(item.label ?? item.dimensionValue) || '—'}</span>
                              <span className="text-neutral-900 font-medium tabular-nums shrink-0">{item.value.toLocaleString()}</span>
                            </li>
                          ))}
                        </ul>
                        {total > 0 && sorted.length < items.length && (
                          <p className="text-xs text-neutral-400">Top {maxItems} of {items.length} (total {total.toLocaleString()})</p>
                        )}
                      </div>
                    );
                  };
                  return (
                    <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm" style={{ borderLeft: '4px solid #6366f1' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">Audience demographics</p>
                      {demo?.hint && <p className="text-xs text-neutral-500 mb-3">{demo.hint}</p>}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {renderBreakdown('Country', demo?.byCountry)}
                        {renderBreakdown('Age', demo?.byAge)}
                        {renderBreakdown('Gender', demo?.byGender)}
                      </div>
                    </div>
                  );
                })()}

                {/* Facebook Page reviews (pages_read_user_content) */}
                {selectedAccount?.platform === 'FACEBOOK' && (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm" style={{ borderLeft: '4px solid #1877F2' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-1">Page reviews</p>
                    <p className="text-sm text-neutral-600 mb-4">Ratings and reviews from your Facebook Page (pages_read_user_content).</p>
                    {pageReviewsLoading && (
                      <div className="flex items-center gap-2 text-neutral-500 text-sm py-4">
                        <RefreshCw size={18} className="animate-spin" />
                        Loading reviews…
                      </div>
                    )}
                    {pageReviewsError && !pageReviewsLoading && (
                      <p className="text-amber-700 text-sm py-2">{pageReviewsError}</p>
                    )}
                    {!pageReviewsLoading && pageReviews.length === 0 && !pageReviewsError && (
                      <p className="text-neutral-500 text-sm py-4">No reviews yet. Reviews appear here when people rate your Page.</p>
                    )}
                    {!pageReviewsLoading && pageReviews.length > 0 && (
                      <ul className="space-y-4 max-h-80 overflow-y-auto">
                        {pageReviews.map((r, i) => (
                          <li key={i} className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {r.rating != null && (
                                <span className="text-amber-500 font-medium" title="Rating">{"★".repeat(Math.min(5, Math.max(0, r.rating)))}{"☆".repeat(5 - Math.min(5, Math.max(0, r.rating)))} {r.rating}/5</span>
                              )}
                              {r.recommendation_type && (
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.recommendation_type === 'positive' ? 'bg-green-100 text-green-800' : 'bg-neutral-100 text-neutral-700'}`}>
                                  {r.recommendation_type}
                                </span>
                              )}
                              {r.created_time && (
                                <span className="text-xs text-neutral-400">{new Date(r.created_time).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                              )}
                            </div>
                            {r.review_text && <p className="text-sm text-neutral-800 mt-2">{r.review_text}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Twitter recent tweets */}
                {isTwitter && recentTweets.length > 0 && (
                  <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm">
                    <p className="text-sm font-semibold text-neutral-700 mb-3">Recent posts on X</p>
                    <ul className="space-y-3 max-h-64 overflow-y-auto">
                      {recentTweets.slice(0, 10).map((t) => (
                        <li key={t.id} className="flex flex-col gap-1 text-sm border-b border-neutral-100 pb-2 last:border-0">
                          <p className="text-neutral-800 line-clamp-2">{t.text || '—'}</p>
                          <div className="flex gap-3 text-xs text-neutral-500">
                            <span>❤️ {t.like_count}</span>
                            <span>🔁 {t.retweet_count}</span>
                            <span>💬 {t.reply_count}</span>
                            {t.impression_count > 0 && <span>👁 {t.impression_count.toLocaleString()}</span>}
                            {t.created_at && <span>{new Date(t.created_at).toLocaleDateString()}</span>}
                          </div>
                          <a href={`https://x.com/i/status/${t.id}`} target="_blank" rel="noopener noreferrer" className="text-sky-600 text-xs hover:underline w-fit">View on X →</a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
          </>
          )}
        </div>
      )}

      {analyticsTab === 'posts' && (
          <div className="mt-6 space-y-6">
            {importedPostsLoading && (
              <div className="space-y-6">
                {/* widget skeletons */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {[0, 1].map((i) => (
                    <div key={i} className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm space-y-3">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-9 w-16" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-24 rounded-full" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                      </div>
                      <div className="h-24 rounded-lg overflow-hidden">
                        <div className="flex items-end gap-1 h-full p-2">
                          {Array.from({ length: 12 }).map((_, j) => (
                            <Skeleton key={j} className="flex-1 rounded-sm" style={{ height: `${25 + Math.sin(j * 0.8) * 20 + 20}px` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <SkeletonPostsTable />
              </div>
            )}
            <div className={importedPostsLoading ? 'hidden' : undefined}>
            {/* Interactions + Posts charts row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Interactions card */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-200"
                style={{ borderLeft: '4px solid #E1306C' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Interactions</p>
                    <p className="text-3xl font-bold text-neutral-900 mt-0.5 tabular-nums" style={{ animation: 'count-up 0.4s cubic-bezier(0.34,1.56,0.64,1) both' }}>
                      {totalInteractions.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end max-w-[160px]">
                    {Array.from(new Set(importedPosts.map((p) => p.platform))).map((pl) => {
                      const count = importedPosts.filter((p) => p.platform === pl).reduce((s, p) => s + p.interactions, 0);
                      const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-sky-100 text-sky-800' : 'bg-neutral-100 text-neutral-700';
                      return <span key={pl} className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{count.toLocaleString()}</span>;
                    })}
                  </div>
                </div>
                <div className="h-28 -mx-1">
                  {interactionsTabDisplaySeries.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={interactionsTabDisplaySeries} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={10}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => { try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return v; } }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <RechartTooltip
                          content={(props) => {
                            const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }>; label?: string };
                            if (!active || !payload?.length || !label) return null;
                            return (
                              <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-xl text-xs">
                                <p className="text-neutral-500 mb-1">{label}</p>
                                <p className="font-bold text-neutral-900">{(payload[0]?.value ?? 0).toLocaleString()} interactions</p>
                              </div>
                            );
                          }}
                          cursor={{ fill: 'rgba(225,48,108,0.06)' }}
                        />
                        <Bar dataKey="value" name="Interactions" radius={[3, 3, 0, 0]} fill="#E1306C" fillOpacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-300 text-xs">No chart data yet</div>
                  )}
                </div>
              </div>

              {/* Number of posts card */}
              <div className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all duration-200"
                style={{ borderLeft: '4px solid #6366f1' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Number of Posts</p>
                    <p className="text-3xl font-bold text-neutral-900 mt-0.5 tabular-nums" style={{ animation: 'count-up 0.4s cubic-bezier(0.34,1.56,0.64,1) 80ms both' }}>
                      {importedPosts.length.toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap justify-end max-w-[160px]">
                    {Array.from(new Set(importedPosts.map((p) => p.platform))).map((pl) => {
                      const count = importedPosts.filter((p) => p.platform === pl).length;
                      const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-sky-100 text-sky-800' : 'bg-neutral-100 text-neutral-700';
                      return <span key={pl} className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{count}</span>;
                    })}
                  </div>
                </div>
                <div className="h-28 -mx-1">
                  {postsTabDisplaySeries.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={postsTabDisplaySeries} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barSize={10}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false}
                          tickFormatter={(v) => { try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return v; } }} />
                        <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <RechartTooltip
                          content={(props) => {
                            const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }>; label?: string };
                            if (!active || !payload?.length || !label) return null;
                            return (
                              <div className="rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-xl text-xs">
                                <p className="text-neutral-500 mb-1">{label}</p>
                                <p className="font-bold text-neutral-900">{(payload[0]?.value ?? 0).toLocaleString()} posts</p>
                              </div>
                            );
                          }}
                          cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                        />
                        <Bar dataKey="value" name="Posts" radius={[3, 3, 0, 0]} fill="#6366f1" fillOpacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-neutral-300 text-xs">No chart data yet</div>
                  )}
                </div>
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
                  <p className="mt-2 text-xs text-amber-700">Data will sync automatically when your Page is linked.</p>
                </div>
              )}
              <div className="bg-white border border-neutral-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center gap-2 p-3 border-b border-neutral-200 flex-wrap">
                  <input
                    type="search"
                    placeholder="Search"
                    value={postsSearch}
                    onChange={(e) => { setPostsSearch(e.target.value); setPostsPage(1); }}
                    className="px-3 py-2 border border-neutral-200 rounded-lg text-sm w-44"
                  />
                  {/* Dynamic platform tabs — one per platform that has posts */}
                  {Array.from(new Set(importedPosts.map((p) => p.platform))).map((platform) => {
                    const count = importedPosts.filter((p) => p.platform === platform).length;
                    const isActive = postsPlatformFilter === platform;
                    const colorCls =
                      platform === 'INSTAGRAM' ? (isActive ? 'bg-pink-100 border-pink-300 text-pink-800' : 'border-neutral-200 text-neutral-600 hover:bg-pink-50') :
                      platform === 'FACEBOOK' ? (isActive ? 'bg-blue-100 border-blue-300 text-blue-800' : 'border-neutral-200 text-neutral-600 hover:bg-blue-50') :
                      platform === 'YOUTUBE' ? (isActive ? 'bg-red-100 border-red-300 text-red-800' : 'border-neutral-200 text-neutral-600 hover:bg-red-50') :
                      platform === 'TIKTOK' ? (isActive ? 'bg-neutral-900 border-neutral-900 text-white' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100') :
                      platform === 'TWITTER' ? (isActive ? 'bg-sky-100 border-sky-300 text-sky-800' : 'border-neutral-200 text-neutral-600 hover:bg-sky-50') :
                      platform === 'LINKEDIN' ? (isActive ? 'bg-blue-100 border-blue-400 text-blue-900' : 'border-neutral-200 text-neutral-600 hover:bg-blue-50') :
                      (isActive ? 'bg-indigo-100 border-indigo-300 text-indigo-800' : 'border-neutral-200 text-neutral-600 hover:bg-indigo-50');
                    return (
                      <button
                        key={platform}
                        type="button"
                        onClick={() => { setPostsPlatformFilter(isActive ? 'all' : platform); setPostsPage(1); }}
                        className={`px-3 py-1.5 rounded-lg border text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${colorCls}`}
                      >
                        {PLATFORM_ICON[platform]}
                        {count}
                      </button>
                    );
                  })}
                  {importedPosts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setPostsPlatformFilter('all'); setPostsPage(1); }}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${postsPlatformFilter === 'all' ? 'bg-neutral-100 border-neutral-400 text-neutral-900' : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'}`}
                    >
                      All ({importedPosts.length})
                    </button>
                  )}
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
                              Views
                              <button type="button" onClick={() => { setSortBy('impressions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Likes
                              <button type="button" onClick={() => { setSortBy('interactions'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Comments</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Shares</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Reposts</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">
                            <span className="inline-flex items-center gap-1">
                              Date
                              <button type="button" onClick={() => { setSortBy('date'); setSortDesc(!sortDesc); setPostsPage(1); }} className="p-0.5 rounded hover:bg-neutral-200" title="Sort by date"><ArrowUpDown size={14} /></button>
                            </span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-neutral-200">
                        {currentPagePosts.map((post) => {
                          const postAny = post as { platformPostId?: string };
                          const thumbnailSrc = post.platform === 'TWITTER' && postAny.platformPostId && selectedAccount?.id
                            ? `/api/post-image?accountId=${encodeURIComponent(selectedAccount.id)}&postId=${encodeURIComponent(postAny.platformPostId)}`
                            : post.thumbnailUrl;
                          return (
                          <tr key={post.id} className="hover:bg-neutral-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                {thumbnailSrc ? (
                                  <img
                                    src={thumbnailSrc}
                                    alt=""
                                    className="w-12 h-12 rounded object-cover shrink-0"
                                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement | null)?.style.removeProperty('display'); }}
                                  />
                                ) : null}
                                <div
                                  className="w-12 h-12 rounded bg-neutral-100 flex items-center justify-center shrink-0"
                                  style={{ display: thumbnailSrc ? 'none' : 'flex' }}
                                >
                                  {PLATFORM_ICON[post.platform]}
                                </div>
                                <div className="min-w-0 max-w-[220px]">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 text-neutral-400">{PLATFORM_ICON[post.platform]}</span>
                                    <p className="text-sm text-neutral-900 truncate">{post.content || 'No caption'}</p>
                                  </div>
                                  {post.permalinkUrl && (
                                    <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:underline inline-flex items-center gap-0.5">
                                      Open <ExternalLink size={12} />
                                    </a>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{(post as { impressions?: number }).impressions ?? 0}</td>
                            <td className="px-4 py-3 text-sm text-neutral-600">{(post as { likeCount?: number }).likeCount ?? 0}</td>
                            <td className="px-4 py-3 text-sm text-neutral-500">{(post as { commentsCount?: number }).commentsCount ?? 0}</td>
                            <td className="px-4 py-3 text-sm text-neutral-500">{(post as { sharesCount?: number }).sharesCount ?? 0}</td>
                            <td className="px-4 py-3 text-sm text-neutral-500">{(post as { repostsCount?: number }).repostsCount ?? 0}</td>
                            <td className="px-4 py-3 text-sm text-neutral-500 whitespace-nowrap">{new Date(post.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          </tr>
                          );
                        })}
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
            </div>{/* end importedPostsLoading hide wrapper */}
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
