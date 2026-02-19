'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
    ListChecks,
    FileText,
    Hash,
    Settings,
    LogOut,
    ChevronRight,
    Plus,
    MessageCircle,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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

const PLATFORM_ORDER = ['INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE', 'TWITTER', 'LINKEDIN'];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { logoUrl, primaryColor, textColor, appName } = useWhiteLabel();
  const { cachedAccounts, setCachedAccounts } = useAccountsCache() ?? { cachedAccounts: [], setCachedAccounts: () => {} };
  const ctx = useSelectedAccount();
  const selectedAccountId = ctx?.selectedAccountId ?? null;
  const selectedPlatformForConnect = ctx?.selectedPlatformForConnect ?? null;
  const setSelectedAccount = ctx?.setSelectedAccount ?? (() => {});
  const setSelectedPlatformForConnect = ctx?.setSelectedPlatformForConnect ?? (() => {});
  const clearSelection = ctx?.clearSelection ?? (() => {});

  useEffect(() => {
    if (cachedAccounts.length > 0) return;
    api.get('/social/accounts').then((res) => {
      const data = Array.isArray(res.data) ? res.data : [];
      setCachedAccounts(data);
    }).catch(() => {});
  }, [cachedAccounts.length, setCachedAccounts]);

  const accountsByPlatform = PLATFORM_ORDER.reduce<Record<string, SocialAccount[]>>((acc, p) => {
    acc[p] = (cachedAccounts as SocialAccount[]).filter((a) => a.platform === p);
    return acc;
  }, {});

  const accent = primaryColor || '#6366f1';
  const text = textColor || '#171717';
  const isAccountPage = pathname === '/dashboard/account';
  const isSummaryView = pathname === '/dashboard';
  const isDashboardOverview = pathname === '/dashboard' && !selectedAccountId && !selectedPlatformForConnect;

  const handleSummaryClick = () => {
    clearSelection();
    router.push('/dashboard');
  };

  return (
    <div
      className="w-64 border-r border-neutral-200 flex flex-col fixed left-0 top-14 bottom-0 z-30 bg-white min-h-0"
      style={{ height: 'calc(100vh - 3.5rem)', backgroundColor: 'var(--wl-sidebar-bg, #ffffff)', color: text }}
    >
      <div className="p-3">
        <button
          type="button"
          onClick={handleSummaryClick}
          className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isSummaryView ? 'bg-indigo-50 border border-indigo-100 shadow-sm' : 'hover:bg-neutral-100 border border-transparent'
          }`}
          style={isSummaryView ? { color: accent } : undefined}
        >
          <ListChecks size={18} className="shrink-0" />
          Summary
          {isSummaryView && <ChevronRight size={14} className="ml-auto opacity-70" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 space-y-1">
        {PLATFORM_ORDER.map((platform) => {
          const accounts = accountsByPlatform[platform] ?? [];
          const isPlatformSelected = selectedPlatformForConnect === platform;

          if (accounts.length === 0) {
            return (
              <button
                key={platform}
                type="button"
                onClick={() => {
                  setSelectedPlatformForConnect(platform);
                  router.push('/dashboard');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-sm transition-colors ${
                  isPlatformSelected ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
                }`}
                style={isPlatformSelected ? { color: accent } : undefined}
              >
                <div className="w-10 h-10 flex items-center justify-center shrink-0">
                  {PLATFORM_ICON[platform]}
                </div>
                <span className="truncate flex-1 font-medium">{PLATFORM_LABELS[platform]}</span>
                <div className="w-8 h-8 rounded-full bg-neutral-300 flex items-center justify-center shrink-0">
                  <Plus size={14} className="text-white" />
                </div>
              </button>
            );
          }

          return (
            <div key={platform} className="space-y-0.5">
              {accounts.map((acc) => {
                const isSelected = selectedAccountId === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => {
                      setSelectedAccount(acc);
                      router.push('/dashboard');
                    }}
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
                  </button>
                );
              })}
              {platform === 'INSTAGRAM' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPlatformForConnect(platform);
                    router.push('/dashboard');
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors ${
                    selectedPlatformForConnect === platform ? 'bg-white shadow-sm ring-1 ring-neutral-200' : 'hover:bg-white/70'
                  }`}
                  style={selectedPlatformForConnect === platform ? { color: accent } : undefined}
                >
                  <div className="w-8 h-8 flex items-center justify-center shrink-0 rounded-full bg-neutral-100">
                    <Plus size={14} className="text-neutral-500" />
                  </div>
                  <span className="flex-1 font-medium text-neutral-600">Connect with Instagram only</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-3 space-y-0.5 border-t border-neutral-200 shrink-0">
        <Link
          href="/posts"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pathname === '/posts' ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={pathname === '/posts' ? { color: accent } : undefined}
        >
          <FileText size={18} className="shrink-0" />
          <span>Reports</span>
        </Link>
        <Link
          href="/dashboard/automation"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pathname === '/dashboard/automation' ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={pathname === '/dashboard/automation' ? { color: accent } : undefined}
        >
          <MessageCircle size={18} className="shrink-0" />
          <span>Automation</span>
        </Link>
        <Link
          href="/dashboard/hashtag-pool"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pathname === '/dashboard/hashtag-pool' ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={pathname === '/dashboard/hashtag-pool' ? { color: accent } : undefined}
        >
          <Hash size={18} className="shrink-0" />
          <span>Hashtag Pool</span>
        </Link>
        <Link
          href="/dashboard/settings"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${pathname === '/dashboard/settings' ? 'bg-neutral-100' : 'hover:bg-neutral-100'}`}
          style={pathname === '/dashboard/settings' ? { color: accent } : undefined}
        >
          <Settings size={18} className="shrink-0" />
          <span>Brand settings</span>
        </Link>
      </div>

      <div className="mt-auto p-4 border-t border-neutral-200 shrink-0">
        <Link
          href="/dashboard/account"
          className={`w-full flex items-center p-2 rounded-lg transition-colors mb-2 ${isAccountPage ? '' : 'hover:bg-white/70'}`}
          style={isAccountPage ? { backgroundColor: `${accent}20`, color: accent } : undefined}
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border border-neutral-200 shrink-0 bg-white" style={{ color: accent }}>
            {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: text }}>{user?.name || 'User'}</p>
            <p className="text-xs truncate opacity-70" style={{ color: text }}>{user?.email}</p>
          </div>
          <ChevronRight size={16} className="text-neutral-400 shrink-0" />
        </Link>
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-white/70 hover:text-red-600 rounded-lg transition-colors"
        >
          <LogOut size={20} className="mr-3 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );
}
