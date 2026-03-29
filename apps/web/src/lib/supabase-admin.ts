import { createClient, SupabaseClient } from '@supabase/supabase-js';

let adminClient: SupabaseClient | null = null;

/**
 * Server-side only. Use for admin operations (create user, bypass RLS).
 * Requires SUPABASE_SERVICE_ROLE_KEY in env.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}
