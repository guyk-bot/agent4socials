'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/** Keeps embed=1 Composer iframe in sync with parent theme (URL param + postMessage). */
export function ComposerEmbedThemeSync() {
  const searchParams = useSearchParams();
  const themeParam = searchParams.get('theme');

  useEffect(() => {
    if (themeParam === 'dark' || themeParam === 'light') {
      document.documentElement.setAttribute('data-theme', themeParam);
    }
  }, [themeParam]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const data = event.data;
      if (data?.type !== 'izop-theme') return;
      if (data.theme === 'dark' || data.theme === 'light') {
        document.documentElement.setAttribute('data-theme', data.theme);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return null;
}
