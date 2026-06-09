/** Landing chat hero analytics (no API; dispatches events for gtag / future pipelines). */

export type ChatHeroAnalyticsEvent =
  | 'chat_started'
  | 'platforms_selected'
  | 'pain_point_selected'
  | 'demo_completed'
  | 'signup_clicked';

export function trackChatHeroEvent(
  event: ChatHeroAnalyticsEvent,
  properties?: Record<string, string | string[] | number | boolean>
): void {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('izop_chat_hero_analytics', { detail: { event, properties } })
  );

  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') {
    gtag('event', event, properties);
  }
}
