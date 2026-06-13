import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/db';
import { FIRST_CONNECT_PATH } from '@/lib/dashboard-onboarding';

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

      let redirectPath = '/dashboard';
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) {
          const dbUser = await prisma.user.findUnique({
            where: { supabaseId: user.id },
            select: { id: true },
          });
          if (!dbUser) {
            redirectPath = FIRST_CONNECT_PATH;
          } else {
            const connectedCount = await prisma.socialAccount.count({
              where: { userId: dbUser.id, status: 'connected' },
            });
            if (connectedCount === 0) redirectPath = FIRST_CONNECT_PATH;
          }
        }
      } catch (e) {
        console.error('[auth/callback] post-sign-in redirect lookup failed:', (e as Error)?.message);
      }

      return NextResponse.redirect(`${requestUrl.origin}${redirectPath}`);
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
