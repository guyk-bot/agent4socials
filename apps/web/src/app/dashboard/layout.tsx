'use client';

import React, { Suspense } from 'react';
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
            <Suspense
              fallback={
                <div className="min-h-[40vh] flex items-center justify-center text-sm text-neutral-500">
                  Loading…
                </div>
              }
            >
              {children}
            </Suspense>
        </AuthenticatedShell>
    );
}
