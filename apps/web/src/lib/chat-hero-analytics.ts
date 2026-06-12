/** Landing chat hero analytics: Vercel custom events + gtag. */

import { trackProductEvent, type ProductAnalyticsEvent, type ProductAnalyticsProps } from '@/lib/product-analytics';

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
    trackProductEvent(mapped, props);
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
