'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageCircle, PlusSquare, Calendar, Menu, Sun, Moon, Brain } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { BRAND_NAME, BRAND_HEADER_BG, normalizeLegacyBrandName, siteLogoSrcForTheme } from '@/lib/site-brand-assets';
import { useTheme } from '@/context/ThemeContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { formatInboxBadgeTitle } from '@/lib/inbox/unread-count';
import { readLastActiveChatId } from '@/lib/ai/aysop-chat-local-cache';

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
  { icon: Brain, label: `${BRAND_NAME} AI`, href: '/dashboard/aysop-ai' },
];

export default function AppHeader() {
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

  const navLinkClass = (active: boolean, isAysopAi = false) =>
    `relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
      active
        ? `bg-[var(--bg-hover)] text-[var(--foreground)]${isAysopAi ? ' nav-aysop-ai-active' : ''}`
        : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]'
    }`;

  return (
    <header
      className={`h-full w-full flex items-center justify-between px-4 sm:px-6 text-[var(--foreground)] border-b border-[var(--border)] pointer-events-auto ${logoUrl ? 'bg-[var(--bg-surface)]' : ''}`}
      style={logoUrl ? undefined : { backgroundColor: BRAND_HEADER_BG }}
    >
      <div className="flex items-center gap-2 md:gap-8 min-w-0">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-7 w-7 sm:h-8 sm:w-8 object-contain" />
          ) : (
            <img src={siteLogoSrcForTheme(theme)} alt={BRAND_NAME} className="h-7 w-7 sm:h-8 sm:w-8 object-contain block bg-transparent" />
          )}
          <span className="font-semibold text-[var(--foreground)] hidden sm:inline truncate">{displayAppName}</span>
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
            const isAysopAi = item.href.startsWith('/dashboard/aysop-ai');
            const content = (
              <>
                <item.icon size={18} />
                {item.label}
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
            return (
              <Link
                key={item.href}
                href={topNavHref(item, user?.id)}
                prefetch={item.href === '/composer'}
                className={navLinkClass(isActive, isAysopAi)}
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
          className="p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)] transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <Link
          href="/dashboard/account"
          className="flex items-stretch w-9 h-9 rounded-full overflow-hidden border-2 border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--color-purple)] hover:bg-[var(--bg-hover)] transition-colors shrink-0"
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
          className="md:hidden p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]"
          aria-label="Open menu"
          aria-expanded={topNavOpen}
        >
          <Menu size={24} />
        </button>
        {topNavOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-52 rounded-lg bg-[var(--card-bg)] border border-[var(--border)] shadow-xl z-50 md:hidden">
            <Link
              href="/dashboard/account"
              onClick={() => setTopNavOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isAccountPage ? 'bg-[var(--bg-hover)] text-[var(--foreground)]' : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]'}`}
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
              const isAysopAi = item.href.startsWith('/dashboard/aysop-ai');
              const mobileLinkClass =
                isActive
                  ? `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors bg-[var(--bg-hover)] text-[var(--foreground)]${isAysopAi ? ' nav-aysop-ai-active' : ''}`
                  : 'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]';
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
