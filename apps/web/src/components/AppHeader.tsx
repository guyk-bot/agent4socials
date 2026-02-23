'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGrid, MessageCircle, PlusSquare, Calendar, Zap, Menu, PanelLeft, PanelLeftClose } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

export const topNavItems = [
  { icon: LayoutGrid, label: 'Analytics', href: '/dashboard' },
  { icon: MessageCircle, label: 'Inbox', href: '/dashboard/inbox' },
  { icon: PlusSquare, label: 'Composer', href: '/composer' },
  { icon: Zap, label: 'Automation', href: '/dashboard/automation' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
];

type AppHeaderProps = {
  sidebarOpen?: boolean;
  onSidebarToggle?: () => void;
};

export default function AppHeader({ sidebarOpen = true, onSidebarToggle }: AppHeaderProps) {
  const pathname = usePathname();
  const { logoUrl, appName } = useWhiteLabel();
  const [topNavOpen, setTopNavOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!topNavOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setTopNavOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [topNavOpen]);

  return (
    <header className="h-14 flex items-center justify-between px-4 sm:px-6 bg-neutral-900 text-white border-b border-neutral-800 fixed top-0 left-0 right-0 z-40">
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
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 object-contain" />
          ) : (
            <img src="/logo.svg" alt="" className="h-8 w-8 object-contain block" style={{ background: 'transparent', border: 'none' }} />
          )}
          <span className="font-semibold text-white hidden sm:inline truncate">{appName || 'Agent4Socials'}</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {topNavItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Mobile: hamburger on the right, dropdown with only top nav items */}
      <div className="md:hidden relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setTopNavOpen((v) => !v)}
          className="p-2 rounded-lg text-neutral-300 hover:text-white hover:bg-white/10"
          aria-label="Open menu"
          aria-expanded={topNavOpen}
        >
          <Menu size={24} />
        </button>
        {topNavOpen && (
          <div className="absolute right-0 top-full mt-1 py-1 w-52 rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl z-50">
            {topNavItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setTopNavOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-white/15 text-white' : 'text-neutral-300 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <item.icon size={18} className="shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}
