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
            const msg = setErrorResult.message;
            if (msg?.toLowerCase().includes('invalid api key')) {
              setError(
                'Invalid API key: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel (Project → Settings → Environment Variables) for this app.'
              );
            } else {
              setError(msg);
            }
            return;
          }
          // Load profile before navigating (avoids AbortError from nav cancelling fetch)
          const profileRes = await fetch('/api/auth/profile', {
            headers: { Authorization: `Bearer ${params.access_token}` },
          });
          if (cancelled) return;
          if (!profileRes.ok) {
            setError('Could not load profile. Try again.');
            return;
          }
          window.location.href = '/dashboard';
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

        router.replace('/');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong');
      }
    }

    handleCallback();
    return () => { cancelled = true; };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50 max-w-md text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <a href="/" className="text-indigo-600 hover:underline">Back to home</a>
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
