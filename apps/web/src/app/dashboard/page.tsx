'use client';

import React, { useCallback, useEffect, useLayoutEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { useAccountsCache, upsertOptimisticConnectedAccount } from '@/context/AccountsCacheContext';
import { useAppData, getDefaultDateRange } from '@/context/AppDataContext';
import { useSelectedAccount, useResolvedSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import api from '@/lib/api';
import {
  readDashboardInsightsSession,
  writeDashboardInsightsSession,
  readInsightsFromLocalStorage,
  readYouTubeExtendedCache,
  writeYouTubeExtendedCache,
  STALE_CACHE_MAX_AGE_MS,
  clearStoredInsightsForAccount,
} from '@/lib/dashboard-insights-session-cache';
import { stripLegacyInsightsHint } from '@/lib/strip-legacy-insights-hint';
import { markInboxAccountRecentlyConnected } from '@/lib/inbox/inbox-recent-connect';
import {
  buildDashboardSuccessRedirect,
  clearPostConnectOAuthUrlParams,
  readCachedAccountIdsFromStorage,
  readPendingConnectActiveBrand,
  storePendingConnectNav,
} from '@/lib/brand-account-move';
import { triggerInboxWarmClient } from '@/lib/inbox/trigger-inbox-warm-client';

const CONNECT_LOAD_DONE_KEY = (accountId: string) => `a4s_connect_load_done_${accountId}`;

function clearConnectLoadDone(accountId: string): void {
  if (typeof window === 'undefined' || !accountId) return;
  try {
    sessionStorage.removeItem(CONNECT_LOAD_DONE_KEY(accountId));
  } catch {
    /* ignore */
  }
}

function isConnectLoadDone(accountId: string): boolean {
  if (typeof window === 'undefined' || !accountId) return false;
  try {
    return sessionStorage.getItem(CONNECT_LOAD_DONE_KEY(accountId)) === '1';
  } catch {
    return false;
  }
}

function markConnectLoadDone(accountId: string): void {
  if (typeof window === 'undefined' || !accountId) return;
  try {
    sessionStorage.setItem(CONNECT_LOAD_DONE_KEY(accountId), '1');
  } catch {
    /* ignore */
  }
}

function isOAuthConnectSyncActive(accountId: string | undefined | null, justConnected: boolean): boolean {
  return Boolean(justConnected && accountId && !isConnectLoadDone(accountId));
}

/** Fallback: dismiss connect banner if background sync stalls (sidebar stays usable). */
const CONNECT_FINISH_MAX_MS = 12_000;

const DASHBOARD_AFTER_CONNECT_PATH = '/dashboard';

import {
  listenForOAuthComplete,
  notifyOAuthOpenerAndClose,
  closeOAuthConnectPopup,
  navigateOAuthConnect,
  openOAuthConnectUrl,
  prepareOAuthConnectPopup,
  storeOAuthConnectInFlight,
  clearOAuthConnectInFlight,
  clearOAuthConnectInFlightForPlatform,
  readOAuthConnectInFlight,
  OAUTH_CONNECT_IN_FLIGHT_EVENT,
  ACCOUNT_DISCONNECTED_EVENT,
  watchOAuthConnectPopup,
  isPlatformOAuthPending,
  pollOAuthConnectAccount,
  notifyOAuthCompleteLocally,
} from '@/lib/oauth-connect';
import { PlatformConnectLoading } from '@/components/PlatformConnectLoading';
import {
  localCalendarDateFromIso,
  toLocalCalendarDate,
  readStoredAnalyticsDateRange,
  writeStoredAnalyticsDateRange,
} from '@/lib/calendar-date';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import { ConfirmModal } from '@/components/ConfirmModal';
import ConnectView from '@/components/dashboard/ConnectView';
import { useRedirectIfNoConnectedAccounts } from '@/hooks/useRedirectIfNoConnectedAccounts';
import { shouldStayOnPageAfterOAuthConnect } from '@/lib/dashboard-onboarding';
import {
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Image,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  ArrowUpDown,
} from 'lucide-react';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon, ThreadsIcon } from '@/components/SocialPlatformIcons';
import { PostContentPreviewThumb } from '@/components/PostContentPreviewThumb';
import { InteractiveLineChart } from '@/components/charts/InteractiveLineChart';
import { FacebookAnalyticsView, AnalyticsGrid, AnalyticsGridItem, AnalyticsWatermarkedChart } from '@/components/analytics';
import type { FacebookFrontendAnalyticsBundle } from '@/lib/facebook/frontend-analytics-bundle';
import type { FacebookInsights } from '@/components/analytics/facebook/types';
import { PricingPlansGrid } from '@/components/landing/pricing';
import type { Demographics, GrowthDataPoint, TrafficSourceItem } from '@/types/analytics';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';

/** Instagram hits many Meta endpoints; default axios 25s often aborts before the API route finishes. */
const INSIGHTS_HTTP_MS = 70_000;
const MANUAL_SYNC_PENDING_KEY = 'a4s_manual_sync_pending_account_id';

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
  dataReady,
}: {
  platform?: string | null;
  insightsLoading: boolean;
  postsLoading: boolean;
  /** True when analytics payload is on screen (not just "requests finished"). */
  dataReady: boolean;
}) {
  const platformIcons: Record<string, React.ReactNode> = {
    INSTAGRAM: <InstagramIcon size={29} />,
    FACEBOOK: <FacebookIcon size={29} />,
    TIKTOK: <TikTokIcon size={29} />,
    YOUTUBE: <YoutubeIcon size={29} />,
    TWITTER: <XTwitterIcon size={29} className="text-neutral-800" />,
    LINKEDIN: <LinkedinIcon size={29} />,
    PINTEREST: <PinterestIcon size={29} />,
    THREADS: <ThreadsIcon size={29} />,
  };
  /** Same violet → fuchsia → rose gradient on every platform (matches Upgrade / Get Pro CTA). */
  const grad = 'from-[#7C3AED] via-[#7C3AED] to-[#A78BFA]';
  const icon = platform ? platformIcons[platform] : null;
  const analyticsStep = dataReady ? 'done' : insightsLoading ? 'loading' : 'pending';
  const postsStep = postsLoading ? 'loading' : 'done';
  const allDone = dataReady && !postsLoading;

  const Step = ({ state, label }: { state: 'done' | 'loading' | 'pending'; label: string }) => (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
        state === 'done' ? 'bg-white/95 text-orange-700' :
        state === 'loading' ? 'bg-white/25 text-chrome-text' : 'bg-white/30 text-chrome-text/60'
      }`}>
        {state === 'done' ? '✓' : state === 'loading' ? (
          <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : '○'}
      </div>
      <span className={`text-xs font-medium truncate ${
        state === 'done' ? 'text-chrome-text' : state === 'loading' ? 'text-chrome-text/90' : 'text-chrome-text/50'
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
            <div className="relative w-8 h-8 flex items-center justify-center">
              {icon}
            </div>
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-chrome-text text-sm leading-tight">
            {allDone ? 'Data loaded! Your account is ready.' : 'Loading your data…'}
          </p>
          <p className="text-chrome-text/70 text-xs mt-0.5">
            {allDone ? 'Scroll down to see analytics and posts.' : 'This takes a few seconds. The page will update automatically.'}
          </p>
          {/* steps */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3">
            <Step state="done" label="Account connected" />
            <Step state={analyticsStep} label="Analytics" />
            <Step state={postsStep} label="Posts & history" />
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
  PINTEREST: <PinterestIcon size={22} />,
  THREADS: <ThreadsIcon size={22} />,
};

/** First (or Facebook-style) posts fetch should hit the importer so analytics tabs are not empty. */
function postImportSyncOnFirstLoad(platform: string | undefined): boolean {
  return (
    platform === 'FACEBOOK' ||
    platform === 'INSTAGRAM' ||
    platform === 'TIKTOK' ||
    platform === 'YOUTUBE' ||
    platform === 'LINKEDIN' ||
    platform === 'TWITTER' ||
    platform === 'PINTEREST' ||
    platform === 'THREADS'
  );
}

/** TikTok needs force=1 more often so latest video.list metrics appear right after upload. */
function postsSyncParamsForPlatform(
  platform: string | undefined,
  opts?: { explicitSync?: boolean }
): { sync?: 1; force?: 1 } {
  if (!postImportSyncOnFirstLoad(platform)) return {};
  if (platform === 'TIKTOK') return { sync: 1, force: 1 };
  if (platform === 'THREADS') return { sync: 1, force: 1 };
  if (platform === 'LINKEDIN') return { sync: 1, force: 1 };
  // Instagram/Facebook: never auto sync=1 on dashboard load (cron + manual Sync only).
  if (platform === 'INSTAGRAM' || platform === 'FACEBOOK') {
    return opts?.explicitSync ? { sync: 1, force: 1 } : {};
  }
  if (opts?.explicitSync) return { sync: 1, force: 1 };
  return { sync: 1 };
}

/**
 * Keep Page-level chart bundles when a same-range refresh omits them (e.g. transient API error).
 * NEVER called when the date range has changed — stale period-specific data from the previous
 * window would cause engagement / impressions / traffic to appear stuck.
 */
function mergeFacebookPageInsightsPreserve(
  data: Record<string, unknown>,
  prev: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!prev) return data;
  const merged = { ...data };
  if (!merged.facebookAnalytics && prev.facebookAnalytics) {
    merged.facebookAnalytics = prev.facebookAnalytics;
  }
  if (merged.facebookPageMetricSeries == null && prev.facebookPageMetricSeries != null) {
    merged.facebookPageMetricSeries = prev.facebookPageMetricSeries;
  }
  return merged;
}

export default function DashboardPage() {
  useRedirectIfNoConnectedAccounts();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { openSignup } = useAuthModal();
  const {
    cachedAccounts,
    allCachedAccounts,
    activeBrandId,
    setCachedAccounts,
    accountsLoadError,
    setAccountsLoadError,
    finishPostConnectBrandAssignment,
    maybePromptBrandMove,
  } = useAccountsCache() ?? {
    cachedAccounts: [],
    allCachedAccounts: [],
    activeBrandId: 'brand-default',
    setCachedAccounts: () => {},
    accountsLoadError: null,
    setAccountsLoadError: () => {},
    finishPostConnectBrandAssignment: () => 'noop' as const,
    maybePromptBrandMove: () => false,
  };
  const appData = useAppData();
  const shouldApplyVisibleChartUpdate = () =>
    typeof document === 'undefined' || document.visibilityState === 'visible';
  /** Stable ref so effects do not re-run on every AppDataProvider render (prefetch updates replace context value). */
  const appDataRef = useRef(appData);
  appDataRef.current = appData;
  const finishPostConnectRef = useRef(finishPostConnectBrandAssignment);
  finishPostConnectRef.current = finishPostConnectBrandAssignment;
  const maybePromptBrandMoveRef = useRef(maybePromptBrandMove);
  maybePromptBrandMoveRef.current = maybePromptBrandMove;
  /** Prevents duplicate OAuth post-connect runs when unstable deps re-render mid-fetch. */
  const postConnectProcessedKeyRef = useRef<string | null>(null);
  /** OAuth account id kept after we strip ?accountId= from the URL for a clean /dashboard. */
  const pendingPostConnectAccountIdRef = useRef<string | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  userIdRef.current = user?.id;
  /** Keeps posts-fetch callbacks aligned with the selected analytics account for TikTok insights invalidation. */
  const selectedAccountRef = useRef<SocialAccount | null>(null);
  /** TikTok: after `video.list` ingest, bump seal so insights cache locks reopen and stored zeros refresh. */
  const invalidateInsightsCachesAfterTikTokSyncRef = useRef<(accountId: string) => void>(() => {});
  const afterTikTokPostsImportIfNeededRef = useRef<
    (
      accountId: string,
      platform: string | undefined,
      requestParams: { sync?: number },
      syncError: string | null | undefined
    ) => void
  >(() => {});
  const { selectedAccountId, selectedPlatformForConnect, clearSelection, setSelectedAccountId, setSelectedPlatformForConnect } =
    useSelectedAccount() ?? {
    selectedAccountId: null,
    selectedPlatformForConnect: null,
    clearSelection: () => {},
    setSelectedAccountId: () => {},
    setSelectedPlatformForConnect: () => {},
  };
  const selectedAccount = useResolvedSelectedAccount(cachedAccounts as SocialAccount[]);
  const accounts = (cachedAccounts as SocialAccount[]) ?? [];
  const accountIdFromUrl = searchParams.get('accountId');
  const connectingParam = searchParams.get('connecting');
  const brandMovedParam = searchParams.get('brandMoved') === '1';
  const brandKeptParam = searchParams.get('brandKept') === '1';
  const postConnectReturn = connectingParam === '1' || brandMovedParam || brandKeptParam;

  /** Resolved account for analytics; stub from OAuth URL until accounts API returns. */
  const analyticsAccount = useMemo((): SocialAccount | null => {
    if (selectedAccount) return selectedAccount;
    if (!selectedAccountId) return null;
    const fromList = accounts.find((a) => a.id === selectedAccountId);
    if (fromList) return fromList as SocialAccount;
    const fromAll = allCachedAccounts.find((a) => a.id === selectedAccountId);
    if (fromAll) return fromAll as SocialAccount;
    const platformParam = searchParams.get('newPlatform');
    const stubId = selectedAccountId ?? accountIdFromUrl;
    if (postConnectReturn && platformParam && stubId) {
      return {
        id: stubId,
        platform: platformParam.toUpperCase(),
        username: searchParams.get('newUsername') ?? platformParam,
        profilePicture: searchParams.get('newPic'),
      };
    }
    return null;
  }, [selectedAccount, selectedAccountId, accountIdFromUrl, accounts, allCachedAccounts, postConnectReturn, searchParams]);
  selectedAccountRef.current = analyticsAccount;
  const [justConnected, setJustConnected] = useState(false);

  const [stats, setStats] = useState({ accounts: 0, scheduled: 0, posted: 0, failed: 0 });
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  /** Brief: fetching OAuth start URL / opening popup. Does not show full-page connect loading. */
  const [oauthLaunchingPlatform, setOauthLaunchingPlatform] = useState<string | null>(null);
  const [oauthLaunchingMethod, setOauthLaunchingMethod] = useState<string | undefined>(undefined);
  const [oauthInFlightPlatform, setOauthInFlightPlatform] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readOAuthConnectInFlight() : null
  );
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [analyticsTab, setAnalyticsTab] = useState('account');
  const [importedPosts, setImportedPosts] = useState<Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const accountId = localStorage.getItem('agent4socials_selected_account_id');
      if (!accountId) return [];
      const raw = localStorage.getItem('appData_cache_v2');
      if (!raw) return [];
      const blob = JSON.parse(raw);
      const posts = blob?.postsByAccountId?.[accountId];
      return Array.isArray(posts) ? posts : [];
    } catch {
      return [];
    }
  });
  const [importedPostsLoading, setImportedPostsLoading] = useState(false);
  /** True while a backend sync is in progress for the selected account. */
  const [postsSoftSyncing, setPostsSoftSyncing] = useState(false);
  const syncStatusPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarRefreshDoneForAccountRef = useRef<Record<string, true>>({});
  const [postsSyncError, setPostsSyncError] = useState<string | null>(null);
  const [allPostsSyncError, setAllPostsSyncError] = useState<string | null>(null);
  const [syncAllTrigger, setSyncAllTrigger] = useState(0);
  /** Increments when TikTok posts sync completes for the selected account so insights refetch includes ImportedPost metrics. */
  const [tiktokInsightsResyncSeal, setTiktokInsightsResyncSeal] = useState(0);
  const [dateRange, setDateRange] = useState(() => getDefaultDateRange());
  /**
   * Hydrate date range from session storage only once per mounted dashboard.
   * Auth/session refreshes can flip `user?.id` and re-run this effect, which
   * re-applies a different stored range and shifts chart x-axis/domain,
   * producing the "candles jump when I return to the tab" glitch.
   */
  const dateRangeHydratedRef = useRef(false);
  useEffect(() => {
    if (dateRangeHydratedRef.current) return;
    if (!user?.id) return;
    const stored = readStoredAnalyticsDateRange(user.id);
    if (stored) setDateRange(stored);
    dateRangeHydratedRef.current = true;
  }, [user?.id]);

  // When the selected account changes, reset the syncing indicator.
  useEffect(() => {
    if (!analyticsAccount?.id) return;
    setPostsSoftSyncing(false);
  }, [analyticsAccount?.id]);

  // Keep sync state alive across page navigation:
  // when the user comes back to analytics, resume from backend sync-status
  // instead of resetting to "Sync now".
  useEffect(() => {
    if (!analyticsAccount?.id) return;
    let cancelled = false;
    const accountId = analyticsAccount.id;
    // Rehydrate pending manual sync flag after navigation/remount.
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem(MANUAL_SYNC_PENDING_KEY) === accountId) {
        setPostsSoftSyncing(true);
      }
    } catch {
      // ignore storage errors
    }

    const pollSyncStatus = async () => {
      try {
        const res = await api.get(`/social/accounts/${accountId}/sync-status`);
        if (cancelled) return;
        const d = (res.data ?? {}) as { status?: string; activeJob?: unknown };
        const isActive = d.status === 'syncing' || !!d.activeJob;
        if (selectedAccountIdRef.current !== accountId) return;
        setPostsSoftSyncing(isActive);
        if (isActive) {
          try {
            if (typeof window !== 'undefined') sessionStorage.setItem(MANUAL_SYNC_PENDING_KEY, accountId);
          } catch {
            // ignore storage errors
          }
        } else {
          try {
            if (typeof window !== 'undefined' && sessionStorage.getItem(MANUAL_SYNC_PENDING_KEY) === accountId) {
              sessionStorage.removeItem(MANUAL_SYNC_PENDING_KEY);
            }
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // ignore intermittent status failures; keep current UI state
      } finally {
        if (!cancelled && selectedAccountIdRef.current === accountId) {
          if (syncStatusPollTimerRef.current) clearTimeout(syncStatusPollTimerRef.current);
          syncStatusPollTimerRef.current = setTimeout(pollSyncStatus, 3000);
        }
      }
    };

    void pollSyncStatus();
    return () => {
      cancelled = true;
      if (syncStatusPollTimerRef.current) {
        clearTimeout(syncStatusPollTimerRef.current);
        syncStatusPollTimerRef.current = null;
      }
    };
  }, [analyticsAccount?.id]);

  // Platforms the /refresh endpoint supports (returns a fresh profilePicture URL).
  const REFRESH_SUPPORTED_PLATFORMS = new Set(['FACEBOOK', 'INSTAGRAM', 'TWITTER', 'TIKTOK']);

  // Called by FacebookAnalyticsView when the header avatar image fails to load.
  // Triggers a background refresh to get a fresh URL, then updates the accounts cache
  // so the component re-renders with the new src and gets another chance to show the image.
  const handleAvatarError = useCallback(() => {
    if (!analyticsAccount?.id) return;
    if (!REFRESH_SUPPORTED_PLATFORMS.has(analyticsAccount.platform ?? '')) return;
    if (avatarRefreshDoneForAccountRef.current[analyticsAccount.id]) return;
    avatarRefreshDoneForAccountRef.current[analyticsAccount.id] = true;
    void (async () => {
      try {
        await api.patch(`/social/accounts/${analyticsAccount.id}/refresh`);
        const refreshed = await api.get('/social/accounts');
        const refreshedData = Array.isArray(refreshed.data) ? refreshed.data : [];
        setCachedAccounts(refreshedData);
        // Allow a retry next time the avatar errors (in case the fresh URL also expires).
        delete avatarRefreshDoneForAccountRef.current[analyticsAccount.id];
      } catch {
        // Keep current fallback icon when refresh fails.
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsAccount, setCachedAccounts]);
  const handleAnalyticsDateRangeChange = useCallback(
    (r: { start: string; end: string }) => {
      setDateRange(r);
      if (user?.id) writeStoredAnalyticsDateRange(r, user.id);
    },
    [user?.id]
  );
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [pricingInterval, setPricingInterval] = useState<'monthly' | 'yearly'>('monthly');
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
  } | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const accountId = localStorage.getItem('agent4socials_selected_account_id');
      if (!accountId) return null;
      // Try per-account localStorage first (most reliable, written on every successful fetch)
      const perAccount = readInsightsFromLocalStorage(accountId);
      if (perAccount) return perAccount as Record<string, unknown>;
      // Fall back to AppDataContext blob
      const raw = localStorage.getItem('appData_cache_v2');
      if (!raw) return null;
      const blob = JSON.parse(raw);
      const d = blob?.insightsByAccountId?.[accountId];
      return d && typeof d === 'object' ? d : null;
    } catch {
      return null;
    }
  });
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [liveFbConversationsCount, setLiveFbConversationsCount] = useState<number | null>(null);
  const [liveFbConversationDates, setLiveFbConversationDates] = useState<string[] | null>(null);
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
  const [pageReviews, setPageReviews] = useState<Array<{ created_time: string | null; rating: number | null; recommendation_type: string | null; review_text: string | null; has_rating: boolean; has_review: boolean }>>([]);
  const [pageReviewsLoading, setPageReviewsLoading] = useState(false);
  const [pageReviewsError, setPageReviewsError] = useState<string | null>(null);
  const hasAccounts = accounts.length > 0;

  const fetchAccounts = async (): Promise<SocialAccount[]> => {
    try {
      const res = await api.get('/social/accounts');
      const data = (Array.isArray(res.data) ? res.data : []) as SocialAccount[];
      setCachedAccounts(data);
      setStats((s) => ({ ...s, accounts: data.length }));
      return data;
    } catch (_) {
      return [];
    }
  };

  const twitter1oaNext = searchParams.get('twitter_1oa_next');
  const connectParam = searchParams.get('connect');
  const ALLOWED_CONNECT = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN', 'PINTEREST', 'THREADS'];
  const connectFromUrl = connectParam && ALLOWED_CONNECT.includes(connectParam.toUpperCase())
    ? connectParam.toUpperCase()
    : null;
  const connectErrorFromUrl = searchParams.get('connect_error');
  const oauthReturnInProgress = Boolean(postConnectReturn);
  const connectFlowActive = Boolean(
    oauthReturnInProgress ||
      justConnected ||
      pendingPostConnectAccountIdRef.current ||
      oauthInFlightPlatform ||
      readOAuthConnectInFlight()
  );
  const connectPlatformCandidate = selectedPlatformForConnect || connectFromUrl;
  const platformAlreadyConnected = Boolean(
    connectPlatformCandidate &&
      accounts.some((a) => a.platform === connectPlatformCandidate)
  );
  const showConnectView =
    Boolean(connectPlatformCandidate) && !connectFlowActive && !platformAlreadyConnected;

  const accountIdsKey = accounts.map((a) => a.id).sort().join(',');

  /** After connect, clear stale connect UI and select the account that was just linked. */
  useLayoutEffect(() => {
    if (justConnected && selectedPlatformForConnect) {
      setSelectedPlatformForConnect(null);
    }
  }, [justConnected, selectedPlatformForConnect, setSelectedPlatformForConnect]);

  useLayoutEffect(() => {
    if (!selectedPlatformForConnect || !accountIdsKey) return;
    const existing = accounts.find((a) => a.platform === selectedPlatformForConnect);
    if (!existing?.id) return;
    setSelectedPlatformForConnect(null);
    clearOAuthConnectInFlight();
    setSelectedAccountId(existing.id);
  }, [
    selectedPlatformForConnect,
    accountIdsKey,
    accounts,
    setSelectedPlatformForConnect,
    setSelectedAccountId,
  ]);

  /** Open analytics for a concrete account by default so /dashboard is never an empty "select in sidebar" dead end. */
  useLayoutEffect(() => {
    if (showConnectView || !accountIdsKey) return;

    if (accountIdFromUrl) {
      const fromUrl = accounts.find((a) => a.id === accountIdFromUrl);
      if (fromUrl?.id && selectedAccountId !== fromUrl.id) {
        setSelectedAccountId(fromUrl.id);
      }
      return;
    }

    if (selectedAccountId && accounts.some((a) => a.id === selectedAccountId)) return;

    const first = accounts[0];
    if (first?.id) setSelectedAccountId(first.id);
  }, [
    showConnectView,
    accountIdsKey,
    accountIdFromUrl,
    selectedAccountId,
    accounts,
    setSelectedAccountId,
  ]);

  useEffect(() => {
    if (!connectErrorFromUrl) return;
    clearOAuthConnectInFlight();
    setOauthLaunchingPlatform(null);
    setOauthLaunchingMethod(undefined);
    setAlertMessage(connectErrorFromUrl);
    if (!connectParam) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('connect_error');
    router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }, [connectErrorFromUrl, connectParam, router]);

  // Strip ?connect= during/after OAuth so the Connect form does not flash over the sync banner.
  useEffect(() => {
    if (!connectFlowActive || !connectFromUrl) return;
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('connect')) return;
    url.searchParams.delete('connect');
    url.searchParams.delete('connect_error');
    const next = `${url.pathname}${url.search}${url.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) router.replace(next, { scroll: false });
  }, [connectFlowActive, connectFromUrl, router]);

  // When connect= is in URL (e.g. clicked + from sidebar): open Connect or select existing account.
  useEffect(() => {
    if (!connectParam) return;
    if (connectingParam === '1' || accountIdFromUrl) return;
    const upper = connectParam.toUpperCase();
    if (!ALLOWED_CONNECT.includes(upper)) return;
    const existing = accounts.find((a) => a.platform === upper);
    if (existing?.id) {
      setSelectedPlatformForConnect(null);
      clearOAuthConnectInFlight();
      setSelectedAccountId(existing.id);
      router.replace(`/dashboard?accountId=${encodeURIComponent(existing.id)}`, { scroll: false });
      return;
    }
    setSelectedPlatformForConnect(upper);
    router.replace('/dashboard', { scroll: false });
  }, [
    connectParam,
    connectingParam,
    accountIdFromUrl,
    router,
    setSelectedPlatformForConnect,
    setSelectedAccountId,
    accounts,
  ]);

  // OAuth return: defer account selection until brand assignment runs (avoids wrong-brand analytics flash).
  useLayoutEffect(() => {
    if (!accountIdFromUrl || twitter1oaNext === '1') return;
    if (postConnectReturn) {
      setSelectedPlatformForConnect(null);
      clearOAuthConnectInFlight();
      clearConnectLoadDone(accountIdFromUrl);
      pendingPostConnectAccountIdRef.current = accountIdFromUrl;
      setSelectedAccountId(accountIdFromUrl);
      setJustConnected(true);
      if (!shouldStayOnPageAfterOAuthConnect()) {
        router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
      }
      return;
    }
    setSelectedAccountId(accountIdFromUrl);
  }, [accountIdFromUrl, postConnectReturn, twitter1oaNext, setSelectedAccountId, setSelectedPlatformForConnect, router]);

  // When accountId is in URL: clean URL; after connect refresh cache and clear stale per-account data.
  useEffect(() => {
    const connectAccountId = accountIdFromUrl ?? pendingPostConnectAccountIdRef.current;
    if (!connectAccountId || twitter1oaNext === '1') return;
    const oauthJustConnected =
      connectingParam === '1' ||
      brandMovedParam ||
      brandKeptParam ||
      Boolean(pendingPostConnectAccountIdRef.current);

    if (!oauthJustConnected) {
      if (!accountIdFromUrl) return;
      const fromUrl = accounts.find((a) => a.id === accountIdFromUrl);
      if (fromUrl?.id) {
        setSelectedAccountId(accountIdFromUrl);
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          const oauthNoise =
            url.searchParams.has('connecting') ||
            url.searchParams.has('newPlatform') ||
            url.searchParams.has('newUsername') ||
            url.searchParams.has('newPic');
          if (oauthNoise) {
            url.searchParams.delete('connecting');
            url.searchParams.delete('newPlatform');
            url.searchParams.delete('newUsername');
            url.searchParams.delete('newPic');
            const next = `${url.pathname}${url.search}${url.hash}`;
            const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            if (next !== current) router.replace(next, { scroll: false });
          }
        }
      }
      return;
    }

    if (typeof window !== 'undefined' && window.opener && accountIdFromUrl) {
      const params = new URLSearchParams(window.location.search);
      notifyOAuthOpenerAndClose({
        accountId: connectAccountId,
        platform: params.get('newPlatform') ?? undefined,
        username: params.get('newUsername') ?? undefined,
        profilePicture: params.get('newPic'),
      });
      return;
    }

    const processKey = `${connectAccountId}:${connectingParam}:${brandMovedParam}:${brandKeptParam}`;
    if (postConnectProcessedKeyRef.current === processKey) return;

    let cancelled = false;
    const prevAccountIds = readCachedAccountIdsFromStorage();
    const pendingBrandId = readPendingConnectActiveBrand() ?? activeBrandId;
    const urlPlatform = searchParams.get('newPlatform')?.toUpperCase();
    const urlUsername = searchParams.get('newUsername') ?? undefined;

    void (async () => {
      let list: SocialAccount[] = [];
      try {
        const res = await api.get('/social/accounts');
        list = (Array.isArray(res.data) ? res.data : []) as SocialAccount[];
      } catch {
        list = [];
      }
      if (cancelled) return;

      postConnectProcessedKeyRef.current = processKey;

      if (brandMovedParam || brandKeptParam) {
        setCachedAccounts(list);
        return;
      }

      const connected = list.find((a) => a.id === connectAccountId);
      const platform = connected?.platform ?? urlPlatform;
      if (!platform) {
        router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
        return;
      }

      const successRedirect = DASHBOARD_AFTER_CONNECT_PATH;
      let postConnectResult = finishPostConnectRef.current(
        connectAccountId,
        list,
        { platform, username: connected?.username ?? urlUsername },
        { successRedirect, prevAccountIds, activeBrandIdOverride: pendingBrandId }
      );

      if (postConnectResult !== 'prompt') {
        const prompted = maybePromptBrandMoveRef.current(
          connectAccountId,
          { platform, username: connected?.username ?? urlUsername },
          { successRedirect }
        );
        if (prompted) postConnectResult = 'prompt';
      }

      if (postConnectResult === 'prompt') {
        setCachedAccounts(list);
        clearSelection();
        pendingPostConnectAccountIdRef.current = null;
        router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
        return;
      }

      setCachedAccounts(list);
      delete postsCacheRef.current[connectAccountId];
      singleAccountPostsRunKeyRef.current = '';
      insightsRunKeyRef.current = '';
      if (connected) {
        setSelectedAccountId(connectAccountId);
        markInboxAccountRecentlyConnected(connected.id, connected.platform);
        clearOAuthConnectInFlight();
        if (
          connected.platform === 'INSTAGRAM' ||
          connected.platform === 'FACEBOOK' ||
          connected.platform === 'THREADS'
        ) {
          triggerInboxWarmClient(true);
        }
        setSelectedPlatformForConnect(null);
        setJustConnected(true);
        pendingPostConnectAccountIdRef.current = null;
        if (!shouldStayOnPageAfterOAuthConnect()) {
          router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
        }
        return;
      }
      pendingPostConnectAccountIdRef.current = null;
      clearSelection();
      if (!shouldStayOnPageAfterOAuthConnect()) {
        router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    accountIdFromUrl,
    connectingParam,
    brandMovedParam,
    brandKeptParam,
    twitter1oaNext,
    justConnected,
    router,
    setCachedAccounts,
    setSelectedAccountId,
    activeBrandId,
    clearSelection,
    searchParams,
    accounts,
  ]);

  useEffect(() => {
    return listenForOAuthComplete((payload) => {
      setSelectedPlatformForConnect(null);
      setOauthLaunchingPlatform(null);
      setOauthLaunchingMethod(undefined);
      if (payload.platform) storeOAuthConnectInFlight(payload.platform);
      const { accountId, platform, username, profilePicture } = payload;
      if (accountId && platform) {
        pendingPostConnectAccountIdRef.current = accountId;
        setSelectedAccountId(accountId);
        setCachedAccounts((prev) =>
          upsertOptimisticConnectedAccount(prev, {
            id: accountId,
            platform,
            username,
            profilePicture,
          })
        );
        clearConnectLoadDone(accountId);
        setJustConnected(true);
        singleAccountPostsRunKeyRef.current = '';
        insightsRunKeyRef.current = '';
        if (!shouldStayOnPageAfterOAuthConnect()) {
          router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
        }
      }
      const prevAccountIds = readCachedAccountIdsFromStorage();
      const pendingBrandId = readPendingConnectActiveBrand() ?? activeBrandId;
      void fetchAccounts().then(async (list) => {
        if (!accountId) return;
        const connected = list.find((a) => a.id === accountId);
        const plat = connected?.platform ?? platform ?? 'INSTAGRAM';
        const postConnectResult = finishPostConnectBrandAssignment(
          accountId,
          list,
          connected
            ? { platform: connected.platform, username: connected.username }
            : { platform: plat, username },
          {
            successRedirect: DASHBOARD_AFTER_CONNECT_PATH,
            prevAccountIds,
            activeBrandIdOverride: pendingBrandId,
          }
        );
        if (postConnectResult === 'prompt') {
          setCachedAccounts(list);
          clearSelection();
          pendingPostConnectAccountIdRef.current = null;
          router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
          return;
        }
        setCachedAccounts(list);
        setSelectedAccountId(accountId);
        if (connected) {
          markInboxAccountRecentlyConnected(connected.id, connected.platform);
          clearOAuthConnectInFlight();
          if (
            connected.platform === 'INSTAGRAM' ||
            connected.platform === 'FACEBOOK' ||
            connected.platform === 'THREADS'
          ) {
            triggerInboxWarmClient(true);
          }
        }
        setSelectedPlatformForConnect(null);
        setOauthLaunchingPlatform(null);
        setOauthLaunchingMethod(undefined);
        pendingPostConnectAccountIdRef.current = null;
        if (!shouldStayOnPageAfterOAuthConnect()) {
          router.replace(DASHBOARD_AFTER_CONNECT_PATH, { scroll: false });
        }
      });
    });
  }, [
    fetchAccounts,
    setSelectedAccountId,
    setCachedAccounts,
    finishPostConnectBrandAssignment,
    allCachedAccounts,
    activeBrandId,
    clearSelection,
    router,
  ]);

  useEffect(() => {
    if (connectingParam !== '1' || accountIdFromUrl) return;
    let cancelled = false;
    setJustConnected(true);
    void fetchAccounts().then((list) => {
      if (cancelled) return;
      for (const a of list) {
        if (a.platform === 'INSTAGRAM' || a.platform === 'FACEBOOK') {
          markInboxAccountRecentlyConnected(a.id, a.platform);
        }
      }
    });
    router.replace('/dashboard', { scroll: false });
    return () => {
      cancelled = true;
    };
  }, [connectingParam, accountIdFromUrl, router]);

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
        openOAuthConnectUrl(url);
        router.replace('/dashboard', { scroll: false });
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

  type DashboardPost = { id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string };
  /** Mirror of `importedPosts` state readable from effects without adding it to dep arrays. */
  const importedPostsRef = useRef<DashboardPost[]>(importedPosts);
  importedPostsRef.current = importedPosts;
  const postsCacheRef = useRef<Record<string, DashboardPost[]>>({});
  /** After we have loaded this account's posts from the API once, avoid replacing with empty AppData prefetch noise. */
  const accountPostsHydratedRef = useRef<Record<string, boolean>>({});
  const accountPostsLastSyncAtRef = useRef<Record<string, number>>({});
  const syncAllRequestedRef = useRef<string | null>(null);
  /**
   * Once the single-account posts effect has taken action for a given
   * `${accountId}-${syncAllTrigger}` pair, we lock out further auto-runs.
   * Without this, unrelated dep changes (e.g. `cachedAccounts` getting a new
   * reference after Phase 1, or a React re-render triggered by Phase 2 writing
   * to AppDataContext) would re-enter the effect and swap `importedPosts`
   * out from under the user — causing the "candles change a few seconds after
   * the page opens" behaviour. The lock is released only when the user
   * explicitly syncs, switches accounts, or reloads the tab.
   */
  const singleAccountPostsRunKeyRef = useRef<string>('');

  // Auto-select the platform filter when switching accounts (or reset to 'all' for Summary)
  useEffect(() => {
    setPostsPlatformFilter(analyticsAccount ? analyticsAccount.platform : 'all');
    setPostsPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyticsAccount?.id]);

  useEffect(() => {
    const appCtx = appDataRef.current;
    const postsPhase2Running = Boolean(appCtx?.prefetchHasLoadedOnce && !appCtx?.prefetchPhase2Done);
    const skipInstagramAutoRefresh =
      analyticsAccount?.platform === 'INSTAGRAM' &&
      !isOAuthConnectSyncActive(analyticsAccount.id, justConnected);
    if (analyticsAccount?.id) {
      const accountId = analyticsAccount.id;
      // Guard: skip this branch if we already ran it for the same
      // (account, syncAllTrigger) combination. Unrelated dep changes (like
      // `accounts.map(...)` getting a new reference after Phase 1, or a
      // re-render triggered by Phase 2 writing into AppDataContext) would
      // otherwise cause a second pass that swaps `importedPosts` with newer
      // data, making the charts visibly jump after initial load.
      const connectSync = isOAuthConnectSyncActive(accountId, justConnected) ? 'connect' : 'idle';
      const runKey = `${accountId}:${syncAllTrigger}:${connectSync}`;
      if (singleAccountPostsRunKeyRef.current === runKey) return;
      singleAccountPostsRunKeyRef.current = runKey;
      const refList = postsCacheRef.current[accountId];
      const ctxList = appCtx?.getPosts(accountId);
      // Safety net: if refs/context were cleared (e.g. by the reconnect auto-
      // sync flow) but we already have rendered posts for this account in
      // state, re-populate the caches from that state instead of firing an
      // HTTP fetch and visibly swapping the chart data a few seconds later.
      if (
        syncAllTrigger === 0 &&
        (refList?.length ?? 0) === 0 &&
        (ctxList?.length ?? 0) === 0 &&
        Array.isArray(importedPostsRef.current) &&
        importedPostsRef.current.length > 0 &&
        analyticsAccount?.platform
      ) {
        const platform = analyticsAccount.platform;
        const preserved = importedPostsRef.current.filter((p) => p.platform === platform);
        if (preserved.length > 0) {
          postsCacheRef.current[accountId] = preserved;
          appDataRef.current?.setPostsForAccount(accountId, preserved);
          accountPostsHydratedRef.current[accountId] = true;
          setImportedPostsLoading(false);
          return;
        }
      }
      const hasAnyCachedPosts = ((refList?.length ?? 0) > 0) || ((ctxList?.length ?? 0) > 0);
      const THIRTY_MIN_MS = 30 * 60 * 1000;
      const shouldBackgroundSyncPosts = () => {
        const last = accountPostsLastSyncAtRef.current[accountId] ?? 0;
        return Date.now() - last >= THIRTY_MIN_MS;
      };
      const refreshPostsInBackground = () => {
        // Keep dashboard charts stable after initial render.
        // Threads always re-syncs so post-level likes/replies/reposts stay current.
        if (hasAnyCachedPosts && analyticsAccount?.platform !== 'THREADS') return;
        if (skipInstagramAutoRefresh && hasAnyCachedPosts && !shouldBackgroundSyncPosts()) return;
        const bgParams = postsSyncParamsForPlatform(analyticsAccount?.platform, {
          explicitSync: syncAllTrigger > 0 || isOAuthConnectSyncActive(accountId, justConnected),
        });
        api.get(`/social/accounts/${accountId}/posts`, { params: bgParams })
          .then((res) => {
            const list = res.data?.posts ?? [];
            postsCacheRef.current[accountId] = list;
            accountPostsHydratedRef.current[accountId] = true;
            accountPostsLastSyncAtRef.current[accountId] = Date.now();
            appDataRef.current?.setPostsForAccount(accountId, list);
            if (shouldApplyVisibleChartUpdate() && selectedAccountIdRef.current === accountId) setImportedPosts(list);
            afterTikTokPostsImportIfNeededRef.current(
              accountId,
              analyticsAccount?.platform,
              bgParams,
              res.data?.syncError ?? null
            );
          })
          .catch(() => {});
      };
      // Prefer dashboard ref (last successful fetch) over AppData prefetch: context can briefly hold [] or stale rows and would win with ?? and wipe charts.
      if (refList !== undefined) {
        setImportedPosts(refList);
        setImportedPostsLoading(false);
        refreshPostsInBackground();
        return;
      }
      if (ctxList !== undefined) {
        // Prefetch can leave [] in context before the importer runs; treating that as "no cache"
        // avoids an empty Content History until a background refresh completes (common for X/Pinterest).
        const emptyPrefetch =
          ctxList.length === 0 &&
          !accountPostsHydratedRef.current[accountId] &&
          (analyticsAccount?.platform === 'TWITTER' || analyticsAccount?.platform === 'PINTEREST' || analyticsAccount?.platform === 'THREADS');
        if (!emptyPrefetch) {
          const cached = postsCacheRef.current[accountId];
          if (ctxList.length === 0 && accountPostsHydratedRef.current[accountId] && (cached?.length ?? 0) > 0) {
            setImportedPosts(cached);
          } else {
            setImportedPosts(ctxList);
          }
          setImportedPostsLoading(false);
          refreshPostsInBackground();
          return;
        }
      }
      if (accountPostsHydratedRef.current[accountId]) {
        // Already loaded once — keep whatever is already displayed; do not blank the chart.
        setImportedPostsLoading(false);
        refreshPostsInBackground();
        return;
      }
      setImportedPostsLoading(true);
      const primaryPostsParams = postsSyncParamsForPlatform(analyticsAccount?.platform, {
        explicitSync: syncAllTrigger > 0 || isOAuthConnectSyncActive(accountId, justConnected),
      });
      api.get(`/social/accounts/${accountId}/posts`, { params: primaryPostsParams })
        .then((res) => {
          const list = res.data?.posts ?? [];
          postsCacheRef.current[accountId] = list;
          accountPostsHydratedRef.current[accountId] = true;
          accountPostsLastSyncAtRef.current[accountId] = Date.now();
          appDataRef.current?.setPostsForAccount(accountId, list);
          if (shouldApplyVisibleChartUpdate()) setImportedPosts(list);
          setPostsSyncError(res.data?.syncError ?? null);
          afterTikTokPostsImportIfNeededRef.current(
            accountId,
            analyticsAccount?.platform,
            primaryPostsParams,
            res.data?.syncError ?? null
          );
        })
        .catch(() => { setPostsSyncError(null); })
        .finally(() => setImportedPostsLoading(false));
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
      const results: Array<{ posts: Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }>; syncError?: string }> = [];
      const errors: string[] = [];
      (async () => {
        for (const acc of accounts) {
          try {
            const multiParams = withSync
              ? postsSyncParamsForPlatform(acc.platform, { explicitSync: true })
              : {};
            const r = await api.get(`/social/accounts/${acc.id}/posts`, { params: multiParams, timeout: timeoutMs });
            const posts = r.data?.posts ?? [];
            results.push({ posts, syncError: r.data?.syncError as string | undefined });
            if (r.data?.syncError) errors.push(r.data.syncError as string);
            appDataRef.current?.setPostsForAccount(acc.id, posts);
            afterTikTokPostsImportIfNeededRef.current(acc.id, acc.platform, multiParams, r.data?.syncError ?? null);
          } catch (err: unknown) {
            const e = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
            const msg = e?.response?.data?.message ?? e?.message ?? 'Request failed';
            if (msg.includes('timeout') || msg.includes('Timeout')) {
              errors.push('Sync is taking too long. Try selecting one account in the sidebar and click Sync there, or try again in a moment.');
            } else if (e?.response?.status === 401) {
              errors.push('Session expired. Please log out and log back in.');
            } else {
              errors.push(msg);
            }
          }
        }
        const merged = results.flatMap((r) => r.posts).sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
        setImportedPosts(merged);
        if (errors.length) setAllPostsSyncError(errors[0]);
      })().finally(() => setImportedPostsLoading(false));
    };

    if (appCtx && accountIds.length > 0) {
      const merged: Array<{ id: string; content?: string | null; thumbnailUrl?: string | null; permalinkUrl?: string | null; impressions: number; interactions: number; publishedAt: string; mediaType?: string | null; platform: string }> = [];
      let allCached = true;
      for (const id of accountIds) {
        const list = appCtx.getPosts(id);
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
        // Keep data stable after first render, do not auto-resync in background.
        return;
      }
    }
    if (postsPhase2Running) return;
    setImportedPostsLoading(true);
    setAllPostsSyncError(null);
    runSync(false);
  // Intentionally exclude `appData?.prefetchPhase2Done` to keep charts stable after initial render.
  // Background Phase 2 refreshes should silently update the cache without swapping the
  // currently-rendered posts — explicit sync/date/account changes are the only triggers.
  }, [analyticsAccount?.id, hasAccounts, syncAllTrigger, justConnected, accounts.map((a) => a.id).join(','), analyticsTab]);

  const insightsCacheRef = useRef<Record<string, { platform: string; followers: number; impressionsTotal: number; impressionsTimeSeries: Array<{ date: string; value: number }>; pageViewsTotal?: number; reachTotal?: number; profileViewsTotal?: number }>>({});
  /** Last successful insights payload per account (any date range). Used to avoid full-page skeleton when switching accounts before range cache hits. */
  const lastInsightsByAccountIdRef = useRef<Record<string, Record<string, unknown>>>({});
  /** Timestamp (Date.now()) of when each account's last insights were fetched — guards against showing very stale in-memory data. */
  const lastInsightsFetchedAtRef = useRef<Record<string, number>>({});
  /** Tracks the last `accountId-since-until` key that was loaded so we can detect date-range changes. */
  const prevInsightsLoadKeyRef = useRef<string>('');
  const fbForcedRefreshRef = useRef<Record<string, boolean>>({});
  const selectedAccountIdRef = useRef<string | null>(null);
  /**
   * Locks the main insights effect to a single run per
   * (accountId, dateRange, syncAllTrigger) combination.
   * Otherwise benign dep changes — `appData?.prefetchStatus` flipping from
   * `idle` → `loading` → `done`, or `accounts` getting a new reference after
   * Phase 1 (which triggers a dashboard re-render) — would re-enter the
   * effect and call `setInsights` with whatever AppDataContext happens to
   * hold at that moment, producing the "chart changes after a few seconds"
   * flicker users keep reporting. Explicit syncs still flow through because
   * `syncAllTrigger` is part of the key.
   */
  const insightsRunKeyRef = useRef<string>('');
  const aggregatedCacheRef = useRef<{ key: string; data: { totalFollowers: number; totalImpressions: number; totalReach: number; totalProfileViews: number; totalPageViews: number; byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }>; combinedTimeSeries: Array<{ date: string; value: number }> } } | null>(null);

  /** After OAuth connect, release run-key locks so posts/insights effects re-fetch with sync=1. */
  useEffect(() => {
    if (!justConnected || !analyticsAccount?.id) return;
    singleAccountPostsRunKeyRef.current = '';
    insightsRunKeyRef.current = '';
  }, [justConnected, analyticsAccount?.id]);

  invalidateInsightsCachesAfterTikTokSyncRef.current = (accountId: string) => {
    const uid = userIdRef.current;
    if (uid) clearStoredInsightsForAccount(uid, accountId);
    Object.keys(insightsCacheRef.current).forEach((k) => {
      if (k.startsWith(accountId + '-')) delete insightsCacheRef.current[k];
    });
    delete lastInsightsByAccountIdRef.current[accountId];
    appDataRef.current?.clearInsightsForAccount(accountId);
    setTiktokInsightsResyncSeal((n) => n + 1);
  };

  afterTikTokPostsImportIfNeededRef.current = (
    accountId: string,
    platform: string | undefined,
    requestParams: { sync?: number },
    syncError: string | null | undefined
  ) => {
    const plat = (platform ?? '').toUpperCase();
    if ((plat !== 'TIKTOK' && plat !== 'THREADS') || Number(requestParams.sync) !== 1 || syncError) return;
    if (selectedAccountRef.current?.id !== accountId) return;
    invalidateInsightsCachesAfterTikTokSyncRef.current(accountId);
  };

  // Seed range cache + last-insights from AppData as soon as it exists (localStorage rehydrate or prefetch), no need to wait for prefetchStatus.
  useEffect(() => {
    if (!accounts.length) return;
    const app = appDataRef.current;
    if (!app) return;
    const def = getDefaultDateRange();
    for (const acc of accounts) {
      const d = app.getInsights(acc.id);
      if (!d || typeof d !== 'object') continue;
      const row = d as Record<string, unknown>;
      lastInsightsByAccountIdRef.current[acc.id] = row;
      const key = `${acc.id}-${def.start}-${def.end}`;
      if (!insightsCacheRef.current[key]) {
        insightsCacheRef.current[key] = d as (typeof insightsCacheRef.current)[string];
      }
    }
  }, [accounts.map((a) => a.id).join(','), appData?.cacheRehydrated]);

  // Single-account insights: when an account is selected. Load once; on date change refetch in place without clearing UI.
  // Use appDataRef so context updates (after setInsightsForAccount/setPostsForAccount) don't re-run this effect and cause a loading loop.
  useEffect(() => {
    if (!analyticsAccount?.id || !dateRange.start || !dateRange.end) return;
    // Wait for cache rehydration to complete before checking for cached data
    if (!appData?.cacheRehydrated) return;
    // Lock the main insights effect once we've acted on a given
    // (account, dateRange, sync) combination — see `insightsRunKeyRef` above.
    const connectSync = isOAuthConnectSyncActive(analyticsAccount.id, justConnected) ? 'connect' : 'idle';
    const runKey = `${analyticsAccount.id}:${dateRange.start}:${dateRange.end}:${syncAllTrigger}:${tiktokInsightsResyncSeal}:${connectSync}`;
    if (insightsRunKeyRef.current === runKey) return;
    insightsRunKeyRef.current = runKey;
    const prevAccountId = selectedAccountIdRef.current;
    selectedAccountIdRef.current = analyticsAccount.id;
    const accountId = analyticsAccount.id;
    const isSameAccount = prevAccountId === accountId;
    const cacheKey = `${accountId}-${dateRange.start}-${dateRange.end}`;
    // Detect a date-range change on the *same* account so we can suppress stale data in that case.
    // Stale data from a different date range clusters all chart points at the wrong positions.
    const prevLoadKey = prevInsightsLoadKeyRef.current;
    prevInsightsLoadKeyRef.current = cacheKey;
    const isDateRangeChange = prevLoadKey !== '' && prevLoadKey.startsWith(accountId + '-') && prevLoadKey !== cacheKey;
    const defaultRange = getDefaultDateRange();
    const app = appDataRef.current;
    const defaultRangeMatch =
      dateRange.start === defaultRange.start && dateRange.end === defaultRange.end;
    const prefetchedForDefault = defaultRangeMatch ? app?.getInsights(accountId) : null;
    // Exact cache: in-memory → prefetch state → localStorage (exact date range, no TTL needed).
    const lsExact = readInsightsFromLocalStorage(accountId, undefined, dateRange);
    const ssExact = userIdRef.current ? readDashboardInsightsSession(userIdRef.current, accountId, undefined, dateRange) : null;
    const exactCached =
      (prefetchedForDefault && typeof prefetchedForDefault === 'object'
        ? prefetchedForDefault
        : null) ?? insightsCacheRef.current[cacheKey] ?? lsExact ?? ssExact ?? null;

    // Stale data (possibly different date range): pass dateRange so the cache layer
    // auto-applies the 10-min TTL only when the range doesn't match, preventing the
    // "mountain" artifact (old data from a different range plotted on the wrong axis)
    // while still allowing instant display when the range does match.
    const fromAppInsights = app?.getInsights(accountId);
    const inMemoryAge = Date.now() - (lastInsightsFetchedAtRef.current[accountId] ?? 0);
    const inMemoryExact = inMemoryAge <= STALE_CACHE_MAX_AGE_MS || (() => {
      const d = lastInsightsByAccountIdRef.current[accountId]?._dateRange as { start?: string; end?: string } | undefined;
      return d?.start === dateRange.start && d?.end === dateRange.end;
    })();
    const staleRaw =
      (inMemoryExact ? lastInsightsByAccountIdRef.current[accountId] : null) ??
      (fromAppInsights && typeof fromAppInsights === 'object' ? (fromAppInsights as Record<string, unknown>) : null) ??
      readInsightsFromLocalStorage(accountId, undefined, dateRange) ??
      (userIdRef.current ? readDashboardInsightsSession(userIdRef.current, accountId, undefined, dateRange) : null);
    const staleForAccount =
      staleRaw && typeof staleRaw === 'object' ? (staleRaw as Record<string, unknown>) : null;
    // Pinterest traffic should appear instantly on open; allow a longer same-account fallback payload
    // (any recent range) while fresh insights load in the background.
    const pinterestQuickFallback =
      analyticsAccount?.platform === 'PINTEREST' ||
      analyticsAccount?.platform === 'THREADS'
        ? (
            readInsightsFromLocalStorage(accountId, 6 * 60 * 60 * 1000) ??
            (userIdRef.current
              ? readDashboardInsightsSession(userIdRef.current, accountId, 6 * 60 * 60 * 1000)
              : null)
          )
        : null;
    const metaQuickFallback =
      analyticsAccount?.platform === 'INSTAGRAM' || analyticsAccount?.platform === 'FACEBOOK'
        ? (
            readInsightsFromLocalStorage(accountId, 7 * 24 * 60 * 60 * 1000) ??
            (userIdRef.current
              ? readDashboardInsightsSession(userIdRef.current, accountId, 7 * 24 * 60 * 60 * 1000)
              : null)
          )
        : null;
    const staleCandidate =
      staleForAccount ??
      (pinterestQuickFallback && typeof pinterestQuickFallback === 'object'
        ? (pinterestQuickFallback as Record<string, unknown>)
        : null) ??
      (metaQuickFallback && typeof metaQuickFallback === 'object'
        ? (metaQuickFallback as Record<string, unknown>)
        : null);
    const postsCached = postsCacheRef.current[accountId] ?? app?.getPosts(accountId);
    /** Per-account analytics: posts are loaded only by the posts effect (avoids racing sync vs non-sync and prefetch churn). */
    const accountTabOwnsPosts = analyticsTab === 'account';

    // For YouTube: patch in cached extended data (demographics, trafficSources) when the
    // incoming payload is missing it OR its `byCountry` list is empty. This is what keeps the
    // "Views by country" donut from flashing empty when a background SWR refresh returns a
    // payload in which YouTube Analytics hasn't finished computing the geography breakdown.
    function demographicsLooksPopulated(d: unknown): boolean {
      if (!d || typeof d !== 'object') return false;
      const dd = d as Record<string, unknown>;
      const byCountry = Array.isArray(dd.byCountry) ? (dd.byCountry as unknown[]) : null;
      const byGender = Array.isArray(dd.byGender) ? (dd.byGender as unknown[]) : null;
      const byAge = Array.isArray(dd.byAge) ? (dd.byAge as unknown[]) : null;
      const byAgeGender = Array.isArray(dd.byAgeGender) ? (dd.byAgeGender as unknown[]) : null;
      return (
        (byCountry?.length ?? 0) > 0 ||
        (byGender?.length ?? 0) > 0 ||
        (byAge?.length ?? 0) > 0 ||
        (byAgeGender?.length ?? 0) > 0
      );
    }
    function patchYouTubeExtended(payload: Record<string, unknown>): Record<string, unknown> {
      if (analyticsAccount?.platform !== 'YOUTUBE') return payload;
      const hasDemographics = demographicsLooksPopulated(payload.demographics);
      const hasTraffic = Array.isArray(payload.trafficSources) && (payload.trafficSources as unknown[]).length > 0;
      if (hasDemographics && hasTraffic) return payload;
      const ext = readYouTubeExtendedCache(accountId);
      if (!ext) return payload;
      return {
        ...payload,
        ...(!hasDemographics && demographicsLooksPopulated(ext.demographics) ? { demographics: ext.demographics } : {}),
        ...(!hasTraffic && ext.trafficSources ? { trafficSources: ext.trafficSources } : {}),
        ...(ext.extra && !payload.extra ? { extra: ext.extra } : {}),
      };
    }

    function twitterSeriesTotalValue(series: unknown): number {
      if (!Array.isArray(series)) return 0;
      let s = 0;
      for (const pt of series) {
        if (pt && typeof pt === 'object' && 'value' in (pt as object)) {
          const v = Number((pt as { value?: unknown }).value);
          if (Number.isFinite(v)) s += v;
        }
      }
      return s;
    }

    /**
     * Merge a freshly-fetched `data` payload with the in-memory `insights` state so that
     * previously-populated YouTube extended sections (Views by country, Traffic sources,
     * dislikes, etc.) stay visible when the new response doesn't include them. This is what
     * stops the "pie chart disappears and comes back" flicker the user reported.
     */
    function mergeIncomingInsights(data: Record<string, unknown>): Record<string, unknown> {
      const prevRaw = lastInsightsByAccountIdRef.current[accountId];
      const prev = prevRaw && typeof prevRaw === 'object' ? (prevRaw as Record<string, unknown>) : null;

      if (analyticsAccount?.platform === 'YOUTUBE') {
        let merged: Record<string, unknown> = { ...data };
        if (!demographicsLooksPopulated(merged.demographics) && prev && demographicsLooksPopulated(prev.demographics)) {
          merged.demographics = prev.demographics;
        }
        const incomingTraffic = Array.isArray(merged.trafficSources) ? (merged.trafficSources as unknown[]) : null;
        if ((incomingTraffic?.length ?? 0) === 0 && prev && Array.isArray(prev.trafficSources) && (prev.trafficSources as unknown[]).length > 0) {
          merged.trafficSources = prev.trafficSources;
        }
        if (!merged.extra && prev?.extra) {
          merged.extra = prev.extra;
        }
        // Preserve age×gender breakdown if the refresh dropped only that slice (same pattern as geo).
        const prevDemo = prev?.demographics as Record<string, unknown> | undefined;
        const mergedDemo = merged.demographics as Record<string, unknown> | undefined;
        if (mergedDemo && prevDemo) {
          const incomingAg = Array.isArray(mergedDemo.byAgeGender) ? (mergedDemo.byAgeGender as unknown[]) : [];
          const prevAg = Array.isArray(prevDemo.byAgeGender) ? (prevDemo.byAgeGender as unknown[]) : [];
          if (incomingAg.length === 0 && prevAg.length > 0) {
            merged.demographics = { ...mergedDemo, byAgeGender: prevDemo.byAgeGender } as typeof merged.demographics;
          }
        }
        // Still patch from localStorage cache if both the incoming payload AND state are lacking.
        merged = patchYouTubeExtended(merged);
        return merged;
      }

      if (analyticsAccount?.platform === 'FACEBOOK') {
        // When the date range changed, never carry period-specific data (engagement, impressions,
        // traffic) from a different time window — it would appear stuck even though the API
        // already returned new data for the new range.  Same-range refreshes (manual sync,
        // background poll) still get the preserve treatment to prevent chart blanking.
        if (isDateRangeChange) return { ...data };
        return mergeFacebookPageInsightsPreserve({ ...data }, prev);
      }

      if ((analyticsAccount?.platform === 'PINTEREST' || analyticsAccount?.platform === 'THREADS') && prev) {
        const next = { ...data };
        const nextBundle = (next.facebookAnalytics ?? null) as Record<string, unknown> | null;
        const prevBundle = (prev.facebookAnalytics ?? null) as Record<string, unknown> | null;
        if (!nextBundle || !prevBundle) return next;
        const nextTotals = (nextBundle.totals ?? null) as Record<string, unknown> | null;
        const prevTotals = (prevBundle.totals ?? null) as Record<string, unknown> | null;
        const nextSeries = (nextBundle.series ?? null) as Record<string, unknown> | null;
        const prevSeries = (prevBundle.series ?? null) as Record<string, unknown> | null;
        if (!nextTotals || !prevTotals || !nextSeries || !prevSeries) return next;
        const nextEngagement = Number(nextTotals.engagement ?? 0);
        const prevEngagement = Number(prevTotals.engagement ?? 0);
        const nextVideoViews = Number(nextTotals.videoViews ?? 0);
        const prevVideoViews = Number(prevTotals.videoViews ?? 0);
        const nextContentViews = Number(nextTotals.contentViews ?? 0);
        const nextImpressions = Number(next.impressionsTotal ?? 0);
        const toPoints = (v: unknown): Array<{ date: string; value: number }> =>
          Array.isArray(v)
            ? (v as Array<Record<string, unknown>>)
                .map((p) => ({ date: String(p.date ?? ''), value: Number(p.value ?? 0) }))
                .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(p.value))
            : [];
        const uniqueRoundedValues = (pts: Array<{ date: string; value: number }>) =>
          new Set(pts.map((p) => Math.round((Number(p.value) || 0) * 100) / 100)).size;
        const nonZeroPoints = (pts: Array<{ date: string; value: number }>) =>
          pts.filter((p) => (Number(p.value) || 0) > 0).length;
        const nextTrafficSeries = toPoints((nextSeries.postImpressions ?? nextSeries.contentViews ?? null) as unknown);
        const prevTrafficSeries = toPoints((prevSeries.postImpressions ?? prevSeries.contentViews ?? null) as unknown);
        const incomingLooksUniformFallback =
          nextTrafficSeries.length >= 14 &&
          uniqueRoundedValues(nextTrafficSeries) <= 2;
        const incomingLooksThin =
          nonZeroPoints(nextTrafficSeries) <= 1;
        const prevLooksRicher =
          prevTrafficSeries.length > 0 &&
          nonZeroPoints(prevTrafficSeries) >= 3 &&
          uniqueRoundedValues(prevTrafficSeries) >= 3;
        // Pinterest API intermittently returns an impressions-only payload for the same date range.
        // Keep prior engagement/video slices so cards and charts do not "pop" between full and partial data.
        const looksPartial = nextContentViews > 0 && nextImpressions > 0 && nextEngagement <= 0 && prevEngagement > 0;
        const shouldPreservePriorSeries =
          prevLooksRicher && (incomingLooksUniformFallback || incomingLooksThin);
        if (looksPartial || shouldPreservePriorSeries) {
          next.facebookAnalytics = {
            ...nextBundle,
            series: {
              ...nextSeries,
              engagement: prevSeries.engagement ?? nextSeries.engagement,
              totalActions: prevSeries.totalActions ?? nextSeries.totalActions,
              videoViews: prevSeries.videoViews ?? nextSeries.videoViews,
              ...(shouldPreservePriorSeries
                ? {
                    postImpressions: prevSeries.postImpressions ?? nextSeries.postImpressions,
                    postImpressionsNonviral: prevSeries.postImpressionsNonviral ?? nextSeries.postImpressionsNonviral,
                    contentViews: prevSeries.contentViews ?? nextSeries.contentViews,
                  }
                : {}),
            },
            totals: {
              ...nextTotals,
              engagement: prevTotals.engagement ?? nextTotals.engagement,
              totalActions: prevTotals.totalActions ?? nextTotals.totalActions,
              videoViews: prevVideoViews > 0 ? prevVideoViews : nextVideoViews,
              ...(shouldPreservePriorSeries
                ? {
                    contentViews: prevTotals.contentViews ?? nextTotals.contentViews,
                    postImpressions: prevTotals.postImpressions ?? nextTotals.postImpressions,
                    postImpressionsNonviral: prevTotals.postImpressionsNonviral ?? nextTotals.postImpressionsNonviral,
                  }
                : {}),
            },
          };
          if (shouldPreservePriorSeries) {
            next.impressionsTimeSeries = prev.impressionsTimeSeries ?? next.impressionsTimeSeries;
          }
        }
        return next;
      }

      if (analyticsAccount?.platform === 'TWITTER' && prev) {
        const next = { ...data };
        const incomingRecent = Array.isArray(next.recentTweets) ? (next.recentTweets as unknown[]) : [];
        const prevRecent = Array.isArray(prev.recentTweets) ? (prev.recentTweets as unknown[]) : [];
        if (prevRecent.length > 0 && incomingRecent.length === 0) {
          next.recentTweets = prev.recentTweets;
        }
        const incomingEng = next.twitterEngagementTimeSeries;
        const prevEng = prev.twitterEngagementTimeSeries;
        const incomingEngPts = Array.isArray(incomingEng) ? incomingEng : [];
        const prevEngPts = Array.isArray(prevEng) ? prevEng : [];
        if (prevEngPts.length > 0) {
          if (incomingEngPts.length === 0) {
            next.twitterEngagementTimeSeries = prevEng;
          } else if (
            twitterSeriesTotalValue(incomingEngPts) === 0 &&
            twitterSeriesTotalValue(prevEngPts) > 0
          ) {
            next.twitterEngagementTimeSeries = prevEng;
          }
        }
        return next;
      }

      return data;
    }

    const forceRangeRefreshForPlatform =
      isDateRangeChange &&
      (analyticsAccount?.platform === 'TWITTER' ||
        analyticsAccount?.platform === 'PINTEREST' ||
      analyticsAccount?.platform === 'THREADS');

    // If we already have cached data for this range (or prefetched default range), show it immediately.
    if (exactCached) {
      let patchedExact = patchYouTubeExtended(exactCached as Record<string, unknown>);
      if (analyticsAccount?.platform === 'FACEBOOK') {
        patchedExact = mergeFacebookPageInsightsPreserve(
          patchedExact,
          lastInsightsByAccountIdRef.current[accountId] as Record<string, unknown> | undefined
        );
      }
      lastInsightsByAccountIdRef.current[accountId] = { ...(patchedExact), _dateRange: dateRange };
      lastInsightsFetchedAtRef.current[accountId] = Date.now();
      setInsights(patchedExact as NonNullable<Parameters<typeof setInsights>[0]>);
      if (userIdRef.current) writeDashboardInsightsSession(userIdRef.current, accountId, patchedExact, dateRange);
      setInsightsLoading(false);
      // Default behavior: keep charts stable when cache exists.
      // For TWITTER/PINTEREST range changes we still continue to refetch in background
      // so switching 30d -> 6m (or back) rehydrates full range immediately from DB/API.
      if (!accountTabOwnsPosts) {
        if (postsCached !== undefined && postsCached !== null) {
          setImportedPosts(postsCached);
          setImportedPostsLoading(false);
        } else {
          setImportedPostsLoading(true);
          const insightsPostsParams = postsSyncParamsForPlatform(analyticsAccount?.platform, {
            explicitSync: syncAllTrigger > 0 || isOAuthConnectSyncActive(accountId, justConnected),
          });
          api.get(`/social/accounts/${accountId}/posts`, { params: insightsPostsParams })
            .then((postsRes) => {
              const list = postsRes.data?.posts ?? [];
              postsCacheRef.current[accountId] = list;
              appDataRef.current?.setPostsForAccount(accountId, list);
              if (selectedAccountIdRef.current === accountId) setImportedPosts(list);
              setPostsSyncError(postsRes.data?.syncError ?? null);
              afterTikTokPostsImportIfNeededRef.current(
                accountId,
                analyticsAccount?.platform,
                insightsPostsParams,
                postsRes.data?.syncError ?? null
              );
            })
            .catch(() => setPostsSyncError(null))
            .finally(() => setImportedPostsLoading(false));
        }
      }
      if (!forceRangeRefreshForPlatform && analyticsAccount?.platform !== 'THREADS') return;
    }

    // No exact range match: show last successful payload when switching accounts, or when the
    // date range changed for platforms where a brief wrong-axis flash is less bad than wiping
    // the whole UI (Pinterest traffic, X/Twitter — Reels chart + recent tweets come from insights).
    // Stale data from a different date range can plot time-series at the wrong positions for FB/IG;
    // those still clear until the new-range fetch returns.
    const preserveStaleWhileRefetch =
      analyticsAccount?.platform === 'PINTEREST' ||
      analyticsAccount?.platform === 'THREADS' ||
      analyticsAccount?.platform === 'TWITTER' ||
      analyticsAccount?.platform === 'INSTAGRAM' ||
      analyticsAccount?.platform === 'FACEBOOK';
    if (staleCandidate && (!isDateRangeChange || preserveStaleWhileRefetch)) {
      const patchedStale = patchYouTubeExtended(staleCandidate);
      lastInsightsByAccountIdRef.current[accountId] = patchedStale;
      setInsights(patchedStale as NonNullable<Parameters<typeof setInsights>[0]>);
      if (userIdRef.current && !isDateRangeChange) {
        writeDashboardInsightsSession(userIdRef.current, accountId, patchedStale, dateRange);
      }
      // Refresh silently in background without showing a loading skeleton
      setInsightsLoading(false);
    } else {
      // Date range changed, account changed without stale data, or first load → clear and show skeleton.
      // For YouTube: if we have extended data cached (geo + traffic), show it immediately as a partial payload
      // so the country/traffic widgets don't flash empty while the full fetch runs.
      const ytExtFallback = analyticsAccount?.platform === 'YOUTUBE' ? readYouTubeExtendedCache(accountId) : null;
      if (ytExtFallback) {
        setInsights((prev) => {
          if (prev) return { ...prev, demographics: ytExtFallback.demographics as typeof prev.demographics, trafficSources: ytExtFallback.trafficSources as typeof prev.trafficSources };
          return null;
        });
      } else {
        setInsights(null);
      }
      setInsightsLoading(true);
    }
    if (!accountTabOwnsPosts) {
      const hasCachedPosts = postsCached !== undefined && postsCached !== null;
      if (hasCachedPosts) {
        setImportedPosts(postsCached);
        setImportedPostsLoading(false);
      } else {
        setImportedPostsLoading(true);
      }
    }

    // Hard stability gate:
    // Do not silently refetch insights when we already rendered cached/stale data.
    // Silent refreshes were the source of "candles move a few seconds later".
    // We only refetch automatically when:
    // - user explicitly triggered Sync (`syncAllTrigger`),
    // - user just connected an account, or
    // - user changed date range/account and we have no usable cache to render.
    const isMetaInsightsAccount =
      analyticsAccount?.platform === 'INSTAGRAM' || analyticsAccount?.platform === 'FACEBOOK';
    const explicitAction =
      syncAllTrigger > 0 || isOAuthConnectSyncActive(accountId, justConnected);

    // Instagram/Facebook: never auto-fetch on mount or date-range change.
    // The insights route makes 5-10 live Graph calls and burns through the 200 call/hour quota.
    // Only fetch when the user explicitly clicks Sync.
    const shouldFetchInsights = isMetaInsightsAccount
      ? explicitAction
      : explicitAction ||
        isDateRangeChange ||
        (!exactCached && !staleCandidate) ||
        analyticsAccount?.platform === 'THREADS';

    if (!shouldFetchInsights) {
      setInsightsLoading(false);
      return;
    }

    // Fetch insights; optional fast posts only when not on per-account analytics (single owner for posts there).
    const insightsPromise = api.get(`/social/accounts/${accountId}/insights`, {
      params:
        analyticsAccount?.platform === 'FACEBOOK'
          ? { since: dateRange.start, until: dateRange.end, refresh: 1, persist: 1 }
          : analyticsAccount?.platform === 'YOUTUBE'
            ? { since: dateRange.start, until: dateRange.end, extended: 1 }
            : analyticsAccount?.platform === 'TWITTER'
              // Pass refresh=1 only for explicit sync; date-range changes use the fast DB path.
              ? { since: dateRange.start, until: dateRange.end, ...(explicitAction ? { refresh: 1 } : {}) }
              : analyticsAccount?.platform === 'INSTAGRAM'
                // Instagram: only send refresh=1 on explicit sync to avoid burning the 200 calls/hour limit.
                ? { since: dateRange.start, until: dateRange.end, ...(explicitAction ? { refresh: 1 } : {}) }
                : { since: dateRange.start, until: dateRange.end },
      timeout: INSIGHTS_HTTP_MS,
    });

    insightsPromise
      .then(async (res) => {
        let data = res.data ?? null;
        const isFacebookZeroState = Boolean(
          analyticsAccount?.platform === 'FACEBOOK' &&
          data &&
          Number(data.followers ?? 0) === 0 &&
          Number(data.impressionsTotal ?? 0) === 0 &&
          Number(data.pageViewsTotal ?? 0) === 0
        );
        if (isFacebookZeroState && !fbForcedRefreshRef.current[cacheKey]) {
          fbForcedRefreshRef.current[cacheKey] = true;
          try {
            const refreshed = await api.get(`/social/accounts/${accountId}/insights`, {
              params: { since: dateRange.start, until: dateRange.end, refresh: 1, persist: 1 },
              timeout: INSIGHTS_HTTP_MS,
            });
            data = refreshed.data ?? data;
          } catch {
            // Keep initial payload when forced refresh fails.
          }
        }
        let merged: Record<string, unknown> | null = null;
        if (data) {
          merged = mergeIncomingInsights(data as Record<string, unknown>);
          // Only persist YouTube extended data when the merged payload has real geo/traffic —
          // guards against transient empty responses wiping a populated localStorage cache.
          if (analyticsAccount?.platform === 'YOUTUBE') {
            const hasGeo = demographicsLooksPopulated(merged.demographics);
            const hasTraffic = Array.isArray(merged.trafficSources) && (merged.trafficSources as unknown[]).length > 0;
            if (hasGeo || hasTraffic) {
              writeYouTubeExtendedCache(accountId, { demographics: merged.demographics, trafficSources: merged.trafficSources, extra: merged.extra });
            }
          }
          const mergedAsInsights = merged as unknown as NonNullable<typeof insights>;
          insightsCacheRef.current[cacheKey] = mergedAsInsights;
          lastInsightsByAccountIdRef.current[accountId] = { ...merged, _dateRange: dateRange };
          lastInsightsFetchedAtRef.current[accountId] = Date.now();
          appDataRef.current?.setInsightsForAccount(accountId, mergedAsInsights);
        }
        if (shouldApplyVisibleChartUpdate() && selectedAccountIdRef.current === accountId) {
          setInsights((prev) => {
            if (merged) return merged as NonNullable<typeof insights>;
            if (prev && analyticsAccount?.platform === 'TWITTER') return prev;
            return null;
          });
          if (merged && userIdRef.current) writeDashboardInsightsSession(userIdRef.current, accountId, merged, dateRange);
        }
        if (analyticsAccount?.platform === 'TIKTOK' && shouldApplyVisibleChartUpdate()) {
          try {
            const accRes = await api.get('/social/accounts');
            const accData = Array.isArray(accRes.data) ? accRes.data : [];
            setCachedAccounts(accData);
          } catch {
            /* sidebar avatar may have been mirrored to R2 during insights */
          }
        }
      })
      .catch(() => { 
        // Keep stale insights on error; only clear if we had no data at all
        if (selectedAccountIdRef.current === accountId && !staleForAccount && !isSameAccount) setInsights(null); 
      })
      .finally(() => {
        setInsightsLoading(false);
      });


    if (!accountTabOwnsPosts) {
      if (postsCached !== undefined && postsCached !== null) {
        // Have cached posts, use them immediately
        setImportedPosts(postsCached);
      } else {
        // Fetch posts in background
        const fastPostsParams = postsSyncParamsForPlatform(analyticsAccount?.platform, {
          explicitSync: syncAllTrigger > 0 || isOAuthConnectSyncActive(accountId, justConnected),
        });
        const fastPostsPromise = api.get(`/social/accounts/${accountId}/posts`, { params: fastPostsParams });
        fastPostsPromise
          .then((postsRes) => {
            const list = postsRes.data?.posts ?? [];
            postsCacheRef.current[accountId] = list;
            appDataRef.current?.setPostsForAccount(accountId, list);
            if (shouldApplyVisibleChartUpdate() && selectedAccountIdRef.current === accountId) setImportedPosts(list);
            afterTikTokPostsImportIfNeededRef.current(
              accountId,
              analyticsAccount?.platform,
              fastPostsParams,
              postsRes.data?.syncError ?? null
            );
          })
          .catch(() => {})
          .finally(() => setImportedPostsLoading(false));
      }
    }

  // `appData?.prefetchPhase2Done` is intentionally omitted: its flip should not auto-swap
  // the insights we already rendered. The user sees fresh data only after explicit sync.
  }, [
    analyticsTab,
    analyticsAccount?.id,
    analyticsAccount?.platform,
    dateRange.start,
    dateRange.end,
    syncAllTrigger,
    justConnected,
    tiktokInsightsResyncSeal,
    appData?.prefetchStatus,
    appData?.cacheRehydrated,
  ]);

  // Facebook Page reviews (pages_read_user_content)
  useEffect(() => {
    if (analyticsAccount?.platform !== 'FACEBOOK' || !analyticsAccount?.id) {
      setPageReviews([]);
      setPageReviewsError(null);
      return;
    }
    setPageReviewsLoading(true);
    setPageReviewsError(null);
    api.get(`/social/accounts/${analyticsAccount.id}/page-reviews`)
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
  }, [analyticsAccount?.id, analyticsAccount?.platform, analyticsTab]);

  // Aggregated insights: prefer AppDataContext cache; only fetch missing accounts sequentially.
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
    // Wait for Phase 2 to finish populating per-account insights before aggregating.
    if (appData?.prefetchHasLoadedOnce && !appData?.prefetchPhase2Done) return;
    const aggCacheKey = `agg-${dateRange.start}-${dateRange.end}-${insightAccounts.map((a) => a.id).sort().join(',')}`;
    const cachedAgg = aggregatedCacheRef.current;
    if (cachedAgg && cachedAgg.key === aggCacheKey) {
      setAggregatedInsights(cachedAgg.data);
      setAggregatedLoading(false);
      return;
    }
    setAggregatedLoading(true);
    const app = appDataRef.current;
    (async () => {
      const results: Array<{ platform: string; data: Record<string, unknown> }> = [];
      for (const acc of insightAccounts) {
        const cached = app?.getInsights(acc.id);
        if (cached && typeof cached === 'object') {
          results.push({ platform: acc.platform, data: cached as Record<string, unknown> });
          continue;
        }
        // Never auto-fetch insights for Instagram/Facebook — each call makes 5-10 live Graph requests
        // and burns through the 200 calls/hour per-user budget. These only load on explicit Sync.
        if (acc.platform === 'INSTAGRAM' || acc.platform === 'FACEBOOK') continue;
        try {
          const r = await api.get(`/social/accounts/${acc.id}/insights`, {
            params: { since: dateRange.start, until: dateRange.end },
            timeout: INSIGHTS_HTTP_MS,
          });
          if (r.data) {
            results.push({ platform: acc.platform, data: r.data });
            app?.setInsightsForAccount(acc.id, r.data);
          }
        } catch { /* skip this account */ }
      }
      const byPlatform: Record<string, { followers: number; impressions: number; timeSeries: Array<{ date: string; value: number }> }> = {};
      let totalFollowers = 0;
      let totalImpressions = 0;
      let totalReach = 0;
      let totalProfileViews = 0;
      let totalPageViews = 0;
      const dateMap: Record<string, number> = {};
      for (const { platform, data } of results) {
        if (!data) continue;
        const fol = (data.followers as number) ?? 0;
        const imp = platform === 'TWITTER' ? ((data.impressionsTotal as number) ?? (data as { tweetCount?: number }).tweetCount ?? 0) : ((data.impressionsTotal as number) ?? 0);
        const ts = (data.impressionsTimeSeries as Array<{ date: string; value: number }>) ?? [];
        byPlatform[platform] = { followers: fol, impressions: imp, timeSeries: ts };
        totalFollowers += fol;
        totalImpressions += imp;
        totalReach += (data.reachTotal as number) ?? 0;
        totalProfileViews += (data.profileViewsTotal as number) ?? 0;
        totalPageViews += (data.pageViewsTotal as number) ?? 0;
        for (const d of ts) {
          dateMap[d.date] = (dateMap[d.date] ?? 0) + d.value;
        }
      }
      const aggData = { totalFollowers, totalImpressions, totalReach, totalProfileViews, totalPageViews, byPlatform, combinedTimeSeries: Object.entries(dateMap).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)) };
      aggregatedCacheRef.current = { key: aggCacheKey, data: aggData };
      setAggregatedInsights(aggData);
      setAggregatedLoading(false);
    })().catch(() => { setAggregatedInsights(null); setAggregatedLoading(false); });
  }, [analyticsTab, hasAccounts, dateRange.start, dateRange.end, accounts.map((a) => a.id).join(','), appData?.prefetchPhase2Done]);

  useEffect(() => {
    // Conversations count card: skip for Instagram/Facebook to avoid burning Graph API quota.
    // Each call hits GET /conversations which fetches the list + up to 20 profile lookups.
    // The Inbox page loads conversations on-demand when the user actually opens it.
    if ((analyticsAccount?.platform !== 'FACEBOOK' && analyticsAccount?.platform !== 'INSTAGRAM') || !analyticsAccount?.id) {
      setLiveFbConversationsCount(null);
      setLiveFbConversationDates(null);
    }
  }, [analyticsAccount?.id, analyticsAccount?.platform]);

  const handleConnect = async (
    platform: string,
    method?: string,
    options?: { switchAccount?: boolean }
  ) => {
    const getMessage = (err: unknown): string | null => {
      if (!err || typeof err !== 'object' || !('response' in err)) return null;
      const res = (err as { response?: { data?: { message?: string } } }).response;
      return res?.data?.message ?? null;
    };
    setAlertMessage(null);
    const oauthPopup = prepareOAuthConnectPopup();
    setOauthLaunchingPlatform(platform);
    setOauthLaunchingMethod(method);
    let oauthPopupOpened = false;
    let stopOAuthPoll: (() => void) | undefined;
    let stopPopupWatch: (() => void) | undefined;
    if (typeof window !== 'undefined') {
      storePendingConnectNav({
        successRedirect: buildDashboardSuccessRedirect(),
        returnUrl: `${window.location.pathname}${window.location.search}`,
        activeBrandId,
      });
    }
    try {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      const bearer = sessionData.session?.access_token ?? '';
      // Do not call `api.get` here: the shared axios client queues behind MAX_CONCURRENT (6). When the
      // dashboard has several slow/hung API calls, the queue never reaches this request and Connect
      // appears to spin forever. OAuth start uses same-origin fetch below (no queue).
      const startParams = new URLSearchParams();
      if (method && method !== 'switch') startParams.set('method', method);
      if (options?.switchAccount && platform.toLowerCase() === 'threads') {
        startParams.set('switch_account', '1');
      }
      if (
        platform.toLowerCase() === 'threads' &&
        searchParams.get('threads_review') === '1'
      ) {
        startParams.set('force_full_consent', '1');
      }
      const qs = startParams.toString() ? `?${startParams.toString()}` : '';
      const startRes = await fetch(`/api/social/oauth/${encodeURIComponent(platform)}/start${qs}`, {
        headers: { Authorization: `Bearer ${bearer}` },
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.timeout(60_000),
      });
      const data = (await startRes.json().catch(() => ({}))) as { url?: string; message?: string; error?: string };
      if (!startRes.ok) {
        const serverMsg =
          typeof data?.message === 'string' && data.message.trim()
            ? data.message.trim()
            : typeof data?.error === 'string' && data.error.trim()
              ? data.error.trim()
              : `Connect failed (HTTP ${startRes.status}).`;
        throw { response: { status: startRes.status, data: { message: serverMsg } } };
      }
      const url = data?.url;
      if (url && typeof url === 'string') {
        if (platform.toLowerCase() === 'twitter') {
          closeOAuthConnectPopup(oauthPopup);
          window.location.assign(url);
          return;
        }
        const opened = navigateOAuthConnect(url, oauthPopup);
        if (!opened.opened) {
          setAlertMessage(
            'Could not open sign-in. Allow pop-ups for www.izop.io or click Connect again.'
          );
        } else {
          oauthPopupOpened = true;
          setOauthLaunchingPlatform(null);
          setOauthLaunchingMethod(undefined);
          if (oauthPopup && !oauthPopup.closed) {
            stopPopupWatch = watchOAuthConnectPopup(oauthPopup, platform, () => {
              clearOAuthConnectInFlightForPlatform(platform);
              stopOAuthPoll?.();
              stopOAuthPoll = pollOAuthConnectAccount(
                platform,
                fetchAccounts,
                (connected) => {
                  storeOAuthConnectInFlight(platform);
                  notifyOAuthCompleteLocally(connected);
                },
                { requireInFlight: false, maxMs: 60_000 }
              );
            });
          }
        }
        return;
      }
      closeOAuthConnectPopup(oauthPopup);
      setAlertMessage('Invalid response from server. Check server logs.');
    } catch (err: unknown) {
      closeOAuthConnectPopup(oauthPopup);
      clearOAuthConnectInFlightForPlatform(platform);
      const aborted =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (typeof err === 'object' && err !== null && 'name' in err && (err as { name?: string }).name === 'AbortError');
      if (aborted) {
        setAlertMessage('Connect timed out. Wait a moment and try again.');
      } else {
        const msg = getMessage(err);
        if (msg) {
          if (
            msg.includes('META_APP_ID') ||
            msg.includes('META_APP_SECRET') ||
            msg.includes('THREADS_APP_ID') ||
            msg.includes('Threads App ID')
          ) {
            setAlertMessage(
              'Threads needs THREADS_APP_ID and THREADS_APP_SECRET in Vercel (Meta → Threads → Basic). Redeploy after saving.'
            );
          } else if (msg === 'Unauthorized') {
            setAlertMessage('Sign out and back in, then try Connect again.');
          } else if (msg.includes('Database is busy')) {
            setAlertMessage(msg);
          } else {
            setAlertMessage(msg);
          }
        } else {
          const errMsg = err instanceof Error ? err.message : '';
          setAlertMessage(
            errMsg.trim()
              ? `Could not start connect: ${errMsg.slice(0, 160)}`
              : 'Could not start connect. Sign out and back in, or try again in a moment.'
          );
        }
      }
    } finally {
      if (!oauthPopupOpened) {
        stopPopupWatch?.();
        stopOAuthPoll?.();
        setOauthLaunchingPlatform(null);
        setOauthLaunchingMethod(undefined);
      }
    }
  };

  useEffect(() => {
    if (connectingParam === '1') {
      const platform = searchParams.get('newPlatform')?.trim().toUpperCase();
      if (platform) storeOAuthConnectInFlight(platform);
    }
  }, [connectingParam, searchParams]);

  useEffect(() => {
    const syncConnectUi = () => {
      const inFlight = readOAuthConnectInFlight();
      setOauthInFlightPlatform(inFlight);
    };
    const onDisconnected = () => {
      setSelectedPlatformForConnect(null);
      setOauthLaunchingPlatform(null);
      setOauthLaunchingMethod(undefined);
      setOauthInFlightPlatform(null);
      setJustConnected(false);
    };
    syncConnectUi();
    window.addEventListener(OAUTH_CONNECT_IN_FLIGHT_EVENT, syncConnectUi);
    window.addEventListener(ACCOUNT_DISCONNECTED_EVENT, onDisconnected);
    return () => {
      window.removeEventListener(OAUTH_CONNECT_IN_FLIGHT_EVENT, syncConnectUi);
      window.removeEventListener(ACCOUNT_DISCONNECTED_EVENT, onDisconnected);
    };
  }, [
    connectingParam,
    searchParams.get('newPlatform'),
    searchParams.get('accountId'),
    setSelectedPlatformForConnect,
  ]);

  // Must run unconditionally before any early return (hooks rule)
  const postsByDateSeries = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of importedPosts) {
      const d = p.publishedAt ? localCalendarDateFromIso(String(p.publishedAt)) : '';
      if (d) map[d] = (map[d] ?? 0) + 1;
    }
    return Object.entries(map).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [importedPosts]);
  const interactionsByDateSeries = React.useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of importedPosts) {
      const d = p.publishedAt ? localCalendarDateFromIso(String(p.publishedAt)) : '';
      if (d) map[d] = (map[d] ?? 0) + (p.interactions ?? 0);
    }
    return Object.entries(map).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
  }, [importedPosts]);

  const cachedInsightsForSelected =
    analyticsAccount?.id && appData ? appData.getInsights(analyticsAccount.id) : undefined;
  const sessionInsightsForSelected =
    analyticsAccount?.id && user?.id ? readDashboardInsightsSession(user.id, analyticsAccount.id) : null;
  const perAccountLsInsights =
    analyticsAccount?.id ? readInsightsFromLocalStorage(analyticsAccount.id) : null;
  /** Prefer React state; fall back to AppData cache; per-account localStorage; then sessionStorage. */
  const displayInsights: typeof insights = useMemo(() => {
    const raw =
      insights ??
      (cachedInsightsForSelected && typeof cachedInsightsForSelected === 'object'
        ? (cachedInsightsForSelected as NonNullable<typeof insights>)
        : null) ??
      (perAccountLsInsights && typeof perAccountLsInsights === 'object'
        ? (perAccountLsInsights as NonNullable<typeof insights>)
        : null) ??
      (sessionInsightsForSelected && typeof sessionInsightsForSelected === 'object'
        ? (sessionInsightsForSelected as NonNullable<typeof insights>)
        : null);
    return stripLegacyInsightsHint(raw) ?? null;
  }, [
    insights,
    cachedInsightsForSelected,
    perAccountLsInsights,
    sessionInsightsForSelected,
  ]);

  // End connect loading banner once analytics are on screen and posts finished (or timed out below).
  useEffect(() => {
    const accountId = analyticsAccount?.id;
    if (!justConnected || !accountId || isConnectLoadDone(accountId)) return;
    if (!displayInsights || insightsLoading || importedPostsLoading) return;
    markConnectLoadDone(accountId);
    setJustConnected(false);
  }, [
    justConnected,
    analyticsAccount?.id,
    displayInsights,
    insightsLoading,
    importedPostsLoading,
  ]);

  /** After connect: show cached dashboard within ~8s even if Meta insights are still syncing. */
  useEffect(() => {
    const accountId = analyticsAccount?.id;
    if (!justConnected || !accountId || isConnectLoadDone(accountId)) return;
    const timeoutId = window.setTimeout(() => {
      if (isConnectLoadDone(accountId)) return;
      markConnectLoadDone(accountId);
      setJustConnected(false);
      setInsightsLoading(false);
      setImportedPostsLoading(false);
    }, CONNECT_FINISH_MAX_MS);
    return () => window.clearTimeout(timeoutId);
  }, [justConnected, analyticsAccount?.id]);

  const hasFbOrIg = accounts.some((a) => a.platform === 'FACEBOOK' || a.platform === 'INSTAGRAM');
  const hintText = displayInsights?.insightsHint ?? '';
  const hintNeedsReconnect = Boolean(hintText && (
    /reconnect/i.test(hintText) || /session expired/i.test(hintText) || /log back in/i.test(hintText)
  ));
  /**
   * If the currently displayed analytics actually contain real numbers, a
   * leftover `insightsHint` from a previous session (or a transient
   * `postsSyncError`) should NOT trigger the silent background reconnect
   * flow — that flow clears AppDataContext and bumps `syncAllTrigger`, which
   * re-runs the insights/posts effects, re-fetches from the API, and
   * replaces the rendered charts with the fresh payload a few seconds after
   * the page finished loading. Skip auto-reconnect whenever we already have
   * meaningful data to show; the user can still click Reconnect explicitly
   * if needed.
   */
  const hasMeaningfulDisplayedInsights = Boolean(
    displayInsights && (
      (displayInsights.followers ?? 0) > 0 ||
      (displayInsights.impressionsTotal ?? 0) > 0 ||
      (Array.isArray(displayInsights.impressionsTimeSeries) &&
        displayInsights.impressionsTimeSeries.some((d) => (d?.value ?? 0) > 0))
    )
  );
  const reconnectCondition =
    hasFbOrIg &&
    !hasMeaningfulDisplayedInsights &&
    (hintNeedsReconnect || postsSyncError || (allPostsSyncError && (allPostsSyncError.includes('Reconnect') || allPostsSyncError.includes('Session expired') || allPostsSyncError.includes('log back in'))));
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
          // Clear insights cache so the next load re-fetches fresh data.
          // Keep postsCacheRef intact so the engagement chart doesn't blank during the reload.
          Object.keys(insightsCacheRef.current).forEach((k) => { if (k.startsWith(acc.id + '-')) delete insightsCacheRef.current[k]; });
          delete lastInsightsByAccountIdRef.current[acc.id];
          appDataRef.current?.clearAccountData(acc.id);
          // Re-populate posts cache from current importedPosts so the posts effect sees existing data on re-run.
          const existingPosts = postsCacheRef.current[acc.id];
          if (existingPosts) {
            // Keep the local ref; clearAccountData wiped context but ref still lives here.
            appDataRef.current?.setPostsForAccount(acc.id, existingPosts);
          }
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

  if (showConnectView) {
    const connectPlatform = (selectedPlatformForConnect || connectFromUrl) as string;
    const connectCallbackPending = isPlatformOAuthPending(connectPlatform);
    const oauthLaunching =
      oauthLaunchingPlatform?.toUpperCase() === connectPlatform.toUpperCase();

    return (
      <>
        <ConfirmModal open={alertMessage !== null} onClose={() => setAlertMessage(null)} message={alertMessage ?? ''} variant="alert" confirmLabel="OK" />
        <ConnectView
          platform={connectPlatform}
          onConnect={handleConnect}
          connecting={connectCallbackPending}
          launching={oauthLaunching}
          launchingMethod={oauthLaunchingMethod}

          connectError={alertMessage ?? connectErrorFromUrl}
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

  const postsTabDisplaySeries = postsByDateSeries.length > 0 ? postsByDateSeries : (importedPosts.length > 0 ? [{ date: dateRange.end || toLocalCalendarDate(new Date()), value: importedPosts.length }] : []);
  const interactionsTabDisplaySeries = interactionsByDateSeries.length > 0 ? interactionsByDateSeries : (totalInteractions > 0 ? [{ date: dateRange.end || toLocalCalendarDate(new Date()), value: totalInteractions }] : []);
  const maxPostsTabValue = Math.max(...postsTabDisplaySeries.map((d) => d.value), 1);
  const maxInteractionsTabValue = Math.max(...interactionsTabDisplaySeries.map((d) => d.value), 1);
  void maxPostsTabValue; void maxInteractionsTabValue;
  const postsSectionDays = dateRange.start && dateRange.end ? Math.max(1, Math.ceil((new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime()) / (24 * 60 * 60 * 1000))) : 0;
  const postsShowWatermark = postsSectionDays > 30;

  const plat = analyticsAccount ? aggregatedInsights?.byPlatform[analyticsAccount.platform] : null;
  const effectiveFollowers = analyticsAccount
    ? Math.max(displayInsights?.followers ?? 0, plat?.followers ?? 0)
    : (aggregatedInsights?.totalFollowers ?? 0);
  const effectiveImpressions = analyticsAccount
    ? Math.max(displayInsights?.impressionsTotal ?? 0, plat?.impressions ?? 0)
    : (aggregatedInsights?.totalImpressions ?? 0);
  const isTwitter = analyticsAccount?.platform === 'TWITTER';
  const effectiveTweets = isTwitter ? (displayInsights?.tweetCount ?? 0) : 0;
  const recentTweets = isTwitter ? (displayInsights?.recentTweets ?? []) : [];
  const effectiveTimeSeries = analyticsAccount
    ? ((displayInsights?.impressionsTimeSeries?.length && displayInsights.impressionsTimeSeries.some((d) => d.value > 0)) ? displayInsights.impressionsTimeSeries : (plat?.timeSeries?.length ? plat.timeSeries : []))
    : (aggregatedInsights?.combinedTimeSeries ?? []);
  const effectivePageVisits = analyticsAccount
    ? (displayInsights?.pageViewsTotal ?? displayInsights?.profileViewsTotal ?? aggregatedInsights?.totalPageViews ?? aggregatedInsights?.totalProfileViews ?? 0)
    : (aggregatedInsights?.totalPageViews ?? aggregatedInsights?.totalProfileViews ?? 0);
  const effectiveReach = analyticsAccount
    ? (displayInsights?.reachTotal ?? aggregatedInsights?.totalReach ?? 0)
    : (aggregatedInsights?.totalReach ?? 0);
  const effectiveProfileViews = analyticsAccount
    ? (displayInsights?.profileViewsTotal ?? aggregatedInsights?.totalProfileViews ?? 0)
    : (aggregatedInsights?.totalProfileViews ?? 0);
  // For selected accounts, keep analytics in explicit loading state while a new range is fetching.
  // This avoids rendering a brief mixed old/new graph during date-range switches.
  const effectiveInsightsLoading = analyticsAccount
    ? insightsLoading
    : aggregatedLoading;
  const fallbackSeriesValue = effectiveImpressions || effectiveFollowers || 0;
  const hasNonZeroSeries = effectiveTimeSeries.length > 0 && effectiveTimeSeries.some((d) => d.value > 0);
  const endDate = dateRange.end || toLocalCalendarDate(new Date());
  const startDate = dateRange.start || endDate;
  // Views/impressions (or Tweets for X) chart: use time series or flat line so we always show a real chart like other platforms
  const effectiveViewsOrTweets = isTwitter ? effectiveTweets : effectiveImpressions;
  const displayTimeSeries =
    hasNonZeroSeries
      ? effectiveTimeSeries
      : analyticsAccount
        ? [{ date: startDate, value: effectiveViewsOrTweets }, { date: endDate, value: effectiveViewsOrTweets }]
        : effectiveImpressions > 0
          ? [{ date: startDate, value: effectiveImpressions }, { date: endDate, value: effectiveImpressions }]
          : [];
  // Followers chart: use its own series. When we have no historical data, show flat line at current count (including 0) so X matches IG/FB.
  const followersTimeSeries = (displayInsights as { followersTimeSeries?: Array<{ date: string; value: number }> })?.followersTimeSeries;
  const displayFollowersTimeSeries =
    followersTimeSeries?.length
      ? followersTimeSeries
      : analyticsAccount
        ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
        : !analyticsAccount && aggregatedInsights
          ? [{ date: startDate, value: effectiveFollowers }, { date: endDate, value: effectiveFollowers }]
          : [];
  const maxImpressions = displayTimeSeries.length ? Math.max(...displayTimeSeries.map((d) => d.value), 1) : 1;
  const showViewsHint = hasFbOrIg && effectiveFollowers > 0 && effectiveImpressions === 0 && !effectiveTimeSeries.some((d) => d.value > 0) && (analyticsAccount?.platform === 'INSTAGRAM' || !analyticsAccount);
  const connectLoadInProgress = Boolean(
    justConnected &&
      analyticsAccount?.id &&
      !isConnectLoadDone(analyticsAccount.id)
  );
  /** In-dashboard skeleton only (sidebar + nav stay interactive). */
  const analyticsLoadingOnly = Boolean(
    analyticsAccount &&
      !displayInsights &&
      insightsLoading &&
      !connectLoadInProgress
  );
  const showDashboardSkeleton = Boolean(
    analyticsAccount &&
      (analyticsLoadingOnly || (connectLoadInProgress && !displayInsights))
  );
  const showDataSyncBanner = connectLoadInProgress;
  function openPricingPopup() {
    setPricingModalOpen(true);
  }

  return (
    <div className="space-y-0">
      <ConfirmModal open={alertMessage !== null} onClose={() => setAlertMessage(null)} message={alertMessage ?? ''} variant="alert" confirmLabel="OK" />
      {pricingModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[8500] flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Pricing plans"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={() => setPricingModalOpen(false)}
                aria-label="Close pricing popup"
              />
              <div className="relative z-10 w-full max-w-6xl max-h-[92vh] overflow-auto rounded-3xl bg-white shadow-2xl">
                <button
                  type="button"
                  onClick={() => setPricingModalOpen(false)}
                  className="absolute right-4 top-4 rounded-lg px-3 py-1.5 text-sm font-medium text-[#5d5768] hover:bg-[#f6f2fb]"
                >
                  Close
                </button>

                <div className="px-4 sm:px-6 pt-8 pb-6 sm:pb-8">
                  <PricingPlansGrid
                    billingInterval={pricingInterval}
                    onBillingIntervalChange={setPricingInterval}
                    onCta={openSignup}
                    toggleClassName="pb-4 sm:pb-5"
                    gridClassName="grid gap-4 sm:gap-5 md:grid-cols-2 lg:grid-cols-3 lg:gap-6"
                  />
                  <p className="mt-6 text-center">
                    <button
                      type="button"
                      onClick={() => { setPricingModalOpen(false); router.push('/pricing'); }}
                      className="text-[#7b2cbf] font-medium hover:text-[#d7263d] transition-colors"
                    >
                      Compare all features and yearly pricing &rarr;
                    </button>
                  </p>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
      {/* Show sync banner only on first load (no data yet) or right after connect; date changes refetch in place without banner */}
      {showDataSyncBanner && (
        <DataSyncBanner
          platform={analyticsAccount?.platform}
          insightsLoading={insightsLoading}
          postsLoading={importedPostsLoading}
          dataReady={Boolean(displayInsights)}
        />
      )}
      {showDashboardSkeleton && (
        <div className="mt-4 max-w-full space-y-4" style={{ maxWidth: 1400 }}>
          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 animate-pulse">
            <div className="h-5 w-44 rounded-md bg-neutral-200/80 dark:bg-neutral-700/80 mb-3" />
            <div className="h-3 w-64 rounded-md bg-neutral-200/70 dark:bg-neutral-700/70 mb-4" />
            <div className="grid grid-cols-3 gap-2 mb-4 max-w-[220px]">
              <div className="h-7 rounded-lg bg-neutral-200/80 dark:bg-neutral-700/80" />
              <div className="h-7 rounded-lg bg-neutral-200/70 dark:bg-neutral-700/70" />
              <div className="h-7 rounded-lg bg-neutral-200/70 dark:bg-neutral-700/70" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={`fb-load-kpi-${i}`} className="h-20 rounded-xl bg-neutral-100/95 dark:bg-neutral-700/60 border border-neutral-200/70 dark:border-neutral-600/50" />
              ))}
            </div>
            <div className="mt-4 h-64 rounded-xl bg-neutral-100/95 dark:bg-neutral-700/60 border border-neutral-200/70 dark:border-neutral-600/50" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={`fb-load-lower-${i}`}
                className="h-44 rounded-2xl animate-pulse border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
              />
            ))}
          </div>
          <div className="h-64 rounded-2xl animate-pulse border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800" />
        </div>
      )}
      {/* Instagram-only: analytics and posts not available; CTA to connect with Facebook */}
      {!showDashboardSkeleton && analyticsAccount?.platform === 'INSTAGRAM' && (analyticsAccount as { instagramLoginOnly?: boolean }).instagramLoginOnly && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4 px-4 py-4 rounded-lg upgrade-banner-warm">
          <p className="text-sm text-orange-900">
            <strong>Analytics and posts are not available</strong> when connected with Instagram only. Connect with Facebook to unlock full analytics, post history, and insights on both the Account and Posts tabs.
          </p>
          <button
            type="button"
            onClick={() => setSelectedPlatformForConnect('INSTAGRAM')}
            className="shrink-0 px-4 py-2.5 rounded-full text-chrome-text text-sm font-semibold shadow-md transition-all gradient-cta-pro"
          >
            Connect with Facebook for full features
          </button>
        </div>
      )}

      {/* When no account selected: show "All connected" or connect CTA. Disconnect is on Accounts page. */}
      {!showDashboardSkeleton && !analyticsAccount && (
      <div className="mt-6 flex flex-col gap-3">
        {hasAccounts ? (
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
                  className="mt-3 px-3 py-1.5 rounded-lg bg-amber-600 text-chrome-text text-sm font-medium hover:bg-amber-700"
                >
                  Refresh
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Single-page analytics for any selected account (Overview, Demografic, Clicks/Traffic, Posts, Reels/Videos) */}
      {!showDashboardSkeleton && analyticsAccount && (
        <div
          className="mt-1 max-w-full"
          style={{ maxWidth: 1400 }}
        >
          {/* Sync status row — auto-triggers refresh when stale, shows last-updated time */}
          <FacebookAnalyticsView
            insights={(() => {
              const base: import('@/components/analytics/facebook/types').FacebookInsights = {
                platform: analyticsAccount.platform,
                followers: effectiveFollowers,
                impressionsTotal: effectiveImpressions,
                impressionsTimeSeries: effectiveTimeSeries,
                pageViewsTotal: effectivePageVisits,
                reachTotal: effectiveReach,
                profileViewsTotal: effectiveProfileViews,
                followersTimeSeries: displayFollowersTimeSeries,
                ...(displayInsights && {
                  insightsHint: displayInsights.insightsHint,
                  followingCount: (displayInsights as { followingCount?: number }).followingCount,
                  followingTimeSeries: (displayInsights as { followingTimeSeries?: Array<{ date: string; value: number }> }).followingTimeSeries,
                  growthTimeSeries: displayInsights.growthTimeSeries as Array<{ date: string; gained: number; lost: number; net?: number }> | undefined,
                  pageViewsTimeSeries: (displayInsights as { pageViewsTimeSeries?: Array<{ date: string; value: number }> }).pageViewsTimeSeries,
                  demographics: displayInsights.demographics,
                  audienceByCountry: (displayInsights as { audienceByCountry?: FacebookInsights['audienceByCountry'] }).audienceByCountry,
                  firstConnectedAt: (displayInsights as { firstConnectedAt?: string | null }).firstConnectedAt,
                  isBootstrap: (displayInsights as { isBootstrap?: boolean }).isBootstrap,
                  facebookPageMetricSeries: (displayInsights as { facebookPageMetricSeries?: Record<string, Array<{ date: string; value: number }>> }).facebookPageMetricSeries,
                  facebookInsightPersistence: (displayInsights as { facebookInsightPersistence?: { dailyRowsUpserted: number } }).facebookInsightPersistence,
                  facebookAnalytics: (displayInsights as { facebookAnalytics?: FacebookFrontendAnalyticsBundle }).facebookAnalytics,
                  facebookPageProfile: (displayInsights as { facebookPageProfile?: import('@/components/analytics/facebook/types').FacebookInsights['facebookPageProfile'] }).facebookPageProfile,
                  facebookCommunity: (displayInsights as { facebookCommunity?: import('@/components/analytics/facebook/types').FacebookInsights['facebookCommunity'] }).facebookCommunity,
                  accountsEngaged: (displayInsights as { accountsEngaged?: number }).accountsEngaged,
                  instagramAccountVideoViewsTotal: (displayInsights as { instagramAccountVideoViewsTotal?: number }).instagramAccountVideoViewsTotal,
                  tiktokUser: (displayInsights as { tiktokUser?: import('@/components/analytics/facebook/types').FacebookInsights['tiktokUser'] }).tiktokUser,
                  tiktokCreatorInfo: (displayInsights as { tiktokCreatorInfo?: import('@/components/analytics/facebook/types').FacebookInsights['tiktokCreatorInfo'] }).tiktokCreatorInfo,
                  linkedIn: (displayInsights as { linkedIn?: import('@/components/analytics/facebook/types').FacebookInsights['linkedIn'] }).linkedIn,
                  trafficSources: (displayInsights as { trafficSources?: import('@/components/analytics/facebook/types').FacebookInsights['trafficSources'] }).trafficSources,
                  extra: (displayInsights as { extra?: import('@/components/analytics/facebook/types').FacebookInsights['extra'] }).extra,
                  // X (Twitter) — these were missing: analytics view gets all zeros without them
                  twitterUser: (displayInsights as { twitterUser?: FacebookInsights['twitterUser'] }).twitterUser,
                  twitterTotals: (displayInsights as { twitterTotals?: FacebookInsights['twitterTotals'] }).twitterTotals,
                  twitterEngagementTimeSeries: (displayInsights as { twitterEngagementTimeSeries?: FacebookInsights['twitterEngagementTimeSeries'] }).twitterEngagementTimeSeries,
                  recentTweets: (displayInsights as { recentTweets?: FacebookInsights['recentTweets'] }).recentTweets,
                  tweetCount: (displayInsights as { tweetCount?: number }).tweetCount,
                  twitterPagesFetched: (displayInsights as { twitterPagesFetched?: number }).twitterPagesFetched,
                  twitterTimelineTruncated: (displayInsights as { twitterTimelineTruncated?: boolean }).twitterTimelineTruncated,
                  ...((analyticsAccount.platform === 'FACEBOOK' || analyticsAccount.platform === 'INSTAGRAM') && liveFbConversationsCount != null ? { facebookLiveConversationsCount: liveFbConversationsCount } : {}),
                  ...((analyticsAccount.platform === 'FACEBOOK' || analyticsAccount.platform === 'INSTAGRAM') && liveFbConversationDates != null ? { facebookLiveConversationDates: liveFbConversationDates } : {}),
                }),
              };
              return base;
            })()}
            posts={importedPosts.filter((p: { platform: string }) => p.platform === analyticsAccount.platform) as import('@/components/analytics/facebook/types').FacebookPost[]}
            dateRange={dateRange}
            insightsLoading={effectiveInsightsLoading}
            postsLoading={importedPostsLoading}
            postsSyncActive={importedPostsLoading || postsSoftSyncing}
            onUpgrade={openPricingPopup}
            onReconnectFacebook={
              analyticsAccount?.platform === 'FACEBOOK'
                ? () => router.push('/dashboard?connect=facebook')
                : analyticsAccount?.platform === 'PINTEREST'
                  ? () => router.push('/dashboard?connect=pinterest')
                  : analyticsAccount?.platform === 'LINKEDIN'
                    ? () => router.push('/dashboard?connect=linkedin')
                    : undefined
            }
            postsSyncError={
              analyticsAccount.platform === 'LINKEDIN' || analyticsAccount.platform === 'THREADS'
                ? postsSyncError
                : null
            }
            linkedInReconnectHint={(() => {
              if (analyticsAccount.platform !== 'LINKEDIN') return null;
              const hint = (analyticsAccount as { linkedinReconnectHint?: string }).linkedinReconnectHint;
              return typeof hint === 'string' && hint.trim() ? hint.trim() : null;
            })()}
            linkedInSyncReady={
              analyticsAccount.platform === 'LINKEDIN'
                ? (analyticsAccount as { linkedinSyncReady?: boolean }).linkedinSyncReady
                : undefined
            }
            onDateRangeChange={handleAnalyticsDateRangeChange}
            followersLabel={
              analyticsAccount.platform === 'YOUTUBE'
                ? 'Subscribers'
                : analyticsAccount.platform === 'LINKEDIN'
                  ? 'Connections'
                  : 'Followers'
            }
            accountAvatarUrl={analyticsAccount.profilePicture ?? null}
            accountUsername={analyticsAccount.username ?? null}
            accountPlatform={analyticsAccount.platform}
            hasApiInsightsFetched={displayInsights != null}
            socialAccountId={analyticsAccount.platform === 'LINKEDIN' ? analyticsAccount.id : null}
            onAvatarError={handleAvatarError}
          />
        </div>
      )}

      {!analyticsLoadingOnly && !analyticsAccount && hasAccounts && (
        <p className="text-sm text-neutral-500 py-8">Select an account in the left sidebar to see its analytics.</p>
      )}

      {false && analyticsTab === 'posts' && (
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
              <div className="rounded-xl upgrade-banner-warm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
                <button
                  type="button"
                  onClick={openPricingPopup}
                  className="shrink-0 w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-lg gradient-cta-pro text-chrome-text font-semibold text-sm hover:opacity-90 transition-opacity"
                >
                  Upgrade plan
                </button>
                <p className="text-sm text-neutral-700">
                  You're viewing more than 30 days. Upgrade to remove watermarks and view full history.
                </p>
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
                        const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-neutral-100 text-neutral-800' : pl === 'LINKEDIN' ? 'bg-blue-100 text-blue-800' : pl === 'PINTEREST' ? 'bg-rose-100 text-rose-800' : 'bg-neutral-100 text-neutral-700';
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
                                <div className="bg-[#111827] text-chrome-text text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
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
                        const cls = pl === 'INSTAGRAM' ? 'bg-pink-100 text-pink-800' : pl === 'FACEBOOK' ? 'bg-blue-100 text-blue-800' : pl === 'YOUTUBE' ? 'bg-red-100 text-red-800' : pl === 'TIKTOK' ? 'bg-neutral-100 text-neutral-800' : pl === 'TWITTER' ? 'bg-neutral-100 text-neutral-800' : pl === 'LINKEDIN' ? 'bg-blue-100 text-blue-800' : pl === 'PINTEREST' ? 'bg-rose-100 text-rose-800' : 'bg-neutral-100 text-neutral-700';
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
                              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.9} />
                              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.6} />
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
                                <div className="bg-[#111827] text-chrome-text text-xs rounded-lg px-2.5 py-2 shadow-xl" style={{ borderRadius: 8 }}>
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
                  {importedPostsLoading && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-neutral-500">
                      <RefreshCw size={13} className="animate-spin opacity-75" />
                      Syncing...
                    </span>
                  )}
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
                      platform === 'TIKTOK' ? (isActive ? 'bg-neutral-900 border-neutral-900 text-chrome-text' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100') :
                      platform === 'TWITTER' ? (isActive ? 'bg-neutral-200 border-neutral-400 text-neutral-800' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100') :
                      platform === 'LINKEDIN' ? (isActive ? 'bg-blue-100 border-blue-400 text-blue-900' : 'border-neutral-200 text-neutral-600 hover:bg-blue-50') :
                      platform === 'PINTEREST' ? (isActive ? 'bg-rose-100 border-rose-400 text-rose-900' : 'border-neutral-200 text-neutral-600 hover:bg-rose-50') :
                      platform === 'THREADS' ? (isActive ? 'bg-neutral-900 border-neutral-900 text-chrome-text' : 'border-neutral-200 text-neutral-600 hover:bg-neutral-100') :
                      (isActive ? 'bg-[var(--primary)]/15 border-[var(--primary)]/40 text-[var(--primary)]' : 'border-neutral-200 text-neutral-600 hover:bg-[var(--primary)]/5');
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
                          const thumbnailSrc = post.platform === 'TWITTER' && postAny.platformPostId && analyticsAccount?.id
                            ? `/api/post-image?accountId=${encodeURIComponent(analyticsAccount.id)}&postId=${encodeURIComponent(postAny.platformPostId)}`
                            : post.thumbnailUrl;
                          return (
                          <tr key={post.id} className="hover:bg-neutral-50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <PostContentPreviewThumb
                                  platform={post.platform}
                                  mediaType={post.mediaType}
                                  thumbnailUrl={thumbnailSrc}
                                  className="w-12 h-12 rounded"
                                  imgClassName="w-12 h-12 rounded object-cover shrink-0"
                                  emptyClassName="w-12 h-12 rounded bg-neutral-100"
                                  imgExtraProps={
                                    /pinimg\.com|pinterest\.com/i.test(String(post.thumbnailUrl ?? ''))
                                      ? { referrerPolicy: 'no-referrer' as const }
                                      : undefined
                                  }
                                />
                                <div className="min-w-0 max-w-[220px]">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 text-neutral-400">{PLATFORM_ICON[post.platform]}</span>
                                    <p className="text-sm text-neutral-900 truncate">{post.content || 'No caption'}</p>
                                  </div>
                                  {post.permalinkUrl && (
                                    <a href={post.permalinkUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--primary)] hover:underline inline-flex items-center gap-0.5">
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
