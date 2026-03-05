import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase: SupabaseClient = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key-for-build',
  {
    auth: {
      // PKCE is more reliable than the implicit flow in Next.js (no hash fragment issues).
      // Google redirects back with ?code=... and the callback exchanges it for a session.
      flowType: 'pkce',
    },
  }
);
