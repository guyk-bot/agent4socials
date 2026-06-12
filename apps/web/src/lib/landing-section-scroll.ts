/** Fixed funnel header height offset when scrolling to in-page sections. */
export const LANDING_HEADER_SCROLL_OFFSET = 80;

export function scrollToLandingSection(
  hash: string,
  behavior: ScrollBehavior = 'smooth'
): boolean {
  const id = hash.replace(/^#/, '').trim();
  if (!id || typeof window === 'undefined') return false;

  const el = document.getElementById(id);
  if (!el) return false;

  const top = el.getBoundingClientRect().top + window.scrollY - LANDING_HEADER_SCROLL_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior });
  return true;
}

/** Scroll to the current URL hash (homepage section anchors). */
export function syncLandingHashScroll(behavior: ScrollBehavior = 'smooth'): void {
  if (typeof window === 'undefined') return;
  const hash = window.location.hash;
  if (!hash || hash.length < 2) return;

  requestAnimationFrame(() => {
    scrollToLandingSection(hash, behavior);
  });
}
