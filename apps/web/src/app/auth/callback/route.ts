import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * OAuth callback Route Handler: exchange the authorization code for a session on the server.
 * The PKCE code verifier is in the request cookies (set by the browser before redirecting to Google),
 * so the exchange works on mobile and when storage would otherwise be missing.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorDescription = requestUrl.searchParams.get('error_description');
  const errorParam = requestUrl.searchParams.get('error');

  if (errorDescription || errorParam) {
    const msg = errorDescription || errorParam || 'Sign-in failed';
    return NextResponse.redirect(`${requestUrl.origin}/login?error=${encodeURIComponent(msg)}`);
  }

  if (code) {
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return NextResponse.redirect(
          `${requestUrl.origin}/login?error=${encodeURIComponent(error.message)}`
        );
      }
      return NextResponse.redirect(`${requestUrl.origin}/dashboard`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unexpected error during sign-in';
      return NextResponse.redirect(
        `${requestUrl.origin}/login?error=${encodeURIComponent(msg)}`
      );
    }
  }

  return NextResponse.redirect(
    `${requestUrl.origin}/login?error=${encodeURIComponent('No authorization code. Try signing in again.')}`
  );
}
