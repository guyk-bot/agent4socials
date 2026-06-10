import { NextResponse } from 'next/server';
import { resolveAppBaseUrl, CANONICAL_APP_ORIGIN, resolveOAuthRedirectOrigin } from '@/lib/app-base-url';
import { allOAuthCallbackUrls } from '@/lib/oauth-callback-urls';

export const dynamic = 'force-dynamic';

/** Public list of OAuth redirect URIs (no secrets). Whitelist these in each platform developer console. */
export async function GET() {
  const baseUrl = resolveAppBaseUrl();
  const oauthRedirectOrigin = resolveOAuthRedirectOrigin();
  const callbacks = allOAuthCallbackUrls();

  return NextResponse.json({
    canonicalOrigin: CANONICAL_APP_ORIGIN,
    oauthRedirectOrigin,
    baseUrl,
    callbacks,
    meta: {
      appDomains: ['izop.ai', 'www.izop.ai'],
      facebookLoginValidOAuthRedirects: [
        callbacks.instagram,
        callbacks.facebook,
        callbacks.threads,
      ],
      threadsApiSettings: {
        redirectCallback: callbacks.threads,
        uninstall: `${baseUrl}/api/social/oauth/threads/deauthorize`,
        dataDeletion: `${baseUrl}/api/social/oauth/threads/data-deletion`,
      },
    },
    google: {
      authorizedRedirectUris: [callbacks.youtube],
    },
    notes: [
      'Add each callback URL exactly (no trailing slash) in the matching developer console.',
      'Social OAuth uses oauthRedirectOrigin (typically https://izop.ai without www). Supabase Google sign-in uses www.izop.ai/auth/callback separately.',
      'Meta strict mode: redirect URI in the authorize URL must match the console entry character for character.',
      'Funnel chat connect uses the same OAuth URLs as the dashboard Connect flow.',
    ],
  });
}
