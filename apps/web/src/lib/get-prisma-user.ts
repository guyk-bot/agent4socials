import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/db';
import { trackUsage } from '@/lib/usage-tracking';

/**
 * Resolves the request's Bearer token to a Prisma User id.
 * Requires DATABASE_URL and a synced User row (supabaseId).
 *
 * On success, increments **`api_request`** in `usage_daily` (fire-and-forget) so you can
 * monitor per-user API volume vs Vercel invocations. Set **`USAGE_METER_DISABLE=1`** to turn off.
 */
export async function getPrismaUserIdFromRequest(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  // Do NOT Promise.race prisma here: the query keeps running until pool_timeout anyway,
  // so racing only returns 401 early while still occupying a pool waiter (worse under load).
  // Fast fail is controlled by DATABASE_POOL_TIMEOUT_SEC on the URL (see db.ts).
  let dbUser: { id: string } | null = null;
  try {
    dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  } catch (e) {
    console.error('[getPrismaUserIdFromRequest] DB error:', (e as Error)?.message?.slice(0, 200));
    return null;
  }
  const id = dbUser?.id ?? null;
  if (id && process.env.USAGE_METER_DISABLE !== '1') {
    trackUsage(id, 'api_request');
  }
  return id;
}
