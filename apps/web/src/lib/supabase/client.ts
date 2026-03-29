import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Browser Supabase client that stores the PKCE code verifier in cookies.
 * Use this in Client Components and in the OAuth callback so sign-in works
 * when the auth flow finishes on a different tab or on mobile (redirect back).
 */
export function createClient() {
  return createBrowserClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key-for-build'
  );
}

// Single instance for client-side use so all components share the same cookie-backed session.
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowser() {
  if (typeof window === 'undefined') {
    return createClient();
  }
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
