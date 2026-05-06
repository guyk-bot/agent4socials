'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('auth', 'signup');
    router.replace(`/?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <>
      <LoadingVideoOverlay loading={true} />
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-[var(--primary)]" />
      </div>
    </>
  );
}
