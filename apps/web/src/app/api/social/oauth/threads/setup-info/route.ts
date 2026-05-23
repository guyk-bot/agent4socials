import { NextResponse } from 'next/server';
import { threadsAppId } from '@/lib/threads/threads-api';

export const dynamic = 'force-dynamic';

/** Public Threads OAuth setup hints (no secrets). Use to match Meta redirect whitelist. */
export async function GET() {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://agent4socials.com'
  ).replace(/\/+$/, '');

  const redirectUri = (
    process.env.THREADS_REDIRECT_URI?.trim() ||
    `${baseUrl}/api/social/oauth/threads/callback`
  ).replace(/\/+$/, '');

  const appId = threadsAppId();
  const threadsOnlyId = process.env.THREADS_APP_ID?.trim() || '';
  const metaFallbackId = process.env.META_APP_ID?.trim() || '';

  return NextResponse.json({
    redirectUri,
    uninstallCallback: `${baseUrl}/api/social/oauth/threads/deauthorize`,
    dataDeletionCallback: `${baseUrl}/api/social/oauth/threads/data-deletion`,
    appIdConfigured: Boolean(appId),
    appIdSource: threadsOnlyId ? 'THREADS_APP_ID' : metaFallbackId ? 'META_APP_ID' : 'none',
    appIdSuffix: appId.length >= 4 ? appId.slice(-4) : null,
    baseUrlFromEnv: baseUrl,
    metaChecklist: [
      'Meta → Use cases → Access the Threads API → Settings: all 3 callback URLs filled and saved',
      'redirectUri below must match Redirect Callback URLs exactly (no trailing slash)',
      'THREADS_APP_ID in Vercel should be the Threads App ID from that same Meta screen (not only Facebook App ID)',
      'App settings → Basic → App domains: agent4socials.com',
      'If still blocked, also add redirectUri under Facebook Login → Settings → Valid OAuth Redirect URIs',
    ],
  });
}
