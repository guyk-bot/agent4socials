'use client';

import { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuthModal } from '@/context/AuthModalContext';

function AuthModalOpenerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { openLogin, openSignup } = useAuthModal();

  useEffect(() => {
    const auth = searchParams.get('auth');
    const reason = searchParams.get('reason');
    const error = searchParams.get('error');
    if (auth === 'login') {
      openLogin();
      const params = new URLSearchParams();
      if (reason) params.set('reason', reason);
      if (error) params.set('error', error);
      router.replace(params.toString() ? `/?${params.toString()}` : '/');
    } else if (auth === 'signup') {
      openSignup();
      router.replace('/');
    }
  }, [searchParams, router, openLogin, openSignup]);

  return null;
}

export default function AuthModalOpener() {
  return (
    <Suspense fallback={null}>
      <AuthModalOpenerInner />
    </Suspense>
  );
}
