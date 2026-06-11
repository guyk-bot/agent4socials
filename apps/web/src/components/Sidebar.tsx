'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
    BarChart3,
    FileText,
    History,
    ChevronRight,
    Plus,
    Gem,
    PanelLeftClose,
    HelpCircle,
    Settings,
    Users,
    Users2,
    Lightbulb,
    Loader2,
} from 'lucide-react';
import { PlatformConnectLoading } from '@/components/PlatformConnectLoading';
import {
  OAUTH_CONNECT_IN_FLIGHT_EVENT,
  readOAuthConnectInFlight,
} from '@/lib/oauth-connect';
import api from '@/lib/api';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import { useTheme } from '@/context/ThemeContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon, ThreadsIcon } from '@/components/SocialPlatformIcons';
import { avatarDisplayUrl } from '@/lib/avatar-display-url';
import { BRAND_NAME } from '@/lib/site-brand-assets';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
  THREADS: 'Threads',
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={28} />,
  FACEBOOK: <FacebookIcon size={28} />,
  TIKTOK: <TikTokIcon size={28} />,
  YOUTUBE: <YoutubeIcon size={28} />,
  TWITTER: <XTwitterIcon size={28} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={28} />,
  PINTEREST: <PinterestIcon size={28} />,
  THREADS: <ThreadsIcon size={28} />,
};

const PLATFORM_ORDER = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'THREADS', 'PINTEREST', 'LINKEDIN'];

/** Vertical padding on platform rows. */
const PLATFORM_ROW_PY = 'py-1.5';

/** Platforms that show a gem / upgrade styling on the connect row (empty = same as other networks). */
const UPGRADE_TO_CONNECT_PLATFORMS: string[] = [];

type SidebarProps = {
  onSidebarToggle?: () => void;
};

export default function Sidebar({ onSidebarToggle = () => {} }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { textColor } = useWhiteLabel();
  const { theme } = useTheme();
  const { cachedAccounts, setCachedAccounts, setAccountsLoadError } = useAccountsCache() ?? {
    cachedAccounts: [],
    setCachedAccounts: () => {},
    setAccountsLoadError: () => {},
  };
  const ctx = useSelectedAccount();
  const selectedAccountId = ctx?.selectedAccountId ?? null;
  const selectedPlatformForConnect = ctx?.selectedPlatformForConnect ?? null;
  const setSelectedAccount = ctx?.setSelectedAccount ?? (() => {});
  const setSelectedPlatformForConnect = ctx?.setSelectedPlatformForConnect ?? (() => {});
  const initialFetchDone = useRef(false);
  const missingAvatarRefreshDone = useRef(false);
  const refreshingAvatarIds = useRef<Set<string>>(new Set());
  const [brokenAvatarIds, setBrokenAvatarIds] = useState<Record<string, true>>({});
  const [oauthInFlightPlatform, setOauthInFlightPlatform] = useState<string | null>(() =>
    typeof window !== 'undefined' ? readOAuthConnectInFlight() : null
  );

  useEffect(() => {
    const sync = () => setOauthInFlightPlatform(readOAuthConnectInFlight());
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener(OAUTH_CONNECT_IN_FLIGHT_EVENT, sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(OAUTH_CONNECT_IN_FLIGHT_EVENT, sync);
    };
  }, [searchParams.get('connecting'), searchParams.get('newPlatform'), searchParams.get('accountId')]);

  const refreshAvatar = useCallback(async (accountId: string, platform: string) => {
    if (refreshingAvatarIds.current.has(accountId)) return;
    if (
      platform !== 'INSTAGRAM' &&
      platform !== 'FACEBOOK' &&
      platform !== 'TIKTOK' &&
      platform !== 'TWITTER' &&
      platform !== 'YOUTUBE' &&
      platform !== 'PINTEREST' &&
      platform !== 'LINKEDIN' &&
      platform !== 'THREADS'
    ) return;
    refreshingAvatarIds.current.add(accountId);
    try {
      await api.patch(`/social/accounts/${accountId}/refresh`);
      const refreshed = await api.get('/social/accounts');
      const refreshedData = Array.isArray(refreshed.data) ? refreshed.data : [];
      setCachedAccounts(refreshedData);
      // Clear the broken flag so the fresh URL can be tried
      setBrokenAvatarIds((prev) => {
        const next = { ...prev };
        delete next[accountId];
        return next;
      });
    } catch {
      // leave platform icon as fallback
    } finally {
      refreshingAvatarIds.current.delete(accountId);
    }
  }, [setCachedAccounts]);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    let cancelled = false;
    const fetchAccounts = async (retry = false) => {
      try {
        const res = await api.get('/social/accounts');
        if (cancelled) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setCachedAccounts(data);
        setAccountsLoadError(null);

        // Run one metadata/avatar refresh pass so profile changes on platforms
        // are picked up in sidebar without forcing reconnect.
        if (!missingAvatarRefreshDone.current) {
          missingAvatarRefreshDone.current = true;
          const refreshCandidateIds = data
            .filter((a) =>
              a?.platform === 'INSTAGRAM' ||
              a?.platform === 'FACEBOOK' ||
              a?.platform === 'TIKTOK' ||
              a?.platform === 'TWITTER' ||
              a?.platform === 'YOUTUBE' ||
              a?.platform === 'PINTEREST' ||
              a?.platform === 'LINKEDIN' ||
              a?.platform === 'THREADS'
            )
            .map((a) => a.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
          if (refreshCandidateIds.length > 0) {
            await Promise.allSettled(refreshCandidateIds.map((id) => api.patch(`/social/accounts/${id}/refresh`)));
            if (cancelled) return;
            const refreshed = await api.get('/social/accounts');
            if (cancelled) return;
            let refreshedData = Array.isArray(refreshed.data) ? refreshed.data : [];
            const tiktokStillMissingAvatar = refreshedData.filter(
              (a) => a?.platform === 'TIKTOK' && !(a.profilePicture ?? '').trim()
            );
            if (tiktokStillMissingAvatar.length > 0) {
              await Promise.allSettled(
                tiktokStillMissingAvatar.map((a) => api.patch(`/social/accounts/${a.id}/refresh`))
              );
              if (!cancelled) {
                const retry = await api.get('/social/accounts');
                if (!cancelled) {
                  refreshedData = Array.isArray(retry.data) ? retry.data : refreshedData;
                }
              }
            }
            const threadsStillMissingAvatar = refreshedData.filter(
              (a) => a?.platform === 'THREADS' && !(a.profilePicture ?? '').trim()
            );
            if (threadsStillMissingAvatar.length > 0) {
              await Promise.allSettled(
                threadsStillMissingAvatar.map((a) => api.patch(`/social/accounts/${a.id}/refresh`))
              );
              if (!cancelled) {
                const retry = await api.get('/social/accounts');
                if (!cancelled) {
                  refreshedData = Array.isArray(retry.data) ? retry.data : refreshedData;
                }
              }
            }
            setCachedAccounts(refreshedData);
          }
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { response?: { status?: number } })?.response?.status;
        const msg = status === 401
          ? 'Session may have expired. Sign out and sign in again.'
          : status === 503
            ? 'Database connection issue. If you use Supabase: use the Transaction pooler (port 6543), then redeploy.'
            : 'Could not load accounts. Check your connection and refresh the page.';
        setAccountsLoadError(msg);
        if (!retry) setTimeout(() => { void fetchAccounts(true); }, 2500);
      }
    };
    void fetchAccounts();
    return () => { cancelled = true; };
  }, [setCachedAccounts, setAccountsLoadError]);

  const accountsByPlatform = PLATFORM_ORDER.reduce<Record<string, SocialAccount[]>>((acc, p) => {
    acc[p] = (cachedAccounts as SocialAccount[]).filter((a) => a.platform === p);
    return acc;
  }, {});

  const text = theme === 'dark' && (!textColor || textColor.toLowerCase() === '#171717')
    ? 'var(--foreground)'
    : (textColor || '#171717');
  const isMainAnalyticsView = pathname === '/dashboard' || pathname === '/dashboard/console';
  const isPostsPage = pathname === '/posts';
  const isReportsPage = pathname === '/dashboard/reports';
  const isBrandPage = pathname === '/dashboard/brand';
  const isLeadsPage = pathname === '/dashboard/leads';
  const isTeamPage = pathname === '/dashboard/account';
  const isBrainstormPage = pathname === '/dashboard/brainstorm';
  const isHelpSection = pathname === '/help' || pathname?.startsWith('/help/');

  const workspaceNav = [
    { key: 'brand', href: '/dashboard/brand', label: 'Brand', icon: <Settings size={18} className="shrink-0" />, active: isBrandPage },
    { key: 'leads', href: '/dashboard/leads', label: 'Leads', icon: <Users size={18} className="shrink-0" />, active: isLeadsPage },
    { key: 'team', href: '/dashboard/account#team-members', label: 'Team', icon: <Users2 size={18} className="shrink-0" />, active: isTeamPage },
    { key: 'reports', href: '/dashboard/reports', label: 'Reports', icon: <FileText size={18} className="shrink-0" />, active: isReportsPage },
    { key: 'brainstorm', href: '/dashboard/brainstorm', label: 'Brainstorm', icon: <Lightbulb size={18} className="shrink-0" />, active: isBrainstormPage },
  ];

  const sidebarConnectingLabel =
    oauthInFlightPlatform && PLATFORM_LABELS[oauthInFlightPlatform]
      ? PLATFORM_LABELS[oauthInFlightPlatform]
      : null;

  const sidebarContent = (
    <>
      {sidebarConnectingLabel ? (
        <div className="mx-2 mb-1.5 rounded-lg border border-orange-200/80 bg-orange-50/90 px-2.5 py-2 dark:border-orange-900/50 dark:bg-orange-950/40">
          <PlatformConnectLoading variant="compact" platformLabel={sidebarConnectingLabel} />
        </div>
      ) : null}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 px-1.5 pt-0 pb-1">
        {PLATFORM_ORDER.map((platform) => {
          const accounts = accountsByPlatform[platform] ?? [];
          const isPlatformSelected = selectedPlatformForConnect === platform;

          if (accounts.length === 0) {
            const connectParam = platform.toLowerCase();
            const needsUpgrade = UPGRADE_TO_CONNECT_PLATFORMS.includes(platform);
            const connectPending = oauthInFlightPlatform === platform;
            /** Connect URL per platform; optional gem styling when platform is in UPGRADE_TO_CONNECT_PLATFORMS. */
            const href = `/dashboard?connect=${connectParam}`;
            const platformRowClass = `flex items-center gap-3 px-3 ${PLATFORM_ROW_PY} rounded-lg text-left text-sm transition-colors border border-transparent ${
              isPlatformSelected || connectPending ? 'sidebar-item-selected' : 'hover:bg-neutral-100/80 dark:hover:border-neutral-700'
            } ${needsUpgrade ? 'ring-1 ring-orange-400/50 bg-gradient-to-r from-orange-500/10 to-orange-500/10' : ''}`;
            const platformRowInner = (
              <>
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {PLATFORM_ICON[platform]}
                </div>
                <span className="truncate flex-1 font-medium">
                  {connectPending ? `Connecting ${PLATFORM_LABELS[platform]}…` : PLATFORM_LABELS[platform]}
                </span>
                {needsUpgrade ? (
                  <span className="shrink-0 flex items-center text-orange-600" aria-hidden title="Upgrade to connect">
                    <Gem size={14} className="text-orange-600" aria-hidden />
                  </span>
                ) : null}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    connectPending
                      ? 'bg-orange-100 text-orange-600'
                      : 'bg-neutral-200 hover:bg-neutral-300 text-neutral-600'
                  }`}
                  aria-hidden
                >
                  {connectPending ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  ) : (
                    <Plus size={14} />
                  )}
                </div>
              </>
            );
            return (
              <Link
                key={platform}
                href={href}
                onClick={() => setSelectedPlatformForConnect(platform)}
                className={platformRowClass}
                title={needsUpgrade ? 'Upgrade to connect this network.' : undefined}
              >
                {platformRowInner}
              </Link>
            );
          }

          return (
            <div key={platform} className="flex flex-col">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                const accountRowClass = `flex items-center gap-3 px-3 ${PLATFORM_ROW_PY} rounded-lg text-left text-sm transition-colors min-w-0 border border-transparent ${
                  isSelected ? 'sidebar-item-selected' : 'hover:bg-neutral-100/80 dark:hover:border-neutral-700'
                }`;
                // From Inbox or any page: go to this account's analytics via client-side nav (keeps cache, no reload).
                const dashboardUrl = `/dashboard?accountId=${encodeURIComponent(acc.id)}`;
                const platformLabel = PLATFORM_LABELS[platform] ?? platform;
                const goToAccountDashboard = () => {
                  setSelectedAccount(acc);
                  window.location.href = dashboardUrl;
                };
                return (
                  <div
                    key={acc.id}
                    role="button"
                    tabIndex={0}
                    onClick={goToAccountDashboard}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        goToAccountDashboard();
                      }
                    }}
                    className={`${accountRowClass} cursor-pointer`}
                    title={`View ${platformLabel} analytics`}
                    aria-label={`View ${acc.username || platformLabel} analytics`}
                  >
                    <div
                      className="w-10 h-10 flex items-center justify-center shrink-0 rounded-lg"
                      aria-hidden
                    >
                      {PLATFORM_ICON[platform]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{acc.username || PLATFORM_LABELS[platform]}</div>
                    </div>
                    <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden ${acc.profilePicture && !brokenAvatarIds[acc.id] ? '' : 'bg-neutral-200 dark:bg-neutral-700'}`}>
                      {(() => {
                        const avatarSrc = avatarDisplayUrl(platform, acc.profilePicture);
                        return avatarSrc && !brokenAvatarIds[acc.id] ? (
                          <img
                            src={avatarSrc}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={() => {
                              setBrokenAvatarIds((prev) => ({ ...prev, [acc.id]: true }));
                              void refreshAvatar(acc.id, platform);
                            }}
                          />
                        ) : (
                          PLATFORM_ICON[platform] ?? <span className="font-bold text-xs text-neutral-500">?</span>
                        );
                      })()}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="mt-2 pt-1.5 px-2 pb-1.5 space-y-0 border-t border-neutral-200 shrink-0">
        {workspaceNav.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium border border-transparent ${
              item.active ? 'sidebar-item-selected text-[var(--foreground)]' : 'hover:bg-[var(--bg-hover)]'
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
          </Link>
        ))}
      </div>

      <div className="pt-1 px-2 pb-1.5 space-y-0 border-t border-neutral-200 shrink-0">
        <Link
          href="/posts"
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium border border-transparent ${isPostsPage ? 'sidebar-item-selected text-[var(--foreground)]' : 'hover:bg-[var(--bg-hover)]'}`}
        >
          <History size={18} className="shrink-0" />
          <span>History</span>
        </Link>
      </div>

      <div className="mt-auto px-2 py-2 border-t border-neutral-200 shrink-0">
        <Link
          href="/help"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-transparent ${isHelpSection ? 'sidebar-item-selected text-[var(--foreground)]' : 'hover:bg-[var(--bg-hover)]'}`}
        >
          <HelpCircle size={18} className="shrink-0" />
          <span>Need help?</span>
        </Link>
      </div>
    </>
  );

  return (
    <div
      className="flex flex-1 border-r border-[var(--border)] flex-col bg-[var(--bg-surface)] min-h-0 pointer-events-auto overflow-hidden"
      style={{ backgroundColor: 'var(--wl-sidebar-bg, var(--bg-surface))', color: text }}
    >
      <div className="flex items-stretch gap-0 border-b border-neutral-200 shrink-0 pl-1.5">
        <Link
          href="/dashboard/console"
          onClick={(e) => {
            if (pathname === '/dashboard/console') e.preventDefault();
          }}
          className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
            isMainAnalyticsView ? 'sidebar-item-selected text-[var(--foreground)]' : 'hover:bg-[var(--bg-hover)] border border-transparent'
          }`}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center">
            <BarChart3 size={18} className="shrink-0" />
          </div>
          <span className="truncate">Console</span>
          {isMainAnalyticsView && <ChevronRight size={14} className="ml-auto shrink-0 opacity-70" />}
        </Link>
        <button
          type="button"
          onClick={onSidebarToggle}
          className="shrink-0 border-l border-neutral-200 px-2 py-3 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Close sidebar"
          title="Close sidebar"
        >
          <PanelLeftClose size={18} />
        </button>
      </div>
      {sidebarContent}
    </div>
  );
}
