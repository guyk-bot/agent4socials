import { prisma } from '@/lib/db';

export type UserProductEventName =
  | 'user_signed_up'
  | 'user_signed_in'
  | 'platform_connected'
  | 'platform_connect_failed'
  | 'funnel_merged'
  | 'dashboard_viewed'
  | 'composer_opened'
  | 'post_published'
  | 'post_scheduled'
  | 'analytics_viewed'
  | 'pricing_page_viewed'
  | 'pricing_plan_interest'
  | 'izop_chat_used'
  | 'inbox_opened';

type EventProps = Record<string, string | number | boolean | null | undefined>;

/** Persist a signed-in user activity event (Supabase Postgres via Prisma). */
export async function recordUserProductEvent(
  userId: string,
  event: UserProductEventName | string,
  properties?: EventProps
): Promise<void> {
  if (!userId?.trim()) return;
  try {
    await prisma.userProductEvent.create({
      data: {
        userId,
        event,
        properties: properties ? sanitizeProps(properties) : undefined,
      },
    });
  } catch (e) {
    console.error('[user-product-events] record failed', event, (e as Error)?.message);
  }
}

function sanitizeProps(props: EventProps): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = String(value);
    }
  }
  return out;
}
