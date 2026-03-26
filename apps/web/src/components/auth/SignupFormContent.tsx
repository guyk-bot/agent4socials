'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const { openLogin, closeModal } = useAuthModal();
  const router = useRouter();

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
      closeModal();
      router.push('/dashboard');
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

  const inputClass = 'block w-full rounded-xl border border-[#efe7f7] bg-white py-2.5 pl-10 pr-3 text-[#1a161f] placeholder-[#8d8799] transition-colors focus:border-[#7b2cbf]/50 focus:outline-none focus:ring-2 focus:ring-[#7b2cbf]/25';

  return (
    <div className="space-y-6">

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#d7263d]">{error}</div>}

      {step === 'signup' && (
        <>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 rounded-xl border border-[#efe7f7] bg-white px-4 py-3 text-[#1a161f] transition-colors hover:bg-[#faf7fd] disabled:opacity-50"
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
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#efe7f7]" /></div>
            <div className="relative flex justify-center text-sm"><span className="bg-[#fffdff] px-2 text-[#5d5768]">or sign up with email</span></div>
          </div>

          <form className="space-y-4" onSubmit={handleSignupSubmit}>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Full Name</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]"><User size={18} /></div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]"><Mail size={18} /></div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]"><Lock size={18} /></div>
                <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Min. 6 characters" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[#5d5768] cursor-pointer">
              <input type="checkbox" checked={marketingConsent} onChange={(e) => setMarketingConsent(e.target.checked)} className="rounded border-[#d7cae5] bg-white text-[#7b2cbf] focus:ring-[#7b2cbf]/40" />
              Send me product updates and tips (optional)
            </label>
            <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-[#7b2cbf] to-[#d7263d] shadow-[0_12px_24px_rgba(123,44,191,0.28)] hover:brightness-105 disabled:opacity-50 transition-all">
              {loading ? 'Sending code...' : 'Sign up'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </>
      )}

      {step === 'verify' && (
        <form className="space-y-4" onSubmit={handleVerifySubmit}>
          <p className="text-sm text-[#5d5768]">We sent a 6-digit code to <strong className="text-[#1a161f]">{email}</strong>. Enter it below.</p>
          <div>
            <label className="text-sm font-medium text-[#5d5768]">Verification code</label>
            <div className="mt-1 relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]"><KeyRound size={18} /></div>
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
          <button type="submit" disabled={loading || code.length !== 6} className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-[#7b2cbf] to-[#d7263d] shadow-[0_12px_24px_rgba(123,44,191,0.28)] hover:brightness-105 disabled:opacity-50 transition-all">
            {loading ? 'Verifying...' : 'Verify and sign in'} <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setStep('signup')}
            className="w-full text-sm text-[#7b2cbf] hover:text-[#6420a3] transition-colors"
          >
            Use a different email
          </button>
        </form>
      )}

      <p className="text-center text-sm text-[#5d5768]">
        Already have an account?{' '}
        <button type="button" onClick={openLogin} className="font-semibold text-[#7b2cbf] hover:text-[#6420a3] transition-colors">
          Log in
        </button>
      </p>
    </div>
  );
}
