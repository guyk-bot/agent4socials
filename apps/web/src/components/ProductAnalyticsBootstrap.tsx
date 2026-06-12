'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { trackProductEvent, recordAuthenticatedProductEvent } from '@/lib/product-analytics';

/** Enriched route tracking on top of Vercel automatic page views. */
export function ProductAnalyticsBootstrap() {
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;

    trackProductEvent('page_engagement', { path: pathname });

    if (pathname.startsWith('/dashboard')) {
      void recordAuthenticatedProductEvent('dashboard_viewed', { path: pathname });
    } else if (pathname === '/composer') {
      void recordAuthenticatedProductEvent('composer_opened');
    } else if (pathname === '/pricing') {
      void recordAuthenticatedProductEvent('pricing_page_viewed', { path: pathname });
    } else if (pathname.includes('/inbox')) {
      void recordAuthenticatedProductEvent('inbox_opened', { path: pathname });
    } else if (pathname.includes('/aysop-ai')) {
      void recordAuthenticatedProductEvent('aysop_chat_used', { path: pathname });
    }
  }, [pathname]);

  return null;
}
