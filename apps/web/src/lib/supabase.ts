import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Legacy server-side or build-time client (e.g. for API routes that don't need cookies).
 * For browser auth (login, callback, dashboard), use getSupabaseBrowser() from '@/lib/supabase/client'.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key-for-build',
  {
    auth: {
      flowType: 'pkce',
    },
  }
);
