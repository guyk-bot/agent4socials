'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

const STORAGE_KEY = 'izop-theme';
const LEGACY_STORAGE_KEY = 'agent4socials-theme';

export type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function readTheme(): Theme {
  return 'dark';
}

function applyTheme() {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', 'dark');
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readTheme());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setThemeState('dark');
    applyTheme();
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    applyTheme();
  }, [mounted]);

  const setTheme = (_value: Theme) => {
    setThemeState('dark');
    try {
      localStorage.setItem(STORAGE_KEY, 'dark');
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (_) {}
    applyTheme();
  };

  const toggleTheme = () => {
    setTheme('dark');
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
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
