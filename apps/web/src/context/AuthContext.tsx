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

  const syncUserFromApi = async (accessToken: string) => {
    try {
      const res = await api.get('/auth/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 10_000,
      });
      setUser(res.data);
      if (typeof window !== 'undefined') sessionStorage.removeItem('profile_error');
    } catch (err: unknown) {
      setUser(null);
      if (typeof window !== 'undefined') {
        const msg =
          err && typeof err === 'object' && err !== null && 'response' in err
            ? (err as { response?: { status?: number; data?: unknown } }).response?.status === 401
              ? '401 Unauthorized (wrong SUPABASE_JWT_SECRET or token)'
              : (err as { response?: { status?: number } }).response?.status === 500
                ? '500 API error (check API logs; often Redis or DB)'
                : (err as { response?: { status?: number } }).response?.status
                  ? `API ${(err as { response: { status: number } }).response.status}`
                  : (err as { message?: string }).message || 'Network or CORS error'
            : 'Profile request failed';
        sessionStorage.setItem('profile_error', msg);
      }
    }
  };

  useEffect(() => {
    // If Supabase redirected to / with token in hash, send to callback page (avoids 500 on root)
    if (typeof window !== 'undefined' && window.location.pathname === '/' && window.location.hash.includes('access_token')) {
      router.replace('/auth/callback' + window.location.hash);
      return;
    }

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await syncUserFromApi(session.access_token);
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
        await syncUserFromApi(session.access_token);
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
    router.push('/login');
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
