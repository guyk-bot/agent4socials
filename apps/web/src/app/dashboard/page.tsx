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
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import { FacebookAnalyticsView, PlatformAnalyticsHeader, AnalyticsGrid, AnalyticsGridItem, AnalyticsWatermarkedChart } from '@/components/analytics';
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
    const accountIdsKey = accountIds.sort().join(',');
    const syncAllFirst = syncAllRequestedRef.current !== accountIdsKey;
    if (syncAllFirst) syncAllRequestedRef.current = accountIdsKey;

    const runSync = (withSync: boolean) => {
      const timeoutMs = withSync ? 60_000 : 25_000;
      Promise.allSettled(
        accounts.map((acc) =>
          api.get(`/social/accounts/${acc.id}/posts`, { params: withSync ? { sync: 1 } : {}, timeout: timeoutMs }).then((r) => ({
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
    };

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
        // Auto-sync in background so posts stay fresh without clicking "Sync posts"
        runSync(true);
        return;
      }
    }
    setImportedPostsLoading(true);
    setAllPostsSyncError(null);
    runSync(syncAllFirst);
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
  const postsSectionDays = dateRange.start && dateRange.end ? Math.max(1, Math.ceil((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (24 * 60 * 60 * 1000))) : 0;
  const postsShowWatermark = postsSectionDays > 30;

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
    ? (insights?.pageViewsTotal ?? insights?.profileViewsTotal ?? aggregatedInsights?.totalPageViews ?? aggregatedInsights?.totalProfileViews ?? 0)
    : (aggregatedInsights?.totalPageViews ?? aggregatedInsights?.totalProfileViews ?? 0);
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
  // Views/impressions (or Tweets for X) chart: use time series or flat line so we always show a real chart like other platforms
  const effectiveViewsOrTweets = isTwitter ? effectiveTweets : effectiveImpressions;
  const displayTimeSeries =
    hasNonZeroSeries
      ? effectiveTimeSeries
      : selectedAccount
        ? [{ date: startDate, value: effectiveViewsOrTweets }, { date: endDate, value: effectiveViewsOrTweets }]
        : effectiveImpressions > 0
          ? [{ date: startDate, value: effectiveImpressions }, { date: endDate, value: effectiveImpressions }]
          : [];
  // Followers chart: use its own series. When we have no historical data, show flat line at current count (including 0) so X matches IG/FB.
  const followersTimeSeries = (insights as { followersTimeSeries?: Array<{ date: string; value: number }> })?.followersTimeSeries;
  const displayFollowersTimeSeries =
    followersTimeSeries?.length
      ? followersTimeSeries
      : selectedAccount
        ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
        : !selectedAccount && aggregatedInsights
          ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
          : [];
  const maxImpressions = displayTimeSeries.length ? Math.max(...displayTimeSeries.map((d) => d.value), 1) : 1;
  const showViewsHint = hasFbOrIg && effectiveFollowers > 0 && effectiveImpressions === 0 && !effectiveTimeSeries.some((d) => d.value > 0) && (selectedAccount?.platform === 'INSTAGRAM' || !selectedAccount);
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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              const end = new Date();
              const start = new Date();
              start.setDate(start.getDate() - 29);
              setDateRange({ start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) });
            }}
            className="text-sm font-medium text-neutral-600 hover:text-neutral-900 px-3 py-1.5 rounded-md hover:bg-neutral-100"
          >
            Last 30 days
          </button>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-neutral-200 rounded-lg shrink-0">
            <Calendar size={16} className="text-neutral-500" />
            <input type="date" value={dateRange.start} onChange={(e) => setDateRange((r) => ({ ...r, start: e.target.value }))} className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-neutral-700 w-[7.5rem]" />
            <span className="text-neutral-400">–</span>
            <input type="date" value={dateRange.end} onChange={(e) => setDateRange((r) => ({ ...r, end: e.target.value }))} className="text-sm border-0 bg-transparent focus:ring-0 p-0 text-neutral-700 w-[7.5rem]" />
          </div>
        </div>
      </div>

      {/* Instagram-only: analytics and posts not available; CTA to connect with Facebook */}
      {selectedAccount?.platform === 'INSTAGRAM' && (selectedAccount as { instagramLoginOnly?: boolean }).instagramLoginOnly && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 px-4 py-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-900">
            <strong>Analytics and posts are not available</strong> when connected with Instagram only. Connect with Facebook to unlock full analytics, post history, and insights on both the Account and Posts tabs.
          </p>
          <button
            type="button"
            onClick={() => setSelectedPlatformForConnect('INSTAGRAM')}
            className="shrink-0 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Connect with Facebook for full features
          </button>
        </div>
      )}

      {/* Account block: profile link when one account selected; "All connected" or connect CTA otherwise */}
      <div className="mt-6 flex flex-col gap-3">
        {selectedAccount ? (
          <>
            <PlatformAnalyticsHeader
              account={{
                id: selectedAccount.id,
                platform: selectedAccount.platform,
                username: selectedAccount.username,
                profilePicture: selectedAccount.profilePicture,
              }}
              profileUrl={profileUrlForAccount(selectedAccount)}
              platformLabel={selectedAccount.platform === 'TWITTER' ? 'Twitter/X' : selectedAccount.platform.charAt(0) + selectedAccount.platform.slice(1).toLowerCase()}
              icon={PLATFORM_ICON[selectedAccount.platform]}
              onReconnect={async () => {
                if (reconnectingId) return;
                setReconnectingId(selectedAccount.id);
                try {
                  const res = await api.get(`/social/oauth/${selectedAccount.platform.toLowerCase()}/start`);
                  const url = res?.data?.url;
                  if (url && typeof url === 'string') window.location.href = url;
                } catch (_) {}
                setReconnectingId(null);
              }}
              onDisconnectClick={() => { if (!disconnectingId) setDisconnectConfirmOpen(true); }}
              onCheckPermissions={(selectedAccount.platform === 'INSTAGRAM' || selectedAccount.platform === 'FACEBOOK') ? async () => {
                if (tokenDebugLoading) return;
                setTokenDebugLoading(selectedAccount.id);
                try {
                  const res = await api.get(`/social/accounts/${selectedAccount.id}/token-debug`);
                  const d = res.data as {
                    isValid?: boolean;
                    scopes?: string[];
                    hasPublishScope?: boolean;
                    hasFacebookInsightsScope?: boolean;
                    hasInstagramInsightsScope?: boolean;
                    expiresAt?: number;
                  };
                  const exp = d.expiresAt ? new Date(d.expiresAt * 1000).toISOString().slice(0, 10) : 'N/A';
                  const scopeList = (d.scopes ?? []).join(', ') || 'none';
                  const fbInsights = d.hasFacebookInsightsScope ? 'yes' : 'no';
                  const igInsights = d.hasInstagramInsightsScope ? 'yes' : 'no';
                  const msg = `Token valid: ${d.isValid ?? false}. Publish scope: ${d.hasPublishScope ? 'yes' : 'no'}. Expires: ${exp}.\n\nFacebook Page insights (read_insights): ${fbInsights}.\nInstagram insights (instagram_manage_insights): ${igInsights}.\n\nAll scopes: ${scopeList}`;
                  setAlertMessage(msg);
                } catch (e: unknown) {
                  const err = e as { response?: { data?: { message?: string; error?: string } } };
                  setAlertMessage(err?.response?.data?.message ?? err?.response?.data?.error ?? 'Could not validate token.');
                }
                setTokenDebugLoading(null);
              } : undefined}
              reconnectLoading={reconnectingId === selectedAccount.id}
              checkPermissionsLoading={tokenDebugLoading === selectedAccount.id}
              disconnectLoading={disconnectingId === selectedAccount.id}
              extraActions={selectedAccount.platform === 'TWITTER' && !(selectedAccount as { imageUploadEnabled?: boolean }).imageUploadEnabled ? (
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
                  className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-neutral-200 bg-white text-[#374151] text-sm font-medium hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {enablingTwitter1oa ? <RefreshCw size={16} className="animate-spin" /> : <Image size={16} />}
                  Enable image upload
                </button>
              ) : undefined}
            />
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
                  setImportedPosts([]);
                  appData?.clearAccountData(accountIdToRemove);
                  router.replace('/dashboard', { scroll: false });
                  try {
                    await api.delete(`/social/accounts/${accountIdToRemove}`);
                    const res = await api.get(`/social/accounts?_=${Date.now()}`);
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
        <div className="mt-6 space-y-6 max-w-full" style={{ maxWidth: 1400 }}>
          {selectedAccount ? (
          <FacebookAnalyticsView
            insights={(() => {
              const base: import('@/components/analytics/facebook/types').FacebookInsights = {
                platform: selectedAccount.platform,
                followers: effectiveFollowers,
                impressionsTotal: effectiveImpressions,
                impressionsTimeSeries: effectiveTimeSeries,
                pageViewsTotal: effectivePageVisits,
                reachTotal: effectiveReach,
                profileViewsTotal: effectiveProfileViews,
                followersTimeSeries: displayFollowersTimeSeries,
                ...(insights && {
                  insightsHint: insights.insightsHint,
                  growthTimeSeries: insights.growthTimeSeries as Array<{ date: string; gained: number; lost: number; net?: number }> | undefined,
                }),
              };
              return base;
            })()}
            posts={importedPosts.filter((p: { platform: string }) => p.platform === selectedAccount.platform) as import('@/components/analytics/facebook/types').FacebookPost[]}
            dateRange={dateRange}
            insightsLoading={effectiveInsightsLoading}
            postsLoading={importedPostsLoading}
            onUpgrade={() => router.push('/pricing')}
            followersLabel={selectedAccount.platform === 'YOUTUBE' ? 'Subscribers' : 'Followers'}
          />
          ) : hasAccounts ? (
            <p className="text-sm text-neutral-500 py-8">Select an account in the left sidebar to see its analytics.</p>
          ) : null}
        </div>
      )}

      {analyticsTab === 'posts' && (
          <div className="mt-6 space-y-6 max-w-full" style={{ maxWidth: 1400 }}>
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
            {postsShowWatermark && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 mb-6">
                <p className="text-sm text-indigo-800">
                  You're viewing more than 30 days. Upgrade to remove watermarks and view full history.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/pricing')}
                  className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                >
                  Upgrade plan
                </button>
              </div>
            )}
            <AnalyticsGrid>
              <AnalyticsGridItem span={12}>
                <AnalyticsWatermarkedChart title="Interactions" height={240} showWatermark={postsShowWatermark}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-2xl font-bold text-[#111827] tabular-nums">{totalInteractions.toLocaleString()}</p>
                    <div className="flex gap-1.5 flex-wrap justify-end max-w-[160px]">
                      {Array.from(new Set(importedPosts.map((p) => p.platform))).map((pl) => {
                        const count = importedPosts.filter((p) => p.platform === pl).reduce((s, p) => s + p.interactions, 0);
                        const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-sky-100 text-sky-800' : 'bg-neutral-100 text-neutral-700';
                        return <span key={pl} className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{count.toLocaleString()}</span>;
                      })}
                    </div>
                  </div>
                  <div className="w-full" style={{ height: 200 }}>
                    {interactionsTabDisplaySeries.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={interactionsTabDisplaySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barSize={12}>
                          <defs>
                            <linearGradient id="postsInteractionsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#E1306C" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#E1306C" stopOpacity={0.6} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => { try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return v; } }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <RechartTooltip
                            content={(props) => {
                              const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }>; label?: string };
                              if (!active || !payload?.length || !label) return null;
                              return (
                                <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                                  <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                                  <p className="font-medium mt-0.5">{(payload[0]?.value ?? 0).toLocaleString()} interactions</p>
                                </div>
                              );
                            }}
                            cursor={{ fill: 'rgba(225,48,108,0.08)' }}
                          />
                          <Bar dataKey="value" name="Interactions" radius={[4, 4, 0, 0]} fill="url(#postsInteractionsGrad)" isAnimationActive animationDuration={400} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No chart data yet</div>
                    )}
                  </div>
                </AnalyticsWatermarkedChart>
              </AnalyticsGridItem>
              <AnalyticsGridItem span={12}>
                <AnalyticsWatermarkedChart title="Number of Posts" height={240} showWatermark={postsShowWatermark}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-2xl font-bold text-[#111827] tabular-nums">{importedPosts.length.toLocaleString()}</p>
                    <div className="flex gap-1.5 flex-wrap justify-end max-w-[160px]">
                      {Array.from(new Set(importedPosts.map((p) => p.platform))).map((pl) => {
                        const count = importedPosts.filter((p) => p.platform === pl).length;
                        const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-sky-100 text-sky-800' : 'bg-neutral-100 text-neutral-700';
                        return <span key={pl} className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{count}</span>;
                      })}
                    </div>
                  </div>
                  <div className="w-full" style={{ height: 200 }}>
                    {postsTabDisplaySeries.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={postsTabDisplaySeries} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barSize={12}>
                          <defs>
                            <linearGradient id="postsCountGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.6} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(107,114,128,0.08)" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false}
                            tickFormatter={(v) => { try { return new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return v; } }} />
                          <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <RechartTooltip
                            content={(props) => {
                              const { active, payload, label } = props as unknown as { active?: boolean; payload?: Array<{ value?: number }>; label?: string };
                              if (!active || !payload?.length || !label) return null;
                              return (
                                <div className="bg-[#111827] text-white text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
                                  <p className="text-neutral-300">{new Date(label).toLocaleDateString(undefined, { dateStyle: 'medium' })}</p>
                                  <p className="font-medium mt-0.5">{(payload[0]?.value ?? 0).toLocaleString()} posts</p>
                                </div>
                              );
                            }}
                            cursor={{ fill: 'rgba(99,102,241,0.08)' }}
                          />
                          <Bar dataKey="value" name="Posts" radius={[4, 4, 0, 0]} fill="url(#postsCountGrad)" isAnimationActive animationDuration={400} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-neutral-400 text-sm">No chart data yet</div>
                    )}
                  </div>
                </AnalyticsWatermarkedChart>
              </AnalyticsGridItem>
            </AnalyticsGrid>

            {/* List of posts — same card style as Account analytics */}
            <div className="bg-white rounded-2xl p-6 border border-[rgba(0,0,0,0.06)] shadow-[0_4px_16px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.06)] transition-all duration-150 overflow-hidden">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <p className="text-sm font-semibold text-[#111827]">List of posts</p>
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
              <div className="border border-neutral-100 rounded-xl overflow-hidden bg-neutral-50/50">
                <div className="flex items-center gap-2 p-3 border-b border-neutral-100 flex-wrap bg-white">
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
