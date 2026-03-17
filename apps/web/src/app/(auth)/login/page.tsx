'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

function LoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const error = searchParams.get('error');

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('auth', 'login');
    if (reason) params.set('reason', reason);
    if (error) params.set('error', error);
    router.replace(`/?${params.toString()}`);
  }, [router, reason, error]);

  return (
    <>
      <LoadingVideoOverlay loading={true} />
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-[var(--primary)]" />
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <>
        <LoadingVideoOverlay loading={true} />
        <div className="min-h-screen flex items-center justify-center bg-slate-950">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-[var(--primary)]" />
        </div>
      </>
    }>
      <LoginRedirect />
    </Suspense>
  );
}
