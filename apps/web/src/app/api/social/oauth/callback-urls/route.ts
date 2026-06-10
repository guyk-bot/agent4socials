import { NextResponse } from 'next/server';
import { resolveAppBaseUrl, CANONICAL_APP_ORIGIN } from '@/lib/app-base-url';
import { allOAuthCallbackUrls } from '@/lib/oauth-callback-urls';

export const dynamic = 'force-dynamic';

/** Public list of OAuth redirect URIs (no secrets). Whitelist these in each platform developer console. */
export async function GET() {
  const baseUrl = resolveAppBaseUrl();
  const callbacks = allOAuthCallbackUrls();

  return NextResponse.json({
    canonicalOrigin: CANONICAL_APP_ORIGIN,
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
      'After migrating from izop.io or agent4socials.com, remove old domains or add izop.ai URLs alongside them.',
      'Funnel chat connect uses the same OAuth URLs as the dashboard Connect flow.',
    ],
  });
}
