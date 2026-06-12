'use client';

import { useEffect, useRef } from 'react';
import { trackProductEvent } from '@/lib/product-analytics';

/** Fires once when the landing pricing section scrolls into view. */
export function PricingSectionTracker() {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || typeof window === 'undefined') return;
    const el = document.getElementById('pricing');
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (fired.current) return;
        const visible = entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.25);
        if (!visible) return;
        fired.current = true;
        trackProductEvent('pricing_section_viewed', { source: 'landing' });
        observer.disconnect();
      },
      { threshold: [0.25] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return null;
}
