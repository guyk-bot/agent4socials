'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Auth callback for Supabase PKCE OAuth (Google, etc.).
 *
 * With flowType: 'pkce', Google redirects back with ?code=...
 * We call supabase.auth.exchangeCodeForSession(href) to trade the code for tokens.
 * This avoids all the implicit-flow hash-fragment issues that caused "signal is aborted".
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function handleCallback() {
      try {
        // Check for OAuth errors returned in the query string
        const params = new URLSearchParams(window.location.search);
        const oauthError = params.get('error_description') ?? params.get('error');
        if (oauthError) {
          setErrorMsg(oauthError);
          setStatus('error');
          return;
        }

        const code = params.get('code');

        if (code) {
          // PKCE flow: exchange the code for a session
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            setErrorMsg(error.message);
            setStatus('error');
            return;
          }
          window.location.href = '/dashboard';
          return;
        }

        // No code in the URL — could be a legacy implicit-flow redirect with #access_token
        // or a direct navigation. Check for an existing session.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          window.location.href = '/dashboard';
          return;
        }

        // Nothing we can use
        setErrorMsg('Sign-in failed: no authorization code in the URL. Please try signing in again.');
        setStatus('error');
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : 'Unexpected error during sign-in.');
        setStatus('error');
      }
    }

    handleCallback();
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
