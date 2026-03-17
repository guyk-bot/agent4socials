'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { Lock, Mail, ArrowRight } from 'lucide-react';

interface Props {
  profileFailedMessage?: string | null;
  authError?: string;
}

export default function LoginFormContent({ profileFailedMessage, authError }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(authError ?? '');
  const [loading, setLoading] = useState(false);
  const [profileErrorDetail, setProfileErrorDetail] = useState<string | null>(null);

  React.useEffect(() => {
    if (authError) setError(authError);
  }, [authError]);

  React.useEffect(() => {
    if (profileFailedMessage && typeof window !== 'undefined') {
      setProfileErrorDetail(sessionStorage.getItem('profile_error'));
    }
  }, [profileFailedMessage]);
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const { openSignup, closeModal } = useAuthModal();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmail(email, password);
      closeModal();
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to log in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
      // Do not close modal or navigate: OAuth redirects the page to Google; any router.push here would briefly show the dashboard before redirect.
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to sign in with Google');
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Welcome back</h2>
        <p className="mt-1 text-sm text-[#9ca3af]">Log in to your Agent4Socials account</p>
      </div>

      {(profileFailedMessage || profileErrorDetail) && (
        <div className="space-y-2">
          {profileFailedMessage && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-xl text-sm">{profileFailedMessage}</div>
          )}
          {profileErrorDetail && (
            <div className="bg-white/[0.05] border border-white/[0.08] text-[#9ca3af] px-4 py-2 rounded-xl text-xs font-mono">Detail: {profileErrorDetail}</div>
          )}
        </div>
      )}
      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-white/[0.1] bg-[rgba(255,255,255,0.05)] text-white hover:bg-white/[0.08] transition-colors disabled:opacity-50"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/[0.08]" /></div>
        <div className="relative flex justify-center text-sm"><span className="px-2 bg-[rgba(11,15,26,0.95)] text-[#9ca3af]">or log in with email</span></div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="text-sm font-medium text-[#9ca3af]">Email address</label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]"><Mail size={18} /></div>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full pl-10 pr-3 py-2.5 border border-white/[0.08] rounded-xl bg-[rgba(255,255,255,0.05)] text-white placeholder-[#6b7280] focus:ring-2 focus:ring-[#5ff6fd]/50 focus:border-[#5ff6fd]/40 focus:outline-none transition-colors" placeholder="name@example.com" />
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-[#9ca3af]">Password</label>
          <div className="mt-1 relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#6b7280]"><Lock size={18} /></div>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full pl-10 pr-3 py-2.5 border border-white/[0.08] rounded-xl bg-[rgba(255,255,255,0.05)] text-white placeholder-[#6b7280] focus:ring-2 focus:ring-[#5ff6fd]/50 focus:border-[#5ff6fd]/40 focus:outline-none transition-colors" placeholder="••••••••" />
          </div>
        </div>
        <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-full text-sm font-semibold text-white bg-[#6b21a8] shadow-[0_0_15px_rgba(107,33,168,0.4)] hover:bg-[#7c3aed] hover:shadow-[0_0_20px_rgba(124,58,237,0.5)] disabled:opacity-50 transition-all">
          {loading ? 'Logging in...' : 'Log in'} <ArrowRight className="w-4 h-4" />
        </button>
      </form>

      <p className="text-center text-sm text-[#9ca3af]">
        Don&apos;t have an account?{' '}
        <button type="button" onClick={openSignup} className="font-semibold text-[#5ff6fd] hover:text-[#7dd3fc] transition-colors">
          Sign up for free
        </button>
      </p>
    </div>
  );
}
