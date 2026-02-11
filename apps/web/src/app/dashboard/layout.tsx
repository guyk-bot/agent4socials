'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
import ProfileSyncBanner from '@/components/ProfileSyncBanner';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useWhiteLabel } from '@/context/WhiteLabelContext';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const { backgroundColor, primaryColor, textColor } = useWhiteLabel();

    React.useEffect(() => {
        if (!loading && !user) {
            router.push('/');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-neutral-100">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
                <p className="text-sm text-neutral-500">Loading…</p>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div
            className="min-h-screen bg-neutral-100"
            style={{
                backgroundColor: backgroundColor || undefined,
                color: textColor || undefined,
                ['--wl-primary' as string]: primaryColor || undefined,
                ['--primary' as string]: primaryColor || undefined,
                ['--wl-text' as string]: textColor || undefined,
                ['--wl-sidebar-bg' as string]: backgroundColor || '#ffffff',
            }}
        >
            <Sidebar />
            <main className="pl-64 min-h-screen">
                <div className="max-w-7xl mx-auto p-8">
                    <ProfileSyncBanner />
                    {children}
                </div>
            </main>
        </div>
    );
}
