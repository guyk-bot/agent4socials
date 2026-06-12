'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { syncLandingHashScroll } from '@/lib/landing-section-scroll';

/** Ensures /#pricing and other homepage anchors scroll into view (Next.js Link does not). */
export function LandingHashScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== '/') return;

    syncLandingHashScroll('auto');

    const onHashChange = () => syncLandingHashScroll('smooth');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [pathname]);

  return null;
}
