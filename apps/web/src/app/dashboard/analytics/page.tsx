'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Analytics was a duplicate of the main dashboard. Redirect to dashboard
 * so all analytics (account + posts + charts) live in one place.
 */
export default function AnalyticsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <p className="text-neutral-500 text-sm">Redirecting to dashboard…</p>
    </div>
  );
}
