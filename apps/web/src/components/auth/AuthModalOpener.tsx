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
    if (auth === 'login') {
      openLogin();
      router.replace(reason ? `/?reason=${reason}` : '/');
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
