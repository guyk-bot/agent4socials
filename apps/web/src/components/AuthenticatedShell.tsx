'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

function AuthenticatedContent({
    sidebarOpen,
    onSidebarToggle,
    children,
}: {
    sidebarOpen: boolean;
    onSidebarToggle: () => void;
    children: React.ReactNode;
}) {
    const { backgroundColor, primaryColor, textColor } = useWhiteLabel();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const chromeStyle: React.CSSProperties = {
        color: textColor || undefined,
        ['--wl-primary' as string]: primaryColor || undefined,
        ['--primary' as string]: primaryColor || undefined,
        ['--wl-text' as string]: textColor || undefined,
        ['--wl-sidebar-bg' as string]: backgroundColor || '#f5f5f5',
    };

    const CHROME_Z = 2147483646;
    const chromePortal = mounted && typeof document !== 'undefined' ? createPortal(
        <>
            <div
                className="fixed top-0 left-0 right-0 h-14"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="header"
            >
                <AppHeader sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
            </div>
            <div
                className="fixed left-0 top-14 bottom-0 w-64"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="sidebar"
            >
                <Sidebar sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
            </div>
        </>,
        document.body
    ) : null;

    const chromeInTree = (
        <>
            <div
                className="fixed top-0 left-0 right-0 h-14"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="header"
            >
                <AppHeader sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
            </div>
            <div
                className="fixed left-0 top-14 bottom-0 w-64"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="sidebar"
            >
                <Sidebar sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
            </div>
        </>
    );

    return (
        <div
            className="min-h-screen bg-neutral-100"
            style={{
                backgroundColor: backgroundColor || undefined,
                color: textColor || undefined,
                ['--wl-primary' as string]: primaryColor || undefined,
                ['--primary' as string]: primaryColor || undefined,
                ['--wl-text' as string]: textColor || undefined,
                ['--wl-sidebar-bg' as string]: backgroundColor || '#f5f5f5',
            }}
        >
            <div className={`pt-14 transition-[padding] duration-200 ${sidebarOpen ? 'md:pl-64' : 'pl-0'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
                    {children}
                </div>
            </div>
            {mounted ? chromePortal : chromeInTree}
        </div>
    );
}

export default function AuthenticatedShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

    React.useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <>
                <LoadingVideoOverlay loading={true} />
                <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-100">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
                    <p className="text-sm text-neutral-500">Loading…</p>
                </div>
            </>
        );
    }

    if (!user) return null;

    return (
        <AuthenticatedContent sidebarOpen={sidebarOpen} onSidebarToggle={toggleSidebar}>
            {children}
        </AuthenticatedContent>
    );
}
