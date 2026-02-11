'use client';

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');

  useEffect(() => {
    const q = reason ? `auth=login&reason=${encodeURIComponent(reason)}` : 'auth=login';
    router.replace(`/?${q}`);
  }, [router, reason]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-emerald-500" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-emerald-500" />
      </div>
    }>
      <LoginRedirect />
    </Suspense>
  );
}
