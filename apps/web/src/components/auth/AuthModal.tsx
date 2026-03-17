'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthModal } from '@/context/AuthModalContext';
import LoginFormContent from './LoginFormContent';
import SignupFormContent from './SignupFormContent';
import Image from 'next/image';

function AuthModalInner() {
  const { modal, closeModal } = useAuthModal();
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason');
  const error = searchParams.get('error');
  const profileFailedMessage =
    reason === 'profile_failed'
      ? 'Sign-in worked, but the app could not load your profile. Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in Vercel (web project) and redeploy.'
      : null;

  useEffect(() => {
    if (modal) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [modal]);

  if (!modal) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
      onClick={closeModal}
      role="dialog"
      aria-modal="true"
      aria-label={modal === 'login' ? 'Log in' : 'Sign up'}
    >
      <div
        className="relative w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[rgba(11,15,26,0.95)] backdrop-blur-[20px] p-8 shadow-[0_0_40px_rgba(139,92,246,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={closeModal}
          className="absolute top-4 right-4 p-1.5 text-[#9ca3af] hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="text-center mb-6">
          <Image src="/logo.svg" alt="Agent4Socials" width={48} height={48} className="h-12 w-12 mx-auto" />
        </div>
        {modal === 'login' && (
          <LoginFormContent profileFailedMessage={profileFailedMessage} authError={error ?? undefined} />
        )}
        {modal === 'signup' && <SignupFormContent />}
      </div>
    </div>
  );
}

export default function AuthModal() {
  return (
    <Suspense fallback={null}>
      <AuthModalInner />
    </Suspense>
  );
}
