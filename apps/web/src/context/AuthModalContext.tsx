'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

type AuthModalType = 'login' | 'signup' | null;

const AuthModalContext = createContext<{
  modal: AuthModalType;
  openLogin: () => void;
  openSignup: () => void;
  closeModal: () => void;
}>({
  modal: null,
  openLogin: () => {},
  openSignup: () => {},
  closeModal: () => {},
});

export function AuthModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<AuthModalType>(null);

  const openLogin = useCallback(() => setModal('login'), []);
  const openSignup = useCallback(() => setModal('signup'), []);
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
