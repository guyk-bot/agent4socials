'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AccountsPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);
  return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-neutral-500">Redirecting to dashboard…</p>
    </div>
  );
}
