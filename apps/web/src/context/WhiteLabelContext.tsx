'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type WhiteLabelState = {
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
};

const defaultState: WhiteLabelState = {
  logoUrl: null,
  primaryColor: '#6366f1',
  backgroundColor: '#f8fafc',
};

const STORAGE_KEY = 'agent4socials-whitelabel';

type WhiteLabelContextValue = WhiteLabelState & {
  setLogoUrl: (url: string | null) => void;
  setPrimaryColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  reset: () => void;
};

const WhiteLabelContext = createContext<WhiteLabelContextValue>({
  ...defaultState,
  setLogoUrl: () => {},
  setPrimaryColor: () => {},
  setBackgroundColor: () => {},
  reset: () => {},
});

export function WhiteLabelProvider({ children }: { children: React.ReactNode }) {
  const [logoUrl, setLogoUrlState] = useState<string | null>(defaultState.logoUrl);
  const [primaryColor, setPrimaryColorState] = useState(defaultState.primaryColor);
  const [backgroundColor, setBackgroundColorState] = useState(defaultState.backgroundColor);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WhiteLabelState>;
        if (parsed.logoUrl != null) setLogoUrlState(parsed.logoUrl);
        if (parsed.primaryColor) setPrimaryColorState(parsed.primaryColor);
        if (parsed.backgroundColor) setBackgroundColorState(parsed.backgroundColor);
      }
    } catch (_) {}
    setHydrated(true);
  }, []);

  const save = useCallback((state: WhiteLabelState) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
  }, []);

  const setLogoUrl = useCallback((url: string | null) => {
    setLogoUrlState(url);
    save({ logoUrl: url, primaryColor, backgroundColor });
  }, [primaryColor, backgroundColor, save]);

  const setPrimaryColor = useCallback((color: string) => {
    setPrimaryColorState(color);
    save({ logoUrl, primaryColor: color, backgroundColor });
  }, [logoUrl, backgroundColor, save]);

  const setBackgroundColor = useCallback((color: string) => {
    setBackgroundColorState(color);
    save({ logoUrl, primaryColor, backgroundColor: color });
  }, [logoUrl, primaryColor, save]);

  const reset = useCallback(() => {
    setLogoUrlState(defaultState.logoUrl);
    setPrimaryColorState(defaultState.primaryColor);
    setBackgroundColorState(defaultState.backgroundColor);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    save({ logoUrl, primaryColor, backgroundColor });
  }, [logoUrl, primaryColor, backgroundColor, hydrated, save]);

  return (
    <WhiteLabelContext.Provider
      value={{
        logoUrl,
        primaryColor,
        backgroundColor,
        setLogoUrl,
        setPrimaryColor,
        setBackgroundColor,
        reset,
      }}
    >
      {children}
    </WhiteLabelContext.Provider>
  );
}

export function useWhiteLabel() {
  const ctx = useContext(WhiteLabelContext);
  if (!ctx) throw new Error('useWhiteLabel must be used within WhiteLabelProvider');
  return ctx;
}
