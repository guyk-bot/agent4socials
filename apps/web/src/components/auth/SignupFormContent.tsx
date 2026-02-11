'use client';

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { Lock, Mail, User, ArrowRight, KeyRound } from 'lucide-react';

export default function SignupFormContent() {
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signInWithEmail, signInWithGoogle } = useAuth();
  const { openLogin } = useAuthModal();

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: name.trim() || undefined,
          marketing_consent: marketingConsent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      setStep('verify');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sign up');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code: code.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid or expired code');
        return;
      }
      await signInWithEmail(email.trim().toLowerCase(), password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      setError(err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to sign in with Google');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'block w-full pl-10 pr-3 py-2.5 border border-slate-700 rounded-lg bg-slate-800 text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Create an account</h2>
        <p className="mt-1 text-sm text-slate-400">Start scheduling your content today. $19.99/year.</p>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>}

      {step === 'signup' && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-slate-600 bg-slate-800 text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
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
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-700" /></div>
            <div className="relative flex justify-center text-sm"><span className="px-2 bg-slate-900 text-slate-400">or sign up with email</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleSignupSubmit}>
            <div>
              <label className="text-sm font-medium text-slate-300">Full Name</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><User size={18} /></div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="John Doe" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Mail size={18} /></div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="name@example.com" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-300">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><Lock size={18} /></div>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Min. 6 characters" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="rounded border-slate-600 bg-slate-800 text-emerald-500 focus:ring-emerald-500" />
              Send me product updates and tips (optional)
            </label>
            <button type="submit" disabled={loading} className="w-full flex justify-center items-center py-3 px-4 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50">
              {loading ? 'Sending code...' : 'Sign up'} <ArrowRight className="ml-2 w-4 h-4" />
            </button>
          </form>
        </>
      )}

      {step === 'verify' && (
        <form className="space-y-4" onSubmit={handleVerifySubmit}>
          <p className="text-sm text-slate-400">We sent a 6-digit code to <strong className="text-slate-200">{email}</strong>. Enter it below.</p>
          <div>
            <label className="text-sm font-medium text-slate-300">Verification code</label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500"><KeyRound size={18} /></div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={inputClass}
                placeholder="000000"
                autoFocus
              />
            </div>
          </div>
          <button type="submit" disabled={loading || code.length !== 6} className="w-full flex justify-center items-center py-3 px-4 rounded-lg text-sm font-semibold text-white bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50">
            {loading ? 'Verifying...' : 'Verify and sign in'} <ArrowRight className="ml-2 w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStep('signup')}
            className="w-full text-sm text-slate-400 hover:text-slate-300"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="text-center text-sm text-slate-400">
        Already have an account?{' '}
        <button type="button" onClick={openLogin} className="font-semibold text-emerald-400 hover:text-emerald-300">
          Log in
        </button>
      </p>
    </div>
  );
}
