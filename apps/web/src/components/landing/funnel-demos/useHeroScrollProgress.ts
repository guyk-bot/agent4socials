'use client';

import { useCallback, useEffect, useState } from 'react';
import { HERO_SCROLL_SECTIONS } from './hero-scroll-config';

export function useHeroScrollProgress(scrollRootRef: React.RefObject<HTMLElement | null>) {
  const [segmentFloat, setSegmentFloat] = useState(0);
  const [hasScrolled, setHasScrolled] = useState(false);

  const update = useCallback(() => {
    const el = scrollRootRef.current;
    if (!el) return;

    const heroTop = el.offsetTop;
    const heroHeight = el.offsetHeight;
    const viewport = window.innerHeight;
    const maxScroll = Math.max(1, heroHeight - viewport);
    const scrolled = window.scrollY - heroTop;
    const progress = Math.max(0, Math.min(1, scrolled / maxScroll));

    setSegmentFloat(progress * HERO_SCROLL_SECTIONS);
    if (scrolled > 20) setHasScrolled(true);
  }, [scrollRootRef]);

  useEffect(() => {
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const activeIndex = Math.min(
    HERO_SCROLL_SECTIONS - 1,
    Math.max(0, Math.floor(segmentFloat))
  );

  return { segmentFloat, activeIndex, hasScrolled };
}
