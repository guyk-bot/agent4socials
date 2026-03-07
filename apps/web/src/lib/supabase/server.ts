import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Server Supabase client that reads/writes auth state via cookies.
 * Use in Route Handlers and Server Components so the PKCE code verifier
 * (set by the browser before redirecting to Google) is available when
 * exchanging the code on the server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    supabaseUrl || 'https://placeholder.supabase.co',
    supabaseAnonKey || 'placeholder-key-for-build',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            const store = cookieStore as { set: (name: string, value: string, options?: object) => void; delete: (name: string) => void };
            cookiesToSet.forEach(({ name, value, options }) => {
              if (value) {
                store.set(name, value, (options as object) || undefined);
              } else {
                store.delete(name);
              }
            });
          } catch {
            // Ignored when called from Server Component (read-only)
          }
        },
      },
    }
  );
}
