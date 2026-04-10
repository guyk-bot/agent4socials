'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

type WhiteLabelState = {
  logoUrl: string | null;
  primaryColor: string;
  backgroundColor: string;
  textColor: string;
  appName: string;
};

const defaultState: WhiteLabelState = {
  logoUrl: null,
  primaryColor: '#525252',
  backgroundColor: '#f5f5f5',
  textColor: '#171717',
  appName: 'Agent4Socials',
};

const STORAGE_KEY = 'agent4socials-whitelabel';

type WhiteLabelContextValue = WhiteLabelState & {
  setLogoUrl: (url: string | null) => void;
  setPrimaryColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  setTextColor: (color: string) => void;
  setAppName: (name: string) => void;
  reset: () => void;
};

const WhiteLabelContext = createContext<WhiteLabelContextValue>({
  ...defaultState,
  setLogoUrl: () => {},
  setPrimaryColor: () => {},
  setBackgroundColor: () => {},
  setTextColor: () => {},
  setAppName: () => {},
  reset: () => {},
});

export function WhiteLabelProvider({ children }: { children: React.ReactNode }) {
  const [logoUrl, setLogoUrlState] = useState<string | null>(defaultState.logoUrl);
  const [primaryColor, setPrimaryColorState] = useState(defaultState.primaryColor);
  const [backgroundColor, setBackgroundColorState] = useState(defaultState.backgroundColor);
  const [textColor, setTextColorState] = useState(defaultState.textColor);
  const [appName, setAppNameState] = useState(defaultState.appName);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<WhiteLabelState>;
        if (parsed.logoUrl != null) setLogoUrlState(parsed.logoUrl);
        if (parsed.primaryColor) setPrimaryColorState(parsed.primaryColor);
        if (parsed.backgroundColor) setBackgroundColorState(parsed.backgroundColor);
        if (parsed.textColor) setTextColorState(parsed.textColor);
        if (parsed.appName != null && parsed.appName !== '') setAppNameState(parsed.appName);
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
    save({ logoUrl: url, primaryColor, backgroundColor, textColor, appName });
  }, [primaryColor, backgroundColor, textColor, appName, save]);

  const setPrimaryColor = useCallback((color: string) => {
    setPrimaryColorState(color);
    save({ logoUrl, primaryColor: color, backgroundColor, textColor, appName });
  }, [logoUrl, backgroundColor, textColor, appName, save]);

  const setBackgroundColor = useCallback((color: string) => {
    setBackgroundColorState(color);
    save({ logoUrl, primaryColor, backgroundColor: color, textColor, appName });
  }, [logoUrl, primaryColor, textColor, appName, save]);

  const setTextColor = useCallback((color: string) => {
    setTextColorState(color);
    save({ logoUrl, primaryColor, backgroundColor, textColor: color, appName });
  }, [logoUrl, primaryColor, backgroundColor, appName, save]);

  const setAppName = useCallback((name: string) => {
    setAppNameState(name || defaultState.appName);
    save({ logoUrl, primaryColor, backgroundColor, textColor, appName: name || defaultState.appName });
  }, [logoUrl, primaryColor, backgroundColor, textColor, save]);

  const reset = useCallback(() => {
    setLogoUrlState(defaultState.logoUrl);
    setPrimaryColorState(defaultState.primaryColor);
    setBackgroundColorState(defaultState.backgroundColor);
    setTextColorState(defaultState.textColor);
    setAppNameState(defaultState.appName);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    save({ logoUrl, primaryColor, backgroundColor, textColor, appName });
  }, [logoUrl, primaryColor, backgroundColor, textColor, appName, hydrated, save]);

  return (
    <WhiteLabelContext.Provider
      value={{
        logoUrl,
        primaryColor,
        backgroundColor,
        textColor,
        appName,
        setLogoUrl,
        setPrimaryColor,
        setBackgroundColor,
        setTextColor,
        setAppName,
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
