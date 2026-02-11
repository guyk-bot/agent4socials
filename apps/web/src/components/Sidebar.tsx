'use client';

import React, { useState, useRef, useEffect } from 'react';
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
    ChevronRight,
    ChevronDown,
    Share2,
    Trash2,
    Zap,
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

const TRIAL_DAYS = 7;

function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const { logoUrl, primaryColor } = useWhiteLabel();
    const accent = primaryColor || '#525252';
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const trialStart = user?.createdAt ? new Date(user.createdAt) : null;
    const trialEnd = trialStart ? new Date(trialStart.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000) : null;

    const handleShare = () => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const link = `${origin}/signup${user?.id ? `?ref=${user.id}` : ''}`;
        navigator.clipboard.writeText(link);
        setDropdownOpen(false);
    };

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [dropdownOpen]);

    return (
        <div className="w-64 h-screen bg-white border-r border-neutral-200 flex flex-col fixed left-0 top-0 z-50">
            <div className="p-6">
                <Link href="/dashboard" className="flex items-center space-x-3" style={{ color: accent }}>
                    {logoUrl ? (
                        <img src={logoUrl} alt="Logo" className="h-10 w-10 rounded-lg object-contain" />
                    ) : (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden bg-white/10">
                            <Image src="/logo.svg" alt="Agent4Socials" width={28} height={28} />
                        </div>
                    )}
                    <span className="text-xl font-bold tracking-tight text-neutral-900">Agent4Socials</span>
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
                                    : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
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

            <div className="relative p-4 border-t border-neutral-200" ref={dropdownRef}>
                <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center p-2 rounded-lg hover:bg-neutral-50 transition-colors cursor-pointer group mb-2 text-left"
                >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs border border-neutral-200 shrink-0" style={{ backgroundColor: `${accent}15`, color: accent }}>
                        {user?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                    </div>
                    <div className="ml-3 flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 truncate">{user?.name || 'User'}</p>
                        <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
                    </div>
                    <ChevronDown size={16} className={`text-neutral-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {dropdownOpen && (
                    <div className="absolute bottom-16 left-4 right-4 rounded-xl border border-neutral-200 bg-white shadow-xl py-2 z-50">
                        {trialStart && trialEnd && (
                            <div className="px-4 py-2 border-b border-neutral-100">
                                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Trial</p>
                                <p className="text-sm text-neutral-700">Started {formatDate(trialStart)}</p>
                                <p className="text-sm text-neutral-700">Ends {formatDate(trialEnd)}</p>
                            </div>
                        )}
                        <Link
                            href="/dashboard/settings"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                            <Settings size={18} />
                            Account settings
                        </Link>
                        <Link
                            href="/pricing"
                            onClick={() => setDropdownOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50"
                        >
                            <Zap size={18} />
                            Upgrade to yearly (save 44%)
                        </Link>
                        <button
                            type="button"
                            onClick={handleShare}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-700 hover:bg-neutral-50 text-left"
                        >
                            <Share2 size={18} />
                            Share with a friend
                        </button>
                        <button
                            type="button"
                            onClick={() => setDropdownOpen(false)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 text-left"
                        >
                            <Trash2 size={18} />
                            Cancel subscription
                        </button>
                        <div className="border-t border-neutral-100 mt-1 pt-1">
                            <button
                                onClick={() => { setDropdownOpen(false); logout(); }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-neutral-600 hover:bg-neutral-50 text-left"
                            >
                                <LogOut size={18} />
                                Logout
                            </button>
                        </div>
                    </div>
                )}

                {!dropdownOpen && (
                    <button
                        onClick={logout}
                        className="w-full flex items-center px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 hover:text-red-600 rounded-lg transition-colors"
                    >
                        <LogOut size={20} className="mr-3" />
                        Logout
                    </button>
                )}
            </div>
        </div>
    );
}
