'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { trackProductEvent } from '@/lib/product-analytics';

type AuthModalType = 'login' | 'signup' | null;

const AuthModalContext = createContext<{
  modal: AuthModalType;
  openLogin: (source?: string | React.SyntheticEvent) => void;
  openSignup: (source?: string | React.SyntheticEvent) => void;
  closeModal: () => void;
}>({
  modal: null,
  openLogin: () => {},
  openSignup: () => {},
  closeModal: () => {},
});

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<AuthModalType>(null);

  const openLogin = useCallback((source?: string | React.SyntheticEvent) => {
    const resolved = typeof source === 'string' ? source : 'unknown';
    trackProductEvent('signin_modal_opened', { source: resolved });
    setModal('login');
  }, []);
  const openSignup = useCallback((source?: string | React.SyntheticEvent) => {
    const resolved = typeof source === 'string' ? source : 'unknown';
    trackProductEvent('signup_modal_opened', { source: resolved });
    setModal('signup');
  }, []);
  const closeModal = useCallback(() => setModal(null), []);

  return (
    <AuthModalContext.Provider value={{ modal, openLogin, openSignup, closeModal }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export function useAuthModal() {
  return useContext(AuthModalContext);
}
