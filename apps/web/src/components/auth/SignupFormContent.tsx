'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useAuthModal } from '@/context/AuthModalContext';
import { ArrowRight, Eye, EyeOff, Lock, Mail, User } from 'lucide-react';

const RESEND_COOLDOWN_MS = 30_000;

function formatMmSs(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export default function SignupFormContent() {
  const [step, setStep] = useState<'signup' | 'verify'>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [digits, setDigits] = useState<string[]>(() => ['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  /** Monotonic end time for 30s resend cooldown (client + server aligned after each attempt). */
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null);
  /** Server lockout end (ms); when set, resend is blocked until this time. */
  const [lockoutUntilMs, setLockoutUntilMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  const { signInWithEmail, signInWithGoogle } = useAuth();
  const { openLogin, closeModal } = useAuthModal();
  const router = useRouter();

  const code = digits.join('');

  const cooldownRemainingSec = useMemo(() => {
    if (!cooldownUntil) return 0;
    return Math.ceil(Math.max(0, cooldownUntil - Date.now()) / 1000);
  }, [cooldownUntil, tick]);

  const lockoutRemainingSec = useMemo(() => {
    if (!lockoutUntilMs) return 0;
    return Math.ceil(Math.max(0, lockoutUntilMs - Date.now()) / 1000);
  }, [lockoutUntilMs, tick]);

  useEffect(() => {
    if (!cooldownUntil && !lockoutUntilMs) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil, lockoutUntilMs]);

  useEffect(() => {
    if (cooldownUntil && Date.now() >= cooldownUntil) setCooldownUntil(null);
  }, [cooldownUntil, tick]);

  useEffect(() => {
    if (lockoutUntilMs && Date.now() >= lockoutUntilMs) setLockoutUntilMs(null);
  }, [lockoutUntilMs, tick]);

  const setDigitAt = useCallback((index: number, digit: string) => {
    const d = digit.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => raw[i] ?? '');
    setDigits(next);
    const focusIdx = Math.min(raw.length, 5);
    otpRefs.current[focusIdx]?.focus();
  }, []);

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!termsAccepted) {
      setError('Please agree to the Terms of Service to continue.');
      return;
    }
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
          terms_accepted: termsAccepted,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`);
        return;
      }
      setDigits(['', '', '', '', '', '']);
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      setLockoutUntilMs(null);
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

  const handleResend = async () => {
    setError('');
    if (lockoutUntilMs && Date.now() < lockoutUntilMs) return;
    if (cooldownUntil && Date.now() < cooldownUntil) return;
    setResendLoading(true);
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 429 && data.lockoutUntil) {
          setLockoutUntilMs(new Date(String(data.lockoutUntil)).getTime());
          setError(String(data.error || 'Too many requests.'));
        } else if (res.status === 429 && typeof data.retryAfterSec === 'number') {
          setCooldownUntil(Date.now() + data.retryAfterSec * 1000);
          setError(String(data.error || 'Please wait before requesting another code.'));
        } else {
          setError(String(data.error || 'Could not resend code.'));
        }
        return;
      }
      setError('');
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_MS);
      if (data.lockoutUntil) {
        setLockoutUntilMs(new Date(String(data.lockoutUntil)).getTime());
      }
      setDigits(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not resend code');
    } finally {
      setResendLoading(false);
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

  const inputClass =
    'block w-full rounded-xl border border-[#efe7f7] bg-white py-2.5 pl-10 pr-10 text-[#1a161f] placeholder-[#8d8799] transition-colors focus:border-[#7b2cbf]/50 focus:outline-none focus:ring-2 focus:ring-[#7b2cbf]/25';

  const otpBoxClass =
    'h-12 w-10 sm:w-11 rounded-xl border border-[#efe7f7] bg-white text-center text-lg font-semibold text-[#1a161f] transition-colors focus:border-[#7b2cbf]/50 focus:outline-none focus:ring-2 focus:ring-[#7b2cbf]/25';

  const lockoutActive = lockoutUntilMs !== null && Date.now() < lockoutUntilMs;
  const cooldownActive = !lockoutActive && cooldownUntil !== null && Date.now() < cooldownUntil;
  const canRequestResend = !lockoutActive && !cooldownActive && !resendLoading;

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
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#efe7f7]" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-[#fffdff] px-2 text-[#5d5768]">or sign up with email</span>
            </div>
          </div>

          <form className="space-y-4" onSubmit={handleSignupSubmit}>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Full Name</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]">
                  <User size={18} />
                </div>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass.replace('pr-10', 'pr-3')} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Email address</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]">
                  <Mail size={18} />
                </div>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass.replace('pr-10', 'pr-3')} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[#5d5768]">Password</label>
              <div className="mt-1 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5d5768]">
                  <Lock size={18} />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Min. 6 characters"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[#5d5768] hover:text-[#1a161f]"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm text-[#5d5768] cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-0.5 rounded border-[#d7cae5] bg-white text-[#7b2cbf] focus:ring-[#7b2cbf]/40"
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7b2cbf] hover:text-[#6420a3] underline">
                  Terms of Service
                </Link>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-[#5d5768] cursor-pointer">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="rounded border-[#d7cae5] bg-white text-[#7b2cbf] focus:ring-[#7b2cbf]/40"
              />
              Send me product updates and tips (optional)
            </label>
            <button
              type="submit"
              disabled={loading || !termsAccepted}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-[#7b2cbf] to-[#d7263d] shadow-[0_12px_24px_rgba(123,44,191,0.28)] hover:brightness-105 disabled:opacity-50 transition-all"
            >
              {loading ? 'Sending code...' : 'Sign up'} <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </>
      )}

      {step === 'verify' && (
        <form className="space-y-4" onSubmit={handleVerifySubmit}>
          <p className="text-sm text-[#5d5768]">
            We sent a 6-digit code to <strong className="text-[#1a161f]">{email}</strong>. Enter it below.
          </p>
          <div>
            <label className="text-sm font-medium text-[#5d5768]">Verification code</label>
            <div className="mt-2 flex justify-center gap-2 sm:gap-2.5" onPaste={handleOtpPaste}>
              {Array.from({ length: 6 }).map((_, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    otpRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={1}
                  value={digits[i] ?? ''}
                  onChange={(e) => setDigitAt(i, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      e.preventDefault();
                      if (digits[i]) {
                        setDigits((prev) => {
                          const next = [...prev];
                          next[i] = '';
                          return next;
                        });
                      } else if (i > 0) {
                        otpRefs.current[i - 1]?.focus();
                      }
                    }
                  }}
                  className={otpBoxClass}
                  aria-label={`Digit ${i + 1} of 6`}
                  autoFocus={i === 0}
                />
              ))}
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-full text-sm font-semibold text-white bg-gradient-to-r from-[#7b2cbf] to-[#d7263d] shadow-[0_12px_24px_rgba(123,44,191,0.28)] hover:brightness-105 disabled:opacity-50 transition-all"
          >
            {loading ? 'Verifying...' : 'Verify and sign in'} <ArrowRight className="w-4 h-4" />
          </button>

          <div className="flex flex-col items-center gap-2 text-center">
            <button
              type="button"
              onClick={handleResend}
              disabled={!canRequestResend}
              className="text-sm font-semibold text-[#7b2cbf] hover:text-[#6420a3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {resendLoading ? 'Sending…' : "Didn't get the code? Send again"}
            </button>
            {lockoutActive ? (
              <p className="text-xs text-[#5d5768]">
                You can request a new code in <span className="font-mono font-semibold text-[#1a161f]">{formatMmSs(lockoutRemainingSec)}</span>
                . Or{' '}
                <button type="button" onClick={openLogin} className="font-semibold text-[#7b2cbf] hover:text-[#6420a3]">
                  log in
                </button>{' '}
                or use Google.
              </p>
            ) : cooldownActive ? (
              <p className="text-xs text-[#5d5768]">
                You can request a new code in <span className="font-mono font-semibold text-[#1a161f]">{formatMmSs(cooldownRemainingSec)}</span>
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => {
              setStep('signup');
              setDigits(['', '', '', '', '', '']);
              setCooldownUntil(null);
              setLockoutUntilMs(null);
            }}
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
