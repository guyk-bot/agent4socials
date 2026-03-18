'use client';

import React, { useState, useCallback, Suspense } from 'react';
import AppHeader from '@/components/AppHeader';
import Sidebar from '@/components/Sidebar';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

const CHROME_Z = 9999;

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

    const chromeStyle: React.CSSProperties = {
        color: textColor || undefined,
        ['--wl-primary' as string]: primaryColor || undefined,
        ['--primary' as string]: primaryColor || undefined,
        ['--wl-text' as string]: textColor || undefined,
        ['--wl-sidebar-bg' as string]: backgroundColor || '#f5f5f5',
        pointerEvents: 'auto',
    };

    return (
        <div
            className="min-h-screen bg-neutral-100"
            style={{
                backgroundColor: backgroundColor || 'var(--background)',
                color: textColor || undefined,
                ['--wl-primary' as string]: primaryColor || undefined,
                ['--primary' as string]: primaryColor || undefined,
                ['--wl-text' as string]: textColor || undefined,
                ['--wl-sidebar-bg' as string]: backgroundColor || '#f5f5f5',
            }}
        >
            {/* Main content: low stacking order so chrome can sit on top */}
            <div
                className={`pt-14 transition-[padding] duration-200 ${sidebarOpen ? 'md:pl-64' : 'pl-0'}`}
                style={{ position: 'relative', zIndex: 0 }}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
                    {children}
                </div>
            </div>
            {/* Header and sidebar: fixed, rendered after content so they stack on top and stay clickable */}
            <div
                className="fixed top-0 left-0 right-0 h-14"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="header"
            >
                <Suspense fallback={<div className="h-14 bg-[var(--dark)]" />}>
                    <AppHeader sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
                </Suspense>
            </div>
            <div
                className="fixed left-0 top-14 bottom-0 w-64"
                style={{ ...chromeStyle, zIndex: CHROME_Z }}
                data-chrome="sidebar"
            >
                <Sidebar sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
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
