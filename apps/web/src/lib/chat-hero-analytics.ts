/** Landing chat hero analytics: Vercel custom events + gtag. */

import {
  platformAnalyticsSlug,
  trackPlatformProductEvent,
  trackProductEvent,
  type ProductAnalyticsEvent,
  type ProductAnalyticsProps,
} from '@/lib/product-analytics';

export type ChatHeroAnalyticsEvent =
  | 'chat_started'
  | 'platforms_selected'
  | 'pain_point_selected'
  | 'demo_completed'
  | 'signup_clicked';

const CHAT_HERO_TO_PRODUCT: Partial<Record<ChatHeroAnalyticsEvent, ProductAnalyticsEvent>> = {
  chat_started: 'chat_started',
  platforms_selected: 'platforms_selected',
  signup_clicked: 'signup_modal_opened',
};

export function trackChatHeroEvent(
  event: ChatHeroAnalyticsEvent,
  properties?: Record<string, string | string[] | number | boolean>
): void {
  const mapped = CHAT_HERO_TO_PRODUCT[event];
  const props: ProductAnalyticsProps = {};
  if (properties) {
    for (const [key, value] of Object.entries(properties)) {
      if (Array.isArray(value)) {
        props[key] = value.join(',');
      } else {
        props[key] = value;
      }
    }
  }
  if (mapped) {
    if (mapped === 'platforms_selected') {
      const raw = properties?.platforms;
      const platforms = Array.isArray(raw)
        ? raw.map((p) => String(p))
        : typeof raw === 'string'
          ? raw.split(',').map((p) => p.trim()).filter(Boolean)
          : [];
      if (platforms.length === 0) {
        trackProductEvent(mapped, props);
      } else {
        for (const platform of platforms) {
          trackPlatformProductEvent(mapped, platform, {
            ...props,
            platforms: platformAnalyticsSlug(platform) || platform,
          });
        }
      }
    } else {
      trackProductEvent(mapped, props);
    }
    return;
  }

  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('izop_chat_hero_analytics', { detail: { event, properties } })
  );
  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') {
    gtag('event', event, properties);
  }
}
