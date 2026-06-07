'use client';

import React, { useState, useCallback, Suspense } from 'react';
import { usePathname } from 'next/navigation';
import { PanelLeft } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useWhiteLabel } from '@/context/WhiteLabelContext';
import { useTheme } from '@/context/ThemeContext';

/** Above in-page overlays (e.g. z-300 loaders); below portaled modals (8.5k+). */
const CHROME_Z = 8000;

function AuthenticatedContent({
    sidebarOpen,
    onSidebarToggle,
    children,
}: {
    sidebarOpen: boolean;
    onSidebarToggle: () => void;
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const isAysopAiPage = pathname?.startsWith('/dashboard/aysop-ai');
    const { backgroundColor, primaryColor, textColor } = useWhiteLabel();
    const { theme } = useTheme();
    const usingDefaultWhiteLabelBg = !backgroundColor || backgroundColor.toLowerCase() === '#f5f5f5';
    const usingDefaultWhiteLabelText = !textColor || textColor.toLowerCase() === '#171717';
    const resolvedBackground = theme === 'dark' && usingDefaultWhiteLabelBg ? 'var(--background)' : (backgroundColor || 'var(--background)');
    const resolvedText = theme === 'dark' && usingDefaultWhiteLabelText ? 'var(--foreground)' : (textColor || undefined);

    const chromeStyle: React.CSSProperties = {
        color: resolvedText,
        ['--wl-primary' as string]: primaryColor || undefined,
        ['--primary' as string]: primaryColor || undefined,
        ['--wl-text' as string]: resolvedText,
        ['--wl-sidebar-bg' as string]: resolvedBackground,
        pointerEvents: 'auto',
    };

    return (
        <div
            className="min-h-screen bg-[var(--background)]"
            style={{
                backgroundColor: resolvedBackground,
                color: resolvedText,
                ['--wl-primary' as string]: primaryColor || undefined,
                ['--primary' as string]: primaryColor || undefined,
                ['--wl-text' as string]: resolvedText,
                ['--wl-sidebar-bg' as string]: resolvedBackground,
            }}
        >
            {/* Main content sits below the fixed chrome (chrome is rendered in fixed wrappers above) */}
            <div
                className={`pt-14 transition-[padding] duration-200 ${sidebarOpen ? 'md:pl-64' : 'md:pl-0'}`}
            >
                <div
                    className={
                        isAysopAiPage
                            ? 'h-[calc(100vh-3.5rem)] min-h-0'
                            : 'max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8'
                    }
                >
                    {children}
                </div>
            </div>
            {/* Header wrapper: fixed at top, fills full width, high z-index so it is always clickable */}
            <div
                className="fixed top-0 left-0 right-0 h-14 flex"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="header"
            >
                <Suspense fallback={<div className="h-14 w-full bg-[var(--bg-surface)]" />}>
                    <AppHeader />
                </Suspense>
            </div>
            {!sidebarOpen ? (
                <button
                    type="button"
                    onClick={onSidebarToggle}
                    className="fixed left-3 top-[3.75rem] rounded-lg border border-neutral-200 bg-white p-2 text-neutral-600 shadow-sm hover:bg-neutral-50 hover:text-neutral-900 transition-colors dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                    style={{ zIndex: CHROME_Z }}
                    aria-label="Open sidebar"
                    title="Open sidebar"
                >
                    <PanelLeft size={20} />
                </button>
            ) : null}
            {/* Sidebar wrapper: fixed on the left, fills height below header, high z-index.
                Visibility mirrors sidebarOpen (hidden on mobile when closed, always visible on md+). */}
            <div
                className={`${sidebarOpen ? 'flex' : 'hidden'} fixed left-0 top-14 bottom-0 w-64 flex-col transition-transform duration-200`}
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="sidebar"
            >
                <Sidebar onSidebarToggle={onSidebarToggle} />
            </div>
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

    if (!loading && !user) return null;

    return (
        <AuthenticatedContent sidebarOpen={sidebarOpen} onSidebarToggle={toggleSidebar}>
            {loading ? (
                <LoadingVideoOverlay loading={true} />
            ) : (
                <>
                    {children}
                </>
            )}
        </AuthenticatedContent>
    );
}
