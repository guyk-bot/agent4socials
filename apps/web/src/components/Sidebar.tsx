'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    BarChart3,
    FileText,
    Hash,
    Settings,
    ChevronRight,
    Plus,
    Zap,
    Sparkles,
    Gem,
    PanelLeftClose,
    HelpCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon, PinterestIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
  PINTEREST: 'Pinterest',
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={26} />,
  FACEBOOK: <FacebookIcon size={26} />,
  TIKTOK: <TikTokIcon size={26} />,
  YOUTUBE: <YoutubeIcon size={26} />,
  TWITTER: <XTwitterIcon size={26} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={26} />,
  PINTEREST: <PinterestIcon size={26} />,
};

const PLATFORM_ORDER = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'LINKEDIN', 'PINTEREST', 'TWITTER'];

/** Public profile URL for the platform icon (opens in a new tab). */
function externalProfileUrlForAccount(platform: string, username?: string | null, platformUserId?: string | null): string | null {
  const raw = (username || '').trim();
  const normalized = raw.replace(/^@/, '');
  const encodedUsername = encodeURIComponent(normalized);
  const encodedPlatformUserId = encodeURIComponent((platformUserId || '').trim());
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  switch (platform) {
    case 'FACEBOOK':
      if (normalized) return `https://www.facebook.com/${encodedUsername}`;
      if (encodedPlatformUserId) return `https://www.facebook.com/${encodedPlatformUserId}`;
      return 'https://www.facebook.com/';
    case 'INSTAGRAM':
      if (normalized) return `https://www.instagram.com/${encodedUsername}/`;
      return 'https://www.instagram.com/';
    case 'TIKTOK':
      if (normalized) return `https://www.tiktok.com/@${encodedUsername}`;
      return 'https://www.tiktok.com/';
    case 'YOUTUBE':
      if ((platformUserId || '').startsWith('UC')) return `https://www.youtube.com/channel/${encodedPlatformUserId}`;
      if (normalized.startsWith('UC')) return `https://www.youtube.com/channel/${encodedUsername}`;
      if (raw.startsWith('@')) return `https://www.youtube.com/${encodeURIComponent(raw)}`;
      if (normalized) return `https://www.youtube.com/@${encodedUsername}`;
      return 'https://www.youtube.com/';
    case 'TWITTER':
      if (normalized) return `https://x.com/${encodedUsername}`;
      if (encodedPlatformUserId) return `https://x.com/i/user/${encodedPlatformUserId}`;
      return 'https://x.com/';
    case 'LINKEDIN':
      if (normalized.includes('/')) {
        const withoutLeadingSlash = normalized.replace(/^\/+/, '');
        return `https://www.linkedin.com/${withoutLeadingSlash}`;
      }
      if (normalized) return `https://www.linkedin.com/in/${encodedUsername}/`;
      return 'https://www.linkedin.com/';
    case 'PINTEREST':
      if (normalized) return `https://www.pinterest.com/${encodedUsername}/`;
      return 'https://www.pinterest.com/';
    default:
      return null;
  }
}

/** Platforms that show a gem / upgrade styling on the connect row (empty = same as other networks). */
const UPGRADE_TO_CONNECT_PLATFORMS: string[] = [];

type SidebarProps = {
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
};

export default function Sidebar({ sidebarOpen = true, onSidebarToggle = () => {} }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { textColor } = useWhiteLabel();
  const {
    cachedAccounts,
    allCachedAccounts,
    setCachedAccounts,
    setAccountsLoadError,
    brands,
    activeBrandId,
    setActiveBrandId,
    createBrand,
    setBrandImage,
    getAccountBrandId,
  } = useAccountsCache() ?? {
    cachedAccounts: [],
    allCachedAccounts: [],
    setCachedAccounts: () => {},
    setAccountsLoadError: () => {},
    brands: [],
    activeBrandId: null,
    setActiveBrandId: () => {},
    createBrand: () => '',
    setBrandImage: () => {},
    getAccountBrandId: () => 'brand-default',
  };
  const ctx = useSelectedAccount();
  const selectedAccountId = ctx?.selectedAccountId ?? null;
  const selectedPlatformForConnect = ctx?.selectedPlatformForConnect ?? null;
  const setSelectedAccount = ctx?.setSelectedAccount ?? (() => {});
  const setSelectedPlatformForConnect = ctx?.setSelectedPlatformForConnect ?? (() => {});
  const clearSelection = ctx?.clearSelection ?? (() => {});
  const initialFetchDone = useRef(false);
  const missingAvatarRefreshDone = useRef(false);
  const refreshingAvatarIds = useRef<Set<string>>(new Set());
  const brandImageInputRef = useRef<HTMLInputElement | null>(null);
  const [brokenAvatarIds, setBrokenAvatarIds] = useState<Record<string, true>>({});

  const refreshAvatar = useCallback(async (accountId: string, platform: string) => {
    if (refreshingAvatarIds.current.has(accountId)) return;
    if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK' && platform !== 'TIKTOK' && platform !== 'TWITTER') return;
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

        // Backfill missing IG/FB avatars once so sidebar logos do not stay blank.
        if (!missingAvatarRefreshDone.current) {
          missingAvatarRefreshDone.current = true;
          const missingAvatarIds = data
            .filter((a) => (a?.platform === 'INSTAGRAM' || a?.platform === 'FACEBOOK') && !a?.profilePicture)
            .map((a) => a.id)
            .filter((id): id is string => typeof id === 'string' && id.length > 0);
          if (missingAvatarIds.length > 0) {
            await Promise.allSettled(missingAvatarIds.map((id) => api.patch(`/social/accounts/${id}/refresh`)));
            if (cancelled) return;
            const refreshed = await api.get('/social/accounts');
            if (cancelled) return;
            const refreshedData = Array.isArray(refreshed.data) ? refreshed.data : [];
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

  const text = textColor || '#171717';
  const isMainAnalyticsView = pathname === '/dashboard' || pathname === '/dashboard/console';
  const isPostsPage = pathname === '/posts';
  const isAutomationPage = pathname === '/dashboard/automation';
  const isHashtagPoolPage = pathname === '/dashboard/hashtag-pool';
  const isAiAssistantPage = pathname === '/dashboard/ai-assistant';
  const isSettingsPage = pathname === '/dashboard/settings';
  const isHelpPage = pathname === '/help';

  const sidebarContent = (
    <>
      <div className="p-3">
        <Link
          href="/dashboard/console"
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isMainAnalyticsView ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100 border border-transparent'
          }`}
        >
          <BarChart3 size={18} className="shrink-0" />
          Console
          {isMainAnalyticsView && <ChevronRight size={14} className="ml-auto opacity-70" />}
        </Link>
        <div className="mt-2 rounded-lg border border-neutral-200 p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Brands</p>
            <button
              type="button"
              onClick={() => {
                const name = typeof window !== 'undefined' ? window.prompt('Brand name') : null;
                if (!name) return;
                const createdId = createBrand(name);
                if (!createdId) return;
                clearSelection();
                router.push('/dashboard');
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-neutral-100"
              aria-label="Add brand"
              title="Add brand"
            >
              <Plus size={14} className="text-neutral-600" />
            </button>
          </div>
          <div className="space-y-1.5">
            {brands.map((brand) => {
              const isActive = brand.id === activeBrandId;
              const mappedCount = (allCachedAccounts as SocialAccount[]).filter((a) => getAccountBrandId(a.id) === brand.id).length;
              return (
                <div
                  key={brand.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setActiveBrandId(brand.id);
                    clearSelection();
                    router.push('/dashboard');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveBrandId(brand.id);
                      clearSelection();
                      router.push('/dashboard');
                    }
                  }}
                  className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left ${isActive ? 'sidebar-item-selected' : 'hover:bg-neutral-100/80'} cursor-pointer`}
                >
                  <div className="h-7 w-7 shrink-0 overflow-hidden rounded-full bg-neutral-100 flex items-center justify-center">
                    {brand.imageUrl ? (
                      <img src={brand.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-semibold text-neutral-500">
                        {(brand.name || 'B').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-neutral-800">{brand.name}</p>
                    <p className="text-[10px] text-neutral-500">{mappedCount} connected</p>
                  </div>
                  {isActive ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        brandImageInputRef.current?.click();
                      }}
                      className="rounded-md px-1.5 py-1 text-[10px] text-neutral-600 hover:bg-neutral-100"
                      title="Set brand image"
                    >
                      Image
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          <input
            ref={brandImageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file || !activeBrandId) return;
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result === 'string') setBrandImage(activeBrandId, reader.result);
              };
              reader.readAsDataURL(file);
              e.currentTarget.value = '';
            }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {PLATFORM_ORDER.map((platform) => {
          const accounts = accountsByPlatform[platform] ?? [];
          const isPlatformSelected = selectedPlatformForConnect === platform;

          if (accounts.length === 0) {
            const connectParam = platform.toLowerCase();
            const needsUpgrade = UPGRADE_TO_CONNECT_PLATFORMS.includes(platform);
            /** Connect URL per platform; optional gem styling when platform is in UPGRADE_TO_CONNECT_PLATFORMS. */
            const href = `/dashboard?connect=${connectParam}`;
            const platformRowClass = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
              isPlatformSelected ? 'sidebar-item-selected' : 'hover:bg-neutral-100/80'
            } ${needsUpgrade ? 'ring-1 ring-orange-400/50 bg-gradient-to-r from-orange-500/10 to-orange-500/10' : ''}`;
            const platformRowInner = (
              <>
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {PLATFORM_ICON[platform]}
                </div>
                <span className="truncate flex-1 font-medium">{PLATFORM_LABELS[platform]}</span>
                {needsUpgrade ? (
                  <span className="shrink-0 flex items-center text-orange-600" aria-hidden title="Upgrade to connect">
                    <Gem size={14} className="text-orange-600" aria-hidden />
                  </span>
                ) : null}
                <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 hover:bg-neutral-300">
                  <Plus size={14} className="text-neutral-600" />
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
            <div key={platform} className="space-y-0.5">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                const accountRowClass = `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors min-w-0 ${
                  isSelected ? 'sidebar-item-selected' : 'hover:bg-neutral-100/80'
                }`;
                // From Inbox or any page: go to this account's analytics via client-side nav (keeps cache, no reload).
                const dashboardUrl = `/dashboard?accountId=${encodeURIComponent(acc.id)}`;
                const platformLabel = PLATFORM_LABELS[platform] ?? platform;
                const externalUrl = externalProfileUrlForAccount(
                  platform,
                  acc.username as string | undefined,
                  (acc as { platformUserId?: string }).platformUserId
                );
                const goToAccountDashboard = () => {
                  setSelectedAccount(acc);
                  router.push(dashboardUrl);
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
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      {externalUrl ? (
                        <a
                          href={externalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          className="flex items-center justify-center w-full h-full rounded-lg hover:bg-orange-100/80"
                          title={`Open ${platformLabel} profile in a new tab`}
                          aria-label={`Open ${platformLabel} profile in a new tab`}
                        >
                          {PLATFORM_ICON[platform]}
                        </a>
                      ) : (
                        PLATFORM_ICON[platform]
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{acc.username || PLATFORM_LABELS[platform]}</div>
                    </div>
                    <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden ${acc.profilePicture && !brokenAvatarIds[acc.id] ? '' : 'bg-neutral-200'}`}>
                      {acc.profilePicture && !brokenAvatarIds[acc.id] ? (
                        <img
                          src={acc.profilePicture}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={() => {
                            setBrokenAvatarIds((prev) => ({ ...prev, [acc.id]: true }));
                            void refreshAvatar(acc.id, platform);
                          }}
                        />
                      ) : (
                        PLATFORM_ICON[platform] ?? <span className="font-bold text-xs text-neutral-500">?</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="p-3 space-y-0.5 border-t border-neutral-200 shrink-0">
        <Link
          href="/posts"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isPostsPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <FileText size={18} className="shrink-0" />
          <span>History</span>
        </Link>
        <Link
          href="/dashboard/automation"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAutomationPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <Zap size={18} className="shrink-0" />
          <span>Automation</span>
        </Link>
        <Link
          href="/dashboard/hashtag-pool"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHashtagPoolPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <Hash size={18} className="shrink-0" />
          <span>Hashtag Pool</span>
        </Link>
        <Link
          href="/dashboard/ai-assistant"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAiAssistantPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <Sparkles size={18} className="shrink-0" />
          <span>AI Assistant</span>
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isSettingsPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <Settings size={18} className="shrink-0" />
          <span>Brand settings</span>
        </Link>
      </div>

      <div className="mt-auto p-3 border-t border-neutral-200 shrink-0">
        <Link
          href="/help"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHelpPage ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100'}`}
        >
          <HelpCircle size={18} className="shrink-0" />
          <span>Need help?</span>
        </Link>
        <Link
          href="/help/support"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 mt-0.5"
        >
          <span className="text-xs">Open a support ticket</span>
        </Link>
      </div>
    </>
  );

  return (
    <div
      className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex w-64 border-r border-neutral-200 flex-col fixed left-0 top-14 bottom-0 bg-white min-h-0 transition-[transform] duration-200 pointer-events-auto z-10`}
      style={{ height: 'calc(100vh - 3.5rem)', backgroundColor: 'var(--wl-sidebar-bg, #ffffff)', color: text }}
    >
      {onSidebarToggle && (
        <div className="md:hidden flex justify-end p-2 border-b border-neutral-200 shrink-0">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100"
            aria-label="Hide sidebar"
          >
            <PanelLeftClose size={20} />
          </button>
        </div>
      )}
      {sidebarContent}
    </div>
  );
}
