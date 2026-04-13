'use client';

import React, { Suspense } from 'react';
import AuthenticatedShell from '@/components/AuthenticatedShell';

function ComposerRouteFallback() {
    return (
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4">
            <p className="text-sm font-medium text-neutral-600">Loading composer…</p>
            <p className="text-xs text-neutral-400">Preparing your workspace</p>
        </div>
    );
}

export default function ComposerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <AuthenticatedShell>
            <Suspense fallback={<ComposerRouteFallback />}>{children}</Suspense>
        </AuthenticatedShell>
    );
}
