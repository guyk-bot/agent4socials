'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  getThemeCoords,
  msUntilNextSunTransition,
  roughAutoThemeFromClock,
  themeFromSunPosition,
  type ResolvedTheme,
} from '@/lib/theme-auto';

const STORAGE_KEY = 'agent4socials-theme';

export type ThemePreference = 'light' | 'dark' | 'auto';

/** @deprecated Use ThemePreference; kept for callers that only need resolved light/dark. */
export type Theme = ResolvedTheme;

interface ThemeContextType {
  /** Resolved theme applied to the document (light or dark). */
  theme: ResolvedTheme;
  /** User-selected mode including auto. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Cycles light → dark → auto → light. */
  toggleTheme: () => void;
  /** @deprecated Use setPreference. */
  setTheme: (theme: ResolvedTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light' || stored === 'auto') return stored;
  } catch {
    /* ignore */
  }
  return 'light';
}

function applyTheme(theme: ResolvedTheme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
}

function resolveInitialTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'auto') return roughAutoThemeFromClock();
  return preference;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readPreference());
  const [theme, setThemeState] = useState<ResolvedTheme>(() => resolveInitialTheme(readPreference()));
  const [mounted, setMounted] = useState(false);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const applyResolved = useCallback((resolved: ResolvedTheme) => {
    setThemeState(resolved);
    applyTheme(resolved);
  }, []);

  useEffect(() => {
    const pref = readPreference();
    setPreferenceState(pref);
    applyResolved(resolveInitialTheme(pref));
    setMounted(true);
  }, [applyResolved]);

  const refreshAutoTheme = useCallback(async () => {
    const coords = coordsRef.current ?? (await getThemeCoords());
    coordsRef.current = coords;
    applyResolved(themeFromSunPosition(coords.lat, coords.lng));
    return coords;
  }, [applyResolved]);

  useEffect(() => {
    if (!mounted) return;

    if (preference !== 'auto') {
      applyResolved(preference);
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const scheduleNext = (coords: { lat: number; lng: number }) => {
      if (cancelled) return;
      const delay = msUntilNextSunTransition(coords.lat, coords.lng);
      timeoutId = setTimeout(() => {
        void run();
      }, delay);
    };

    const run = async () => {
      if (cancelled) return;
      const coords = await refreshAutoTheme();
      scheduleNext(coords);
    };

    void run();
    intervalId = setInterval(() => {
      void refreshAutoTheme();
    }, 60_000);

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [mounted, preference, refreshAutoTheme, applyResolved]);

  const setPreference = useCallback(
    (value: ThemePreference) => {
      setPreferenceState(value);
      try {
        localStorage.setItem(STORAGE_KEY, value);
      } catch {
        /* ignore */
      }
      if (value === 'auto') {
        void refreshAutoTheme();
      } else {
        applyResolved(value);
      }
    },
    [applyResolved, refreshAutoTheme]
  );

  const toggleTheme = useCallback(() => {
    const next: ThemePreference =
      preference === 'light' ? 'dark' : preference === 'dark' ? 'auto' : 'light';
    setPreference(next);
  }, [preference, setPreference]);

  const setTheme = useCallback(
    (value: ResolvedTheme) => {
      setPreference(value);
    },
    [setPreference]
  );

  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (ctx === undefined) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}
