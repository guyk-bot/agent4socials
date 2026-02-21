'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutGrid, MessageCircle, PlusSquare, Calendar, Zap } from 'lucide-react';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

const topNavItems = [
  { icon: LayoutGrid, label: 'Analytics', href: '/dashboard' },
  { icon: MessageCircle, label: 'Inbox', href: '/dashboard/inbox' },
  { icon: PlusSquare, label: 'Composer', href: '/composer' },
  { icon: Zap, label: 'Automation', href: '/dashboard/automation' },
  { icon: Calendar, label: 'Calendar', href: '/calendar' },
];

export default function AppHeader() {
  const pathname = usePathname();
  const { logoUrl, appName } = useWhiteLabel();

  return (
    <header className="h-14 flex items-center justify-between px-6 bg-neutral-900 text-white border-b border-neutral-800 fixed top-0 left-0 right-0 z-40">
      <div className="flex items-center gap-8">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />
          ) : (
            <Image src="/logo.svg" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          )}
          <span className="font-semibold text-white hidden sm:inline">{appName || 'Agent4Socials'}</span>
        </Link>
        <nav className="flex items-center gap-1">
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
    </header>
  );
}
