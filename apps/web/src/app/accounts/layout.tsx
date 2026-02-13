'use client';

import React from 'react';
import AuthenticatedShell from '@/components/AuthenticatedShell';

export default function AccountsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
