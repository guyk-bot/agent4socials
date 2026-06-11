'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageCircle, PlusSquare, Calendar, Menu, Sun, Moon, Brain, Megaphone, type LucideIcon } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { BRAND_NAME, BRAND_HEADER_BG, normalizeLegacyBrandName, siteLogoSrcForAppHeader } from '@/lib/site-brand-assets';
import { useTheme } from '@/context/ThemeContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';
import { formatInboxBadgeTitle } from '@/lib/inbox/unread-count';

function topNavHref(item: (typeof topNavItems)[number]): string {
  return item.href;
}

type TopNavItem = {
  icon: LucideIcon;
  label: string;
  href: string;
  badgeKey?: 'inbox';
  /** Small line above the label (e.g. Ads → Coming soon / Ads). */
  stackedTop?: string;
};

export const topNavItems: TopNavItem[] = [
  { icon: MessageCircle, label: 'Inbox', href: '/dashboard/inbox', badgeKey: 'inbox' },
  { icon: PlusSquare, label: 'Composer', href: '/composer' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
  { icon: Megaphone, label: 'Ads', href: '/dashboard/ads', stackedTop: 'Coming soon' },
  { icon: Brain, label: `${BRAND_NAME} AI`, href: '/dashboard/aysop-ai' },
];

function TopNavItemContent({ item, badge, inboxBadgeTitle }: { item: TopNavItem; badge: number; inboxBadgeTitle?: string }) {
  if (item.stackedTop) {
    return (
      <>
        <span className="relative inline-flex items-center gap-2">
          <span className="absolute -top-[11px] left-0 text-[9px] font-semibold uppercase tracking-wide text-amber-400 whitespace-nowrap leading-none pointer-events-none">
            {item.stackedTop}
          </span>
          <item.icon size={18} className="shrink-0" aria-hidden />
          <span>{item.label}</span>
        </span>
        {badge > 0 ? (
          <span
            title={inboxBadgeTitle}
            className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
          >
            {badge > 99 ? '99' : badge}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <>
      <item.icon size={18} />
      {item.label}
      {badge > 0 && (
        <span
          title={inboxBadgeTitle}
          className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
        >
          {badge > 99 ? '99' : badge}
        </span>
      )}
    </>
  );
}

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

  const isOfficialBrandHeader = !logoUrl;

  const navLinkClass = (active: boolean) => {
    if (isOfficialBrandHeader) {
      return `brand-app-header__nav-link relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
        active ? 'is-active' : ''
      }`;
    }
    return `relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-0 ${
      active
        ? 'bg-[var(--bg-hover)] text-[var(--foreground)]'
        : 'text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]'
    }`;
  };

  const mobileNavLinkClass = (active: boolean) => {
    if (isOfficialBrandHeader) {
      return `brand-app-header__mobile-link flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
        active ? 'is-active' : ''
      }`;
    }
    return active
      ? 'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors bg-[var(--bg-hover)] text-[var(--foreground)]'
      : 'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)]';
  };

  const iconBtnClass = isOfficialBrandHeader
    ? 'brand-app-header__icon-btn p-2 rounded-lg transition-colors'
    : 'p-2 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--bg-hover)] transition-colors';

  return (
    <header
      className={`h-full w-full flex items-center justify-between px-4 sm:px-6 border-b pointer-events-auto ${
        isOfficialBrandHeader
          ? 'brand-app-header'
          : 'bg-[var(--bg-surface)] text-[var(--foreground)] border-[var(--border)]'
      }`}
      style={isOfficialBrandHeader ? undefined : logoUrl ? undefined : { backgroundColor: BRAND_HEADER_BG }}
    >
      <div className="flex items-center gap-2 md:gap-8 min-w-0">
        <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" />
          ) : (
            <img src={siteLogoSrcForAppHeader(theme, isOfficialBrandHeader)} alt={BRAND_NAME} className="h-6 w-6 sm:h-7 sm:w-7 object-contain block" />
          )}
          <span
            className={`font-semibold hidden sm:inline truncate text-sm sm:text-base ${
              isOfficialBrandHeader ? 'brand-app-header__wordmark' : 'text-[var(--foreground)]'
            }`}
          >
            {displayAppName}
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-1 overflow-visible">
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
              <TopNavItemContent item={item} badge={badge} inboxBadgeTitle={inboxBadgeTitle} />
            );
            return (
              <Link
                key={item.href}
                href={topNavHref(item)}
                prefetch={item.href === '/composer'}
                className={`${navLinkClass(isActive)}${item.stackedTop ? ' overflow-visible' : ''}`}
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
          className={iconBtnClass}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
        <Link
          href="/dashboard/account"
          className={`flex items-stretch w-9 h-9 rounded-full overflow-hidden border-2 transition-colors shrink-0 ${
            isOfficialBrandHeader
              ? 'border-[#333] text-[#a3a3a3] hover:text-white hover:border-[var(--color-purple)] hover:bg-[#1a1a1a]'
              : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--color-purple)] hover:bg-[var(--bg-hover)]'
          }`}
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
          className={`md:hidden ${iconBtnClass}`}
          aria-label="Open menu"
          aria-expanded={topNavOpen}
        >
          <Menu size={24} />
        </button>
        {topNavOpen && (
          <div
            className={`absolute right-0 top-full mt-1 py-1 w-52 rounded-lg shadow-xl z-50 md:hidden border ${
              isOfficialBrandHeader
                ? 'brand-app-header__mobile-menu'
                : 'bg-[var(--card-bg)] border-[var(--border)]'
            }`}
          >
            <Link
              href="/dashboard/account"
              onClick={() => setTopNavOpen(false)}
              className={mobileNavLinkClass(isAccountPage)}
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
              return (
                <Link
                  key={item.href}
                  href={topNavHref(item)}
                  prefetch={item.href === '/composer'}
                  onClick={() => setTopNavOpen(false)}
                  className={mobileNavLinkClass(isActive)}
                  title={item.badgeKey === 'inbox' ? inboxBadgeTitle : undefined}
                >
                  {item.stackedTop ? (
                    <>
                      <item.icon size={18} className="shrink-0" aria-hidden />
                      <span className="flex flex-1 flex-col leading-none gap-0.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">{item.stackedTop}</span>
                        <span>{item.label}</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <item.icon size={18} className="shrink-0" />
                      <span className="flex-1">{item.label}</span>
                    </>
                  )}
                  {badge > 0 && (
                    <span
                      title={inboxBadgeTitle}
                      className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold"
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
