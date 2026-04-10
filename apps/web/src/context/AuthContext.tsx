'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

/** Avoid blocking the whole dashboard shell if profile never returns (network, server hang). */
const PROFILE_FETCH_TIMEOUT_MS = 12_000;
/** Last resort if getSession() or similar never settles. */
const AUTH_INIT_SAFETY_MS = 20_000;

interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUpWithEmail: (email: string, password: string, name?: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const syncUserFromApi = async (accessToken: string, fallbackUser?: { id: string; email?: string; name?: string; avatarUrl?: string } | null) => {
    try {
      const init: RequestInit = {
        headers: { Authorization: `Bearer ${accessToken}` },
      };
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        init.signal = AbortSignal.timeout(PROFILE_FETCH_TIMEOUT_MS);
      }
      const res = await fetch('/api/auth/profile', init);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setUser(data);
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('profile_error');
        const syncStatus = res.headers.get('X-Profile-Sync');
        const syncError = res.headers.get('X-Profile-Sync-Error');
        if (syncStatus === 'skipped') {
          sessionStorage.setItem('profile_sync_status', 'skipped');
          sessionStorage.removeItem('profile_sync_error');
        } else if (syncStatus === 'failed') {
          sessionStorage.setItem('profile_sync_status', 'failed');
          sessionStorage.setItem('profile_sync_error', syncError || 'Unknown error');
        } else {
          sessionStorage.removeItem('profile_sync_status');
          sessionStorage.removeItem('profile_sync_error');
        }
      }
    } catch (err: unknown) {
      // Keep user on dashboard: use session data so we don't redirect to funnel when profile API fails
      if (fallbackUser) {
        setUser({
          id: fallbackUser.id,
          email: fallbackUser.email ?? '',
          name: fallbackUser.name,
          avatarUrl: fallbackUser.avatarUrl,
        });
      } else {
        setUser(null);
      }
      if (typeof window !== 'undefined') {
        const msg = err instanceof Error ? err.message : 'Profile request failed';
        sessionStorage.setItem('profile_error', msg);
      }
    }
  };

  useEffect(() => {
    // If Supabase redirected to / with token in hash, go to callback (full navigation so hash is preserved)
    if (typeof window !== 'undefined' && window.location.pathname === '/' && window.location.hash.includes('access_token')) {
      window.location.replace('/auth/callback' + window.location.hash);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const supabase = getSupabaseBrowser();
    const safetyTimer = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, AUTH_INIT_SAFETY_MS);

    const sessionFallbackUser = (session: Session) => ({
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? undefined,
      avatarUrl: (session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture) ?? undefined,
    });

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session?.access_token) {
          const fallback = sessionFallbackUser(session);
          // Show the shell immediately; profile can lag or fail without bricking the app.
          setUser({
            id: fallback.id,
            email: fallback.email,
            name: fallback.name,
            avatarUrl: fallback.avatarUrl,
          });
          void syncUserFromApi(session.access_token, fallback);
        } else {
          setUser(null);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) {
          window.clearTimeout(safetyTimer);
          setLoading(false);
        }
      }
    };
    void init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      if (session?.access_token) {
        const fallback = sessionFallbackUser(session);
        setUser({
          id: fallback.id,
          email: fallback.email,
          name: fallback.name,
          avatarUrl: fallback.avatarUrl,
        });
        void syncUserFromApi(session.access_token, fallback);
        // Redirect to dashboard only when user just signed in from /login or /signup (not from homepage /).
        // Visiting / with an existing session was incorrectly redirecting because some clients fire SIGNED_IN on session restore.
        if (event === 'SIGNED_IN') {
          const path = typeof window !== 'undefined' ? window.location.pathname : '';
          const isLoginOrSignupPage = path === '/login' || path === '/signup' || (path.startsWith('/auth/') && path !== '/auth/callback');
          if (isLoginOrSignupPage) router.push('/dashboard');
        }
      } else {
        setUser(null);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, [router]);

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const supabase = getSupabaseBrowser();
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const logout = async () => {
    const supabase = getSupabaseBrowser();
    await supabase.auth.signOut();
    setUser(null);
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem('appDataPhase1Done');
    router.push('/');
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUpWithEmail, signInWithEmail, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
