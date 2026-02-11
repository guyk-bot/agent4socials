'use client';

import React from 'react';
import Sidebar from '@/components/Sidebar';
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
    const { backgroundColor, primaryColor } = useWhiteLabel();

    React.useEffect(() => {
        if (!loading && !user) {
            router.push('/login?reason=profile_failed');
        }
    }, [user, loading, router]);

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
                <p className="text-sm text-slate-400">Loading…</p>
            </div>
        );
    }

    if (!user) return null;

    return (
        <div
            className="min-h-screen"
            data-theme="dark"
            style={{
                backgroundColor: backgroundColor || undefined,
                ['--wl-primary' as string]: primaryColor || undefined,
                ['--primary' as string]: primaryColor || undefined,
                ['--primary-hover' as string]: primaryColor ? `${primaryColor}dd` : undefined,
            }}
        >
            <Sidebar />
            <main className="pl-64 min-h-screen">
                <div className="max-w-7xl mx-auto p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
