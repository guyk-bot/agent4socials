'use client';

import React, { useState, useCallback } from 'react';
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
            {/* Full-viewport chrome layer on top; pointer-events-none so content gets clicks; header/sidebar have pointer-events-auto so nav works from Inbox */}
            <div className="fixed inset-0 z-[200] pointer-events-none">
                <AppHeader sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
                <Sidebar sidebarOpen={sidebarOpen} onSidebarToggle={onSidebarToggle} />
            </div>
            <div className={`relative z-0 pt-14 transition-[padding] duration-200 ${sidebarOpen ? 'md:pl-64' : 'pl-0'}`}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
                    {children}
                </div>
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
