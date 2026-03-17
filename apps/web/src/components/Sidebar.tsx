'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3,
    FileText,
    Hash,
    Settings,
    ChevronRight,
    Plus,
    Zap,
    Sparkles,
    PanelLeftClose,
    HelpCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { useAccountsCache } from '@/context/AccountsCacheContext';
import { useSelectedAccount } from '@/context/SelectedAccountContext';
import type { SocialAccount } from '@/context/SelectedAccountContext';
import { InstagramIcon, FacebookIcon, TikTokIcon, YoutubeIcon, XTwitterIcon, LinkedinIcon } from '@/components/SocialPlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  YOUTUBE: 'YouTube',
  TWITTER: 'Twitter/X',
  LINKEDIN: 'LinkedIn',
};

const PLATFORM_ICON: Record<string, React.ReactNode> = {
  INSTAGRAM: <InstagramIcon size={26} />,
  FACEBOOK: <FacebookIcon size={26} />,
  TIKTOK: <TikTokIcon size={26} />,
  YOUTUBE: <YoutubeIcon size={26} />,
  TWITTER: <XTwitterIcon size={26} className="text-neutral-800" />,
  LINKEDIN: <LinkedinIcon size={26} />,
};

const PLATFORM_ORDER = ['FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];

/** Twitter and LinkedIn require upgrade to connect; highlight in sidebar when unconnected */
const UPGRADE_TO_CONNECT_PLATFORMS = ['TWITTER', 'LINKEDIN'];

type SidebarProps = {
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
};

export default function Sidebar({ sidebarOpen = true, onSidebarToggle = () => {} }: SidebarProps) {
  const pathname = usePathname();
  const { primaryColor, textColor } = useWhiteLabel();
  const { cachedAccounts, setCachedAccounts, setAccountsLoadError } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {}, setAccountsLoadError: () => {} };
  const ctx = useSelectedAccount();
  const selectedAccountId = ctx?.selectedAccountId ?? null;
  const selectedPlatformForConnect = ctx?.selectedPlatformForConnect ?? null;
  const setSelectedAccount = ctx?.setSelectedAccount ?? (() => {});
  const setSelectedPlatformForConnect = ctx?.setSelectedPlatformForConnect ?? (() => {});
  const clearSelection = ctx?.clearSelection ?? (() => {});

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

  const accent = primaryColor || '#5ff6fd';
  const text = textColor || '#171717';
  const isSummaryView = pathname === '/dashboard/summary';
  const isDashboardOverview = pathname === '/dashboard/summary' && !selectedAccountId && !selectedPlatformForConnect;
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
            isSummaryView ? 'bg-[var(--primary)]/15 border border-[var(--primary)]/25 shadow-sm' : 'hover:bg-neutral-100 border border-transparent'
          }`}
          style={isSummaryView ? { color: accent } : undefined}
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
            return (
              <Link
                key={platform}
                href={`/dashboard?connect=${connectParam}`}
                onClick={() => setSelectedPlatformForConnect(platform)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  isPlatformSelected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
                } ${needsUpgrade ? 'ring-1 ring-[#5ff6fd]/40 bg-gradient-to-r from-[#5ff6fd]/5 to-[#df44dc]/5' : ''}`}
                style={isPlatformSelected ? { color: accent } : undefined}
                title={needsUpgrade ? 'Upgrade to connect Twitter/X or LinkedIn' : undefined}
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {PLATFORM_ICON[platform]}
                </div>
                <span className="truncate flex-1 font-medium">{PLATFORM_LABELS[platform]}</span>
                {needsUpgrade ? (
                  <span className="shrink-0 text-[10px] font-semibold text-[#df44dc] uppercase tracking-wide">Upgrade</span>
                ) : null}
                <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center shrink-0 hover:bg-neutral-300">
                  <Plus size={14} className="text-neutral-600" />
                </div>
              </Link>
            );
          }

          return (
            <div key={platform} className="space-y-0.5">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                return (
                  <Link
                    key={acc.id}
                    href="/dashboard"
                    onClick={() => setSelectedAccount(acc)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors min-w-0 ${
                      isSelected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
                    }`}
                    style={isSelected ? { color: accent } : undefined}
                  >
                    <div className="w-10 h-10 flex items-center justify-center shrink-0">
                      {PLATFORM_ICON[platform]}
                    </div>
                    <span className="truncate flex-1 font-medium">{acc.username || PLATFORM_LABELS[platform]}</span>
                    <div className={`w-8 h-8 flex items-center justify-center shrink-0 rounded-full overflow-hidden ${acc.profilePicture ? '' : 'bg-neutral-200'}`}>
                      {acc.profilePicture ? (
                        <img src={acc.profilePicture} alt="" className="w-full h-full object-cover" />
                      ) : (
                        PLATFORM_ICON[platform] ?? <span className="font-bold text-xs text-neutral-500">?</span>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="p-3 space-y-0.5 border-t border-neutral-200 shrink-0">
        {isInboxPage ? (
          <a
            href="/posts"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isPostsPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isPostsPage ? { color: accent } : undefined}
          >
            <FileText size={18} className="shrink-0" />
            <span>History</span>
          </a>
        ) : (
        <Link
          href="/posts"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isPostsPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isPostsPage ? { color: accent } : undefined}
        >
          <FileText size={18} className="shrink-0" />
          <span>History</span>
        </Link>
        )}
        {isInboxPage ? (
          <a
            href="/dashboard/automation"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAutomationPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isAutomationPage ? { color: accent } : undefined}
          >
            <Zap size={18} className="shrink-0" />
            <span>Automation</span>
          </a>
        ) : (
        <Link
          href="/dashboard/automation"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAutomationPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isAutomationPage ? { color: accent } : undefined}
        >
          <Zap size={18} className="shrink-0" />
          <span>Automation</span>
        </Link>
        )}
        {isInboxPage ? (
          <a
            href="/dashboard/hashtag-pool"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHashtagPoolPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isHashtagPoolPage ? { color: accent } : undefined}
          >
            <Hash size={18} className="shrink-0" />
            <span>Hashtag Pool</span>
          </a>
        ) : (
        <Link
          href="/dashboard/hashtag-pool"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHashtagPoolPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isHashtagPoolPage ? { color: accent } : undefined}
        >
          <Hash size={18} className="shrink-0" />
          <span>Hashtag Pool</span>
        </Link>
        )}
        {isInboxPage ? (
          <a
            href="/dashboard/ai-assistant"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAiAssistantPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isAiAssistantPage ? { color: accent } : undefined}
          >
            <Sparkles size={18} className="shrink-0" />
            <span>AI Assistant</span>
          </a>
        ) : (
        <Link
          href="/dashboard/ai-assistant"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isAiAssistantPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isAiAssistantPage ? { color: accent } : undefined}
        >
          <Sparkles size={18} className="shrink-0" />
          <span>AI Assistant</span>
        </Link>
        )}
        {isInboxPage ? (
          <a
            href="/dashboard/settings"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isSettingsPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isSettingsPage ? { color: accent } : undefined}
          >
            <Settings size={18} className="shrink-0" />
            <span>Brand settings</span>
          </a>
        ) : (
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isSettingsPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isSettingsPage ? { color: accent } : undefined}
        >
          <Settings size={18} className="shrink-0" />
          <span>Brand settings</span>
        </Link>
        )}
      </div>

      <div className="mt-auto p-3 border-t border-neutral-200 shrink-0">
        {isInboxPage ? (
          <a
            href="/help"
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHelpPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
            style={isHelpPage ? { color: accent } : undefined}
          >
            <HelpCircle size={18} className="shrink-0" />
            <span>Need help?</span>
          </a>
        ) : (
        <Link
          href="/help"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${isHelpPage ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={isHelpPage ? { color: accent } : undefined}
        >
          <HelpCircle size={18} className="shrink-0" />
          <span>Need help?</span>
        </Link>
        )}
        {isInboxPage ? (
          <a
            href="/help/support"
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 mt-0.5"
          >
            <span className="text-xs">Open a support ticket</span>
          </a>
        ) : (
        <Link
          href="/help/support"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-neutral-600 hover:bg-neutral-100 mt-0.5"
        >
          <span className="text-xs">Open a support ticket</span>
        </Link>
        )}
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
