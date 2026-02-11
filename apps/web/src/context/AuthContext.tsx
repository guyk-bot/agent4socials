'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import api from '@/lib/api';

interface User {
  id: string;
  email: string;
  name?: string;
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

  const syncUserFromApi = async (accessToken: string, fallbackUser?: { id: string; email?: string; name?: string } | null) => {
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
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
      return;
    }

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const fallback = {
            id: session.user.id,
            email: session.user.email ?? '',
            name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? undefined,
          };
          await syncUserFromApi(session.access_token, fallback);
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      if (session?.access_token) {
        const fallback = {
          id: session.user.id,
          email: session.user.email ?? '',
          name: session.user.user_metadata?.full_name ?? session.user.user_metadata?.name ?? undefined,
        };
        await syncUserFromApi(session.access_token, fallback);
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          router.push('/dashboard');
        }
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const signUpWithEmail = async (email: string, password: string, name?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });
    if (error) throw error;
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signInWithGoogle = async () => {
    const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
