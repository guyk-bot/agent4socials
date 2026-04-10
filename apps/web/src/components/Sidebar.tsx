'use client';

import React, { useEffect, useRef } from 'react';
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
  const { cachedAccounts, setCachedAccounts, setAccountsLoadError } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {}, setAccountsLoadError: () => {} };
  const ctx = useSelectedAccount();
  const selectedAccountId = ctx?.selectedAccountId ?? null;
  const selectedPlatformForConnect = ctx?.selectedPlatformForConnect ?? null;
  const setSelectedAccount = ctx?.setSelectedAccount ?? (() => {});
  const setSelectedPlatformForConnect = ctx?.setSelectedPlatformForConnect ?? (() => {});
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    let cancelled = false;
    const fetchAccounts = (retry = false) => {
      api.get('/social/accounts')
        .then((res) => {
          if (cancelled) return;
          const data = Array.isArray(res.data) ? res.data : [];
          setCachedAccounts(data);
          setAccountsLoadError(null);
        })
        .catch((err: { response?: { status?: number }; message?: string }) => {
          if (cancelled) return;
          const status = err?.response?.status;
          const msg = status === 401
            ? 'Session may have expired. Sign out and sign in again.'
            : status === 503
              ? 'Database connection issue. If you use Supabase: use the Transaction pooler (port 6543), then redeploy.'
              : 'Could not load accounts. Check your connection and refresh the page.';
          setAccountsLoadError(msg);
          if (!retry) setTimeout(() => fetchAccounts(true), 2500);
        });
    };
    fetchAccounts();
    return () => { cancelled = true; };
  }, [setCachedAccounts, setAccountsLoadError]);

  const accountsByPlatform = PLATFORM_ORDER.reduce<Record<string, SocialAccount[]>>((acc, p) => {
    acc[p] = (cachedAccounts as SocialAccount[]).filter((a) => a.platform === p);
    return acc;
  }, {});

  const text = textColor || '#171717';
  const isSummaryView = pathname === '/dashboard/summary';
  const isInboxPage = pathname === '/dashboard/inbox';
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
          href="/dashboard/summary"
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isSummaryView ? 'bg-neutral-200 text-neutral-700' : 'hover:bg-neutral-100 border border-transparent'
          }`}
        >
          <BarChart3 size={18} className="shrink-0" />
          Analytics
          {isSummaryView && <ChevronRight size={14} className="ml-auto opacity-70" />}
        </Link>
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
              isPlatformSelected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
            } ${needsUpgrade ? 'ring-1 ring-violet-400/50 bg-gradient-to-r from-violet-500/10 to-purple-500/10' : ''}`;
            const platformRowInner = (
              <>
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {PLATFORM_ICON[platform]}
                </div>
                <span className="truncate flex-1 font-medium">{PLATFORM_LABELS[platform]}</span>
                {needsUpgrade ? (
                  <span className="shrink-0 flex items-center text-violet-600" aria-hidden title="Upgrade to connect">
                    <Gem size={14} className="text-violet-600" aria-hidden />
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
                  isSelected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
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
                          className="flex items-center justify-center w-full h-full rounded-lg hover:bg-neutral-100/80"
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
                    <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden ${acc.profilePicture ? '' : 'bg-neutral-200'}`}>
                      {acc.profilePicture ? (
                        <img src={acc.profilePicture} alt="" className="w-full h-full object-cover" />
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
      className={`${sidebarOpen ? 'flex' : 'hidden'} md:flex w-64 border-r border-neutral-200 flex-col fixed left-0 top-14 bottom-0 bg-white min-h-0 transition-[transform] duration-200 pointer-events-auto ${isInboxPage ? 'z-[40]' : 'z-30'}`}
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
