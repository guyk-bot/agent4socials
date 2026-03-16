'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MessageCircle, PlusSquare, Calendar, Menu, PanelLeft, PanelLeftClose, Link2 } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { useAppData } from '@/context/AppDataContext';
import { useAuth } from '@/context/AuthContext';
import api from '@/lib/api';

export const topNavItems = [
  { icon: MessageCircle, label: 'Inbox', href: '/dashboard/inbox', badgeKey: 'inbox' as const },
  { icon: PlusSquare, label: 'Composer', href: '/composer' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
  { icon: Link2, label: 'Smart Links', href: '/dashboard/smart-links' },
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
  const appData = useAppData();
  const [topNavOpen, setTopNavOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (appData) return;
    api.get<{ inbox?: number }>('/social/notifications').then(() => {
      setInboxCount(0);
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

  const isInboxPage = pathname === '/dashboard/inbox';
  const isAccountPage = pathname === '/dashboard/account';

  const navLinkClass = (active: boolean) =>
    `relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
      active ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'
    }`;

  return (
    <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-neutral-900 text-white border-b border-neutral-800 fixed top-0 left-0 right-0 z-[100]">
      <div className="flex items-center gap-2 md:gap-8 min-w-0">
        {onSidebarToggle && (
          <button
            type="button"
            onClick={onSidebarToggle}
            className="md:hidden p-2 -ml-1 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10"
            aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={22} /> : <PanelLeft size={22} />}
          </button>
        )}
        {isInboxPage ? (
          <a href="/dashboard" className="flex items-center gap-2 shrink-0">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-8 w-8 object-contain" />
            ) : (
              <img src="/logo.svg" alt="" className="h-8 w-8 object-contain block" style={{ background: 'transparent', border: 'none' }} />
            )}
            <span className="font-semibold text-white hidden sm:inline truncate">{appName || 'Agent4Socials'}</span>
          </a>
        ) : (
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain" />
          ) : (
            <img src="/logo.svg" alt="" className="h-8 w-8 object-contain block" style={{ background: 'transparent', border: 'none' }} />
          )}
          <span className="font-semibold text-white hidden sm:inline truncate">{appName || 'Agent4Socials'}</span>
        </Link>
        )}
        <nav className="hidden md:flex items-center gap-1">
          {topNavItems.map((item) => {
            const isActive = item.href === '/composer'
              ? pathname === '/composer' && searchParams.get('analyze') !== 'reel'
              : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0]));
            const inboxRaw = appData?.notifications?.inbox ?? inboxCount;
            const badge = item.badgeKey === 'inbox' ? inboxRaw : 0;
            const content = (
              <>
                <item.icon size={18} />
                {item.label}
                {badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                    {badge > 99 ? '99' : badge}
                  </span>
                )}
              </>
            );
            return isInboxPage ? (
              <a key={item.href} href={item.href} className={navLinkClass(isActive)}>
                {content}
              </a>
            ) : (
              <Link key={item.href} href={item.href} className={navLinkClass(isActive)}>
                {content}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Profile/account (top right) + mobile menu */}
      <div className="flex items-center gap-1 relative" ref={dropdownRef}>
        {isInboxPage ? (
          <a
            href="/dashboard/account"
            className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden border-2 border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-500 hover:bg-white/10 transition-colors shrink-0"
            title="Account"
            aria-label="Account"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-sm font-semibold">
                {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
              </span>
            )}
          </a>
        ) : (
        <Link
          href="/dashboard/account"
          className="flex items-center justify-center w-9 h-9 rounded-full overflow-hidden border-2 border-neutral-600 text-neutral-300 hover:text-white hover:border-neutral-500 hover:bg-white/10 transition-colors shrink-0"
          title="Account"
          aria-label="Account"
        >
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm font-semibold">
              {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
            </span>
          )}
        </Link>
        )}
        <button
          type="button"
          onClick={() => setTopNavOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10"
          aria-label="Open menu"
          aria-expanded={topNavOpen}
        >
          <Menu size={24} />
        </button>
        {topNavOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-52 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl z-50 md:hidden">
            {isInboxPage ? (
              <a
                href="/dashboard/account"
                onClick={() => setTopNavOpen(false)}
                className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isAccountPage ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'}`}
              >
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-neutral-600 flex items-center justify-center text-sm font-semibold shrink-0">
                    {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                  </span>
                )}
                <span className="flex-1">Account</span>
              </a>
            ) : (
            <Link
              href="/dashboard/account"
              onClick={() => setTopNavOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${isAccountPage ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'}`}
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
            )}
            {topNavItems.map((item) => {
              const isActive = item.href === '/composer'
                ? pathname === '/composer' && searchParams.get('analyze') !== 'reel'
                : pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href.split('?')[0]));
              const inboxRaw = appData?.notifications?.inbox ?? inboxCount;
              const badge = item.badgeKey === 'inbox' ? inboxRaw : 0;
              const mobileLinkClass = `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'
              }`;
              return isInboxPage ? (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setTopNavOpen(false)}
                  className={mobileLinkClass}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
                      {badge > 99 ? '99' : badge}
                    </span>
                  )}
                </a>
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setTopNavOpen(false)}
                  className={mobileLinkClass}
                >
                  <item.icon size={18} className="shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {badge > 0 && (
                    <span className="min-w-[1.25rem] h-5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-xs font-bold">
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
