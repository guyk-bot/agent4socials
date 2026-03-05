'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const PROFILE_FETCH_TIMEOUT_MS = 12_000;
const FALLBACK_TIMEOUT_MS = 15_000;

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
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const redirectToDashboard = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      window.location.href = '/dashboard';
    };

    // Safety: if we're still on this page after FALLBACK_TIMEOUT_MS, redirect if session exists
    const fallbackTimer = setTimeout(() => {
      if (cancelled || doneRef.current) return;
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (cancelled || doneRef.current) return;
        if (session) redirectToDashboard();
        else setError('Sign-in is taking too long. Try again or go to the dashboard.');
      });
    }, FALLBACK_TIMEOUT_MS);

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
          // Load profile with timeout so we don't hang if API is slow/down
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), PROFILE_FETCH_TIMEOUT_MS);
          let profileRes: Response;
          try {
            profileRes = await fetch('/api/auth/profile', {
              headers: { Authorization: `Bearer ${params.access_token}` },
              signal: controller.signal,
            });
          } catch (fetchErr) {
            clearTimeout(timeoutId);
            if (cancelled) return;
            // Timeout or network error: session is set, redirect so user can use the app
            if ((fetchErr as Error)?.name === 'AbortError' || /abort|aborted/i.test((fetchErr as Error)?.message ?? '')) {
              redirectToDashboard();
              return;
            }
            setError('Could not load profile. Try again.');
            return;
          }
          clearTimeout(timeoutId);
          if (cancelled) return;
          if (!profileRes.ok) {
            setError('Could not load profile. Try again.');
            return;
          }
          redirectToDashboard();
          return;
        }

        if (params.error_description) {
          setError(params.error_description);
          return;
        }

        // No token in hash: maybe fragment was stripped or page opened without it. Check for existing session (or brief delay for redirect with hash).
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
        // Give a moment for hash to be available (e.g. client-side redirect from / with hash)
        await new Promise((r) => setTimeout(r, 800));
        if (cancelled) return;
        const hash2 = typeof window !== 'undefined' ? window.location.hash : '';
        const params2 = parseHashParams(hash2);
        if (params2.access_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: params2.access_token,
            refresh_token: params2.refresh_token || '',
          });
          if (!cancelled && !setErr) {
            const controller2 = new AbortController();
            const t2 = setTimeout(() => controller2.abort(), PROFILE_FETCH_TIMEOUT_MS);
            try {
              const profileRes = await fetch('/api/auth/profile', {
                headers: { Authorization: `Bearer ${params2.access_token}` },
                signal: controller2.signal,
              });
              clearTimeout(t2);
              if (profileRes.ok) redirectToDashboard();
              else setError('Could not load profile. Try again.');
            } catch (fetchErr) {
              clearTimeout(t2);
              if ((fetchErr as Error)?.name === 'AbortError' || /abort|aborted/i.test((fetchErr as Error)?.message ?? ''))
                redirectToDashboard();
              else setError('Could not load profile. Try again.');
            }
          } else if (!cancelled && setErr) setError(setErr.message);
          return;
        }
        const { data: { session: session2 } } = await supabase.auth.getSession();
        if (session2) {
          router.replace('/dashboard');
          return;
        }
        setError('Sign-in link may have expired or the session was lost. Try signing in again.');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Something went wrong';
        // Navigation or unmount can abort in-flight fetch; session may still be valid
        if (/abort|aborted/i.test(msg)) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) redirectToDashboard();
          else setError('Sign-in was interrupted. Please try again or go to the dashboard.');
        } else {
          setError(msg);
        }
      }
    }

    handleCallback();
    return () => {
      cancelled = true;
      clearTimeout(fallbackTimer);
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50 max-w-md text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <div className="flex flex-col gap-2">
          <a href="/dashboard" className="text-indigo-600 hover:underline">Go to dashboard</a>
          <a href="/" className="text-indigo-600 hover:underline">Back to home</a>
        </div>
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
