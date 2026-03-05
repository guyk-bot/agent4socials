'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Auth callback for the Supabase implicit-flow OAuth (Google, etc.).
 *
 * Supabase JS (detectSessionInUrl: true by default) automatically reads
 * the #access_token from the URL and fires onAuthStateChange('SIGNED_IN').
 * We just listen and redirect. No manual setSession call needed (that was
 * causing "signal is aborted without reason" errors).
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // Check if there's an error in the URL first
    const hash = window.location.hash || window.location.search;
    if (hash.includes('error_description')) {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const desc = params.get('error_description') ?? 'Sign-in failed';
      setErrorMsg(desc);
      setStatus('error');
      return;
    }

    // Supabase automatically parses #access_token from the URL.
    // Listen for the resulting SIGNED_IN event and redirect.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        subscription.unsubscribe();
        window.location.href = '/dashboard';
      }
    });

    // Also check immediately in case the session was already set
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        window.location.href = '/dashboard';
      }
    });

    // Fallback: after 20s if still no redirect, show error
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        subscription.unsubscribe();
        window.location.href = '/dashboard';
      } else {
        subscription.unsubscribe();
        setErrorMsg('Sign-in timed out. Please try again.');
        setStatus('error');
      }
    }, 20_000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 bg-gray-50 text-center">
        <p className="text-red-600 font-medium max-w-sm">{errorMsg}</p>
        <a href="/login" className="text-indigo-600 hover:underline">Try signing in again</a>
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
