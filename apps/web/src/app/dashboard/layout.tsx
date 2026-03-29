'use client';

import React from 'react';
import AuthenticatedShell from '@/components/AuthenticatedShell';
import ProfileSyncBanner from '@/components/ProfileSyncBanner';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthenticatedShell>
            <ProfileSyncBanner />
            {children}
        </AuthenticatedShell>
    );
}
