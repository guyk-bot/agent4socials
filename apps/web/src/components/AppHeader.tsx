'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageCircle, PlusSquare, Calendar, Menu, PanelLeft, PanelLeftClose, Link2, Sun, Moon, Brain } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { BRAND_NAME, SITE_LOGO_SRC, normalizeLegacyBrandName } from '@/lib/site-brand-assets';
import { useTheme } from '@/context/ThemeContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { formatInboxBadgeTitle } from '@/lib/inbox/unread-count';
import { readLastActiveChatId } from '@/lib/ai/aysop-chat-local-cache';
import { SMART_LINKS_COMING_SOON_LABEL } from '@/lib/smart-links/feature-flag';

function topNavHref(item: (typeof topNavItems)[number], userId?: string | null): string {
  if (item.href === '/dashboard/aysop-ai' && userId) {
    const last = readLastActiveChatId(userId);
    if (last && !last.startsWith('offline-')) {
      return `/dashboard/aysop-ai?c=${encodeURIComponent(last)}`;
    }
  }
  return item.href;
}

export const topNavItems = [
  { icon: MessageCircle, label: 'Inbox', href: '/dashboard/inbox', badgeKey: 'inbox' as const },
  { icon: PlusSquare, label: 'Composer', href: '/composer' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
  { icon: Link2, label: 'Smart Links', href: '/dashboard/smart-links', comingSoon: true as const },
  { icon: Brain, label: `${BRAND_NAME} AI`, href: '/dashboard/aysop-ai' },
];

type AppHeaderProps = {
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
};

export default function AppHeader({ sidebarOpen = true, onSidebarToggle }: AppHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { logoUrl, appName } = useWhiteLabel();
  const { theme, toggleTheme } = useTheme();
  const appData = useAppData();
  const [topNavOpen, setTopNavOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appData) return;
    api.get<{ inbox?: number }>('/social/notifications').then((r) => {
      setInboxCount(r.data?.inbox ?? 0);
    }).catch(() => setInboxCount(0));
  }, [pathname, appData]);

  useEffect(() => {
    if (!topNavOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setTopNavOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [topNavOpen]);

  const isAccountPage = pathname === '/dashboard/account';
  const displayAppName = normalizeLegacyBrandName(appName || BRAND_NAME);

  const navLinkClass = (active: boolean, disabled?: boolean) =>
    `relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
      disabled
        ? 'text-chrome-text/45 cursor-not-allowed select-none'
        : active
          ? 'bg-white/15 text-chrome-text'
          : 'text-chrome-text/70 hover:text-chrome-text hover:bg-white/10'
    }`;

  const comingSoonBadge = (
    <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-chrome-text/70">
      {SMART_LINKS_COMING_SOON_LABEL}
    </span>
  );

  return (
    <header className="h-full w-full flex items-center justify-between px-4 sm:px-6 bg-[var(--dark)] text-chrome-text border-b border-white/10 pointer-events-auto">
      <div className="flex items-center gap-2 md:gap-8 min-w-0">
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="md:hidden p-2 -ml-1 rounded-lg text-chrome-text/70 hover:text-chrome-text hover:bg-white/10"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={22} /> : <PanelLeft size={22} />}
          </button>
        )}
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-7 w-7 sm:h-8 sm:w-8 object-contain" />
          ) : (
            <img src={SITE_LOGO_SRC} alt={BRAND_NAME} className="h-7 w-7 sm:h-8 sm:w-8 object-contain block bg-transparent" />
          )}
          <span className="font-semibold text-chrome-text hidden sm:inline truncate">{displayAppName}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {topNavItems.map((item) => {
            const isActive = item.href === '/composer'
              ? pathname === '/composer' && searchParams.get('analyze') !== 'reel'
              : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0]));
            const inboxRaw = appData?.notifications?.inbox ?? inboxCount;
            const badge = item.badgeKey === 'inbox' ? inboxRaw : 0;
            const inboxBadgeTitle =
              item.badgeKey === 'inbox' && appData?.notifications
                ? formatInboxBadgeTitle({
                    inbox: appData.notifications.inbox,
                    messages: appData.notifications.messages,
                    comments: appData.notifications.comments,
                    byPlatform: appData.notifications.byPlatform ?? {},
                  })
                : badge > 0
                  ? `${badge} unread`
                  : undefined;
            const content = (
              <>
                <item.icon size={18} />
                {item.label}
                {'comingSoon' in item && item.comingSoon ? comingSoonBadge : null}
                {badge > 0 && (
                  <span
                    title={inboxBadgeTitle}
                    className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-chrome-text text-xs font-bold"
                  >
                    {badge > 99 ? '99' : badge}
                  </span>
                )}
              </>
            );
            if ('comingSoon' in item && item.comingSoon) {
              return (
                <span
                  key={item.href}
                  className={navLinkClass(false, true)}
                  aria-disabled="true"
                  title={SMART_LINKS_COMING_SOON_LABEL}
                >
                  {content}
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={topNavHref(item, user?.id)}
                prefetch={item.href === '/composer'}
                className={navLinkClass(isActive)}
                title={item.badgeKey === 'inbox' ? inboxBadgeTitle : undefined}
              >
                {content}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Dark mode toggle + Profile/account (top right) + mobile menu */}
      <div className="flex items-center gap-1 relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-lg text-chrome-text/70 hover:text-chrome-text hover:bg-white/10 transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <Link
          href="/dashboard/account"
          className="flex items-stretch w-9 h-9 rounded-full overflow-hidden border-2 border-neutral-600 text-chrome-text/70 hover:text-chrome-text hover:border-neutral-500 hover:bg-white/10 transition-colors shrink-0"
          title="Account"
          aria-label="Account"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full min-h-0 object-cover" />
          ) : (
            <span className="flex flex-1 min-h-0 min-w-0 items-center justify-center text-sm font-semibold leading-none">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setTopNavOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg text-chrome-text/70 hover:text-chrome-text hover:bg-white/10"
          aria-label="Open menu"
          aria-expanded={topNavOpen}
        >
          <Menu size={24} />
        </button>
        {topNavOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-52 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl z-50 md:hidden">
            <Link
              href="/dashboard/account"
              onClick={() => setTopNavOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isAccountPage ? 'bg-white/15 text-chrome-text' : 'text-chrome-text/70 hover:text-chrome-text hover:bg-white/10'}`}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-sm font-semibold shrink-0">
                  {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </span>
              )}
              <span className="flex-1">Account</span>
            </Link>
            {topNavItems.map((item) => {
              const isActive = item.href === '/composer'
                ? pathname === '/composer' && searchParams.get('analyze') !== 'reel'
                : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0]));
              const inboxRaw = appData?.notifications?.inbox ?? inboxCount;
              const badge = item.badgeKey === 'inbox' ? inboxRaw : 0;
              const inboxBadgeTitle =
                item.badgeKey === 'inbox' && appData?.notifications
                  ? formatInboxBadgeTitle({
                      inbox: appData.notifications.inbox,
                      messages: appData.notifications.messages,
                      comments: appData.notifications.comments,
                      byPlatform: appData.notifications.byPlatform ?? {},
                    })
                  : badge > 0
                    ? `${badge} unread`
                    : undefined;
              const mobileLinkClass = `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                'comingSoon' in item && item.comingSoon
                  ? 'text-chrome-text/45 cursor-not-allowed select-none'
                  : isActive
                    ? 'bg-white/15 text-chrome-text'
                    : 'text-chrome-text/70 hover:text-chrome-text hover:bg-white/10'
              }`;
              if ('comingSoon' in item && item.comingSoon) {
                return (
                  <span
                    key={item.href}
                    className={mobileLinkClass}
                    aria-disabled="true"
                    title={SMART_LINKS_COMING_SOON_LABEL}
                  >
                    <item.icon size={18} className="shrink-0" />
                    <span className="flex-1">{item.label}</span>
                    {comingSoonBadge}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={topNavHref(item, user?.id)}
                  prefetch={item.href === '/composer'}
                  onClick={() => setTopNavOpen(false)}
                  className={mobileLinkClass}
                  title={item.badgeKey === 'inbox' ? inboxBadgeTitle : undefined}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span
                      title={inboxBadgeTitle}
                      className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-chrome-text text-xs font-bold"
                    >
                      {badge > 99 ? '99' : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
