'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy URL: connected accounts now live under `/dashboard/account#connected-accounts`. */
export default function AccountsLegacyRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/dashboard/account#connected-accounts');
  }, [router]);
  return (
    <div className="p-8 text-sm text-neutral-500">Redirecting to Account…</div>
  );
}
