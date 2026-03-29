'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import LoadingVideoOverlay from '@/components/LoadingVideoOverlay';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/?auth=signup');
  }, [router]);

  return (
    <>
      <LoadingVideoOverlay loading={true} />
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-slate-600 border-t-[var(--primary)]" />
      </div>
    </>
  );
}
