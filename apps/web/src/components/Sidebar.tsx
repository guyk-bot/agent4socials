'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
    LayoutGrid,
    PlusSquare,
    Calendar,
    Users,
    History,
    Settings,
    LogOut,
    ChevronRight
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

const menuItems = [
    { icon: LayoutGrid, label: 'Dashboard', href: '/dashboard' },
    { icon: PlusSquare, label: 'Composer', href: '/composer' },
    { icon: Calendar, label: 'Calendar', href: '/calendar' },
    { icon: Users, label: 'Accounts', href: '/accounts' },
    { icon: History, label: 'History', href: '/posts' },
    { icon: Settings, label: 'Settings', href: '/dashboard/settings' },
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { logoUrl, primaryColor } = useWhiteLabel();
    const accent = primaryColor || '#10b981';

    return (
        <div className="w-64 h-screen bg-slate-900/50 border-r border-slate-700 flex flex-col fixed left-0 top-0 z-50">
            <div className="p-6">
                <Link href="/dashboard" className="flex items-center space-x-3" style={{ color: accent }}>
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
                    ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white/10">
                            <Image src="/logo.svg" alt="Agent4Socials" width={28} height={28} />
                        </div>
                    )}
                    <span className="text-xl font-bold tracking-tight text-white">Agent4Socials</span>
                </Link>
            </div>

            <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
                {menuItems.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isActive
                                    ? 'shadow-sm'
                                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                            style={isActive ? { backgroundColor: `${accent}15`, color: accent } : undefined}
                        >
                            <div className="flex items-center">
                                <item.icon size={20} className="mr-3" />
                                {item.label}
                            </div>
                            {isActive && <ChevronRight size={14} />}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 border-t border-slate-700">
                <div className="flex items-center p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer group mb-2">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border" style={{ backgroundColor: `${accent}20`, color: accent, borderColor: `${accent}40` }}>
                        {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.name || 'User'}</p>
                        <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                    </div>
                </div>

                <button
                    onClick={logout}
                    className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                    <LogOut size={20} className="mr-3" />
                    Logout
                </button>
            </div>
        </div>
    );
}
