'use client';

import { track } from '@vercel/analytics';
import { readFunnelSessionToken } from '@/lib/funnel-session-client';

export type ProductAnalyticsEvent =
  | 'chat_started'
  | 'platforms_selected'
  | 'connect_started'
  | 'connect_completed'
  | 'connect_failed'
  | 'connect_abandoned'
  | 'signup_modal_opened'
  | 'signin_modal_opened'
  | 'funnel_signin_after_connect'
  | 'funnel_publish_attempted'
  | 'funnel_insights_attempted'
  | 'funnel_pricing_question'
  | 'pricing_page_viewed'
  | 'pricing_section_viewed'
  | 'pricing_plan_clicked'
  | 'pricing_billing_interval_changed'
  | 'nav_pricing_clicked'
  | 'page_engagement';

type AnalyticsValue = string | number | boolean | null | undefined;

export type ProductAnalyticsProps = Record<string, AnalyticsValue>;

function baseProps(extra?: ProductAnalyticsProps): ProductAnalyticsProps {
  const funnelSessionId = readFunnelSessionToken();
  return {
    ...(funnelSessionId ? { funnel_session_id: funnelSessionId } : {}),
    ...extra,
  };
}

/** Slug for Vercel event names (Events panel lists names, not property values). */
export function platformAnalyticsSlug(platform: string | null | undefined): string {
  if (!platform?.trim()) return '';
  const normalized = platform.trim().toLowerCase();
  const map: Record<string, string> = {
    twitter: 'x',
    'twitter/x': 'x',
  };
  const key = map[normalized] ?? normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return key.slice(0, 48);
}

function emitAnalyticsEvent(event: string, payload: ProductAnalyticsProps): void {
  try {
    track(event, payload);
  } catch {
    // Analytics must never break UX.
  }

  window.dispatchEvent(
    new CustomEvent('izop_product_analytics', { detail: { event, properties: payload } })
  );

  const gtag = (window as Window & { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === 'function') {
    gtag('event', event, payload);
  }
}

/** Vercel Web Analytics custom event (anonymous funnel + site-wide counts). */
export function trackProductEvent(
  event: ProductAnalyticsEvent,
  properties?: ProductAnalyticsProps
): void {
  if (typeof window === 'undefined') return;
  emitAnalyticsEvent(event, baseProps(properties));
}

/**
 * Track an event plus a platform-suffixed copy (e.g. connect_started_threads).
 * Vercel's Events list shows event names only; suffixed names make the platform visible there.
 */
export function trackPlatformProductEvent(
  event: ProductAnalyticsEvent,
  platform: string | null | undefined,
  properties?: ProductAnalyticsProps
): void {
  if (typeof window === 'undefined') return;
  const slug = platformAnalyticsSlug(platform);
  const payload = baseProps({
    ...properties,
    ...(slug ? { platform: slug } : {}),
  });
  emitAnalyticsEvent(event, payload);
  if (slug) {
    emitAnalyticsEvent(`${event}_${slug}`, payload);
  }
}

/** Record a signed-in user action in Supabase (via API). Fire-and-forget. */
export async function recordAuthenticatedProductEvent(
  event: string,
  properties?: Record<string, AnalyticsValue>
): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    const { getSupabaseBrowser } = await import('@/lib/supabase/client');
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return;

    void fetch('/api/user/product-events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event, properties }),
    }).catch(() => {});
  } catch {
    // Non-blocking.
  }
}
