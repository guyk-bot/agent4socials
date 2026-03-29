import { createClient } from '@supabase/supabase-js';
import { prisma } from '@/lib/db';

/**
 * Resolves the request's Bearer token to a Prisma User id.
 * Requires DATABASE_URL and a synced User row (supabaseId).
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
  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  return dbUser?.id ?? null;
}
