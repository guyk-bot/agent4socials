'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const FALLBACK_TIMEOUT_MS = 15_000;
const SHOW_ESCAPE_MS = 5_000;

function parseFragmentParams(fragment: string): Record<string, string> {
  const params: Record<string, string> = {};
  const search = fragment.startsWith('#') ? fragment.slice(1) : fragment.startsWith('?') ? fragment.slice(1) : fragment;
  if (!search) return params;
  for (const part of search.split('&')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = decodeURIComponent(part.slice(0, eq));
    const value = decodeURIComponent(part.slice(eq + 1));
    if (key && value !== undefined) params[key] = value;
  }
  return params;
}

/** Get OAuth params from hash (preferred) or query string (fallback if redirect stripped hash). */
function getCallbackParams(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const hash = window.location.hash;
  const search = window.location.search;
  const fromHash = parseFragmentParams(hash);
  if (fromHash.access_token) return fromHash;
  return parseFragmentParams(search);
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showEscape, setShowEscape] = useState(false);
  const [escaping, setEscaping] = useState(false);
  const doneRef = useRef(false);

  const goToDashboardWithToken = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (doneRef.current || escaping) return;
    const params = getCallbackParams();
    if (!params.access_token) {
      window.location.href = '/dashboard';
      return;
    }
    setEscaping(true);
    try {
      const { error: err } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token || '',
      });
      if (!err) {
        doneRef.current = true;
        window.location.href = '/dashboard';
      } else {
        setError(err.message);
        setEscaping(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to set session');
      setEscaping(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const escapeTimer = setTimeout(() => setShowEscape(true), SHOW_ESCAPE_MS);

    const redirectToDashboard = () => {
      if (doneRef.current) return;
      doneRef.current = true;
      window.location.href = '/dashboard';
    };

    // Safety: if still on this page after FALLBACK_TIMEOUT_MS, redirect if session exists
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
        const params = getCallbackParams();

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
          // Redirect immediately; dashboard will load profile. Avoids hanging on slow profile API.
          redirectToDashboard();
          return;
        }

        if (params.error_description) {
          setError(params.error_description);
          return;
        }

        // No token in hash/query: maybe fragment was stripped or page opened without it. Check for existing session (or brief delay for redirect with hash).
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
        const params2 = getCallbackParams();
        if (params2.access_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token: params2.access_token,
            refresh_token: params2.refresh_token || '',
          });
          if (!cancelled && !setErr) {
            redirectToDashboard();
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
      clearTimeout(escapeTimer);
    };
  }, [router]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50 max-w-md text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={goToDashboardWithToken} className="text-indigo-600 hover:underline">
            Set session and go to dashboard
          </button>
          <a href="/" className="text-indigo-600 hover:underline">Back to home</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600" />
      <p className="text-gray-600">Signing you in…</p>
      {showEscape && (
        <button
          type="button"
          onClick={goToDashboardWithToken}
          disabled={escaping}
          className="text-indigo-600 hover:underline text-sm mt-2 disabled:opacity-70"
        >
          {escaping ? 'Setting session…' : 'Taking a while? Go to dashboard'}
        </button>
      )}
    </div>
  );
}
