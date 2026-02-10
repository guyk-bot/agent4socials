'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function parseHashParams(hash: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (!hash || !hash.startsWith('#')) return params;
  const search = hash.slice(1);
  for (const part of search.split('&')) {
    const [key, value] = part.split('=');
    if (key && value) params[key] = decodeURIComponent(value);
  }
  return params;
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function handleCallback() {
      try {
        const hash = typeof window !== 'undefined' ? window.location.hash : '';
        const params = parseHashParams(hash);

        if (params.access_token) {
          const { error: setErrorResult } = await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token || '',
          });
          if (cancelled) return;
          if (setErrorResult) {
            setError(setErrorResult.message);
            return;
          }
          router.replace('/dashboard');
          return;
        }

        if (params.error_description) {
          setError(params.error_description);
          return;
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        if (session) {
          router.replace('/dashboard');
          return;
        }

        router.replace('/login');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50">
        <p className="text-red-600">{error}</p>
        <a href="/login" className="text-indigo-600 hover:underline">Back to login</a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      <p className="text-gray-600">Signing you in…</p>
    </div>
  );
}
