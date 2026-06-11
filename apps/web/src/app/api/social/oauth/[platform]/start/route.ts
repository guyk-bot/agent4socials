import { NextRequest, NextResponse } from 'next/server';
import { resolveAppBaseUrl, resolveOAuthRedirectOrigin } from '@/lib/app-base-url';
import {
  getPrismaUserIdFromRequest,
  getSupabaseUserIdFromAuthHeader,
  OAUTH_STATE_SUPABASE_PREFIX,
  resolvePrismaUserIdFromOAuthState,
} from '@/lib/get-prisma-user';
import { FUNNEL_SESSION_COOKIE, resolveFunnelGuestUserId } from '@/lib/funnel-guest';
import { databaseUrlLooksDirect, isPrismaPoolError, prisma } from '@/lib/db';
import { getTwitterOAuth1 } from '@/lib/twitter-oauth1';
import axios from 'axios';
import { Platform } from '@prisma/client';
import { META_GRAPH_FACEBOOK_API_VERSION } from '@/lib/meta-graph-insights';
import {
  buildThreadsOAuthAuthorizeUrl,
  revokeThreadsAppAuthorization,
  threadsAppId,
  threadsAppSecret,
  threadsOAuthForceFullConsentEnabled,
} from '@/lib/threads/threads-api';
import {
  buildLinkedInOAuthAuthorizationUrl,
} from '@/lib/linkedin/build-oauth-authorization-url';
import { prepareLinkedInOAuthConnect } from '@/lib/linkedin/prepare-oauth-connect';
import {
  buildTwitterOAuth2AuthorizeUrl,
  createTwitterOAuthPkce,
  defaultTwitterOAuthScopes,
  resolveTwitterOAuthCallbackUrl,
} from '@/lib/twitter/oauth-pkce';
import type { LinkedInConnectMethod } from '@/lib/linkedin/oauth-scopes';

/** OAuth start must never be statically cached. */
export const dynamic = 'force-dynamic';

async function prismaUserIdFromOAuthStateKey(oauthStateKey: string): Promise<string | null> {
  if (oauthStateKey.startsWith(OAUTH_STATE_SUPABASE_PREFIX)) {
    return resolvePrismaUserIdFromOAuthState(oauthStateKey);
  }
  const funnelIdx = oauthStateKey.indexOf(':funnel:');
  if (funnelIdx >= 0) return oauthStateKey.slice(0, funnelIdx);
  return oauthStateKey;
}

/** When recording App Review, revoke Meta-side grant so Threads shows the full permission form. */
async function revokeThreadsGrantForAppReview(oauthStateKey: string): Promise<void> {
  const prismaUserId = await prismaUserIdFromOAuthStateKey(oauthStateKey);
  if (!prismaUserId) return;
  const account = await prisma.socialAccount.findFirst({
    where: {
      userId: prismaUserId,
      platform: 'THREADS',
      status: 'connected',
      accessToken: { not: '' },
    },
    select: { accessToken: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (!account?.accessToken) return;
  try {
    const ok = await revokeThreadsAppAuthorization(account.accessToken);
    console.info('[Threads OAuth] App Review revoke before connect', { prismaUserId, ok });
  } catch (e) {
    console.warn('[Threads OAuth] App Review revoke failed:', (e as Error)?.message?.slice(0, 120));
  }
}

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN', 'PINTEREST', 'THREADS'] as const;

function getOAuthUrl(
  platform: Platform,
  userId: string,
  method?: string,
  step?: string,
  options?: { threadsSwitchAccount?: boolean; threadsForceFullConsent?: boolean }
): string {
  const oauthOrigin = resolveOAuthRedirectOrigin();
  const callbackUrl = `${oauthOrigin}/api/social/oauth/${platform.toLowerCase()}/callback`;
  const state =
    platform === 'INSTAGRAM' && method === 'instagram'
      ? `${userId}:instagram`
      : platform === 'LINKEDIN' && step === 'identify' && method === 'page'
        ? `${userId}:linkedin_identify:page`
        : platform === 'LINKEDIN' && step === 'identify' && method === 'personal'
          ? `${userId}:linkedin_identify:personal`
          : platform === 'LINKEDIN' && method === 'page'
        ? `${userId}:linkedin_page`
        : platform === 'LINKEDIN' && method === 'personal'
          ? `${userId}:linkedin_personal`
          : platform === 'TIKTOK' && method === 'business'
            ? `${userId}:tiktok_business`
            : platform === 'TIKTOK' && method === 'personal'
              ? `${userId}:tiktok_personal`
              : userId;

  switch (platform) {
    case 'INSTAGRAM':
      if (method === 'instagram') {
        const igClientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
        const scope = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_insights,instagram_business_manage_comments';
        const redirectUri = (process.env.INSTAGRAM_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
        return `https://www.instagram.com/oauth/authorize?client_id=${igClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      }
      // Instagram via Facebook Login: default scope omits pages_manage_posts and pages_manage_engagement so Connect works
      // without adding them in Meta first. For Page posting and comment management, add those in Meta → App Review, then set
      // INSTAGRAM_VIA_FACEBOOK_OAUTH_SCOPES to the full list including pages_manage_posts,pages_manage_engagement.
      const defaultIgFbScope = 'instagram_content_publish,instagram_basic,pages_read_engagement,pages_show_list,instagram_manage_messages,instagram_manage_insights,instagram_manage_comments,pages_messaging,pages_read_user_content,business_management';
      const igFbScope = (typeof process.env.INSTAGRAM_VIA_FACEBOOK_OAUTH_SCOPES === 'string' && process.env.INSTAGRAM_VIA_FACEBOOK_OAUTH_SCOPES.trim())
        ? process.env.INSTAGRAM_VIA_FACEBOOK_OAUTH_SCOPES.trim()
        : defaultIgFbScope;
      return `https://www.facebook.com/${META_GRAPH_FACEBOOK_API_VERSION}/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI || callbackUrl)}&state=${state}&scope=${encodeURIComponent(igFbScope)}`;
    case 'TIKTOK': {
      const tiktokRedirect = (process.env.TIKTOK_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      // video.list = list user's videos for sync; user.info.basic = profile/avatar; user.info.stats = follower count
      const oauthParams = new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || '',
        scope: 'user.info.basic,user.info.stats,video.upload,video.publish,video.list',
        response_type: 'code',
        redirect_uri: tiktokRedirect,
        state,
        // Always show TikTok's login page so the user can pick the sandbox target account.
        // Without this, TikTok auto-authenticates with whatever account is already logged in
        // the browser; if that account isn't a sandbox target user it immediately errors with
        // non_sandbox_target before the user ever sees a login form.
        disable_auto_auth: '1',
      });
      return `https://www.tiktok.com/v2/auth/authorize/?${oauthParams.toString()}`;
    }
    case 'YOUTUBE': {
      const ytRedirect = (process.env.YOUTUBE_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      // youtube.readonly = channel details, list comments/videos; youtube.upload = publish videos; youtube.force-ssl = reply to comments; yt-analytics.readonly = Analytics reports; youtube.download = download own public videos
      const ytScopes = [
        'https://www.googleapis.com/auth/youtube.readonly',
        'https://www.googleapis.com/auth/youtube.upload',
        'https://www.googleapis.com/auth/youtube.force-ssl',
        'https://www.googleapis.com/auth/yt-analytics.readonly',
        'https://www.googleapis.com/auth/youtube.download',
      ].map((s) => encodeURIComponent(s)).join('%20');
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(ytRedirect)}&response_type=code&scope=${ytScopes}&access_type=offline&state=${state}&prompt=consent`;
    }
    case 'FACEBOOK': {
      // Default scope omits pages_manage_posts and pages_manage_engagement so Connect works without adding them in Meta first.
      // For Page posting and comment management, add those permissions in Meta → App Review → Permissions and features, then set FACEBOOK_OAUTH_SCOPES to the full list (see OAUTH_SETUP.md).
      const defaultFbScope = 'pages_read_engagement,pages_show_list,pages_messaging,pages_read_user_content,read_insights,business_management';
      const fbScope = (typeof process.env.FACEBOOK_OAUTH_SCOPES === 'string' && process.env.FACEBOOK_OAUTH_SCOPES.trim())
        ? process.env.FACEBOOK_OAUTH_SCOPES.trim()
        : defaultFbScope;
      const fbRedirectUri = (process.env.FACEBOOK_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      return `https://www.facebook.com/${META_GRAPH_FACEBOOK_API_VERSION}/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(fbRedirectUri)}&state=${state}&scope=${encodeURIComponent(fbScope)}`;
    }
    case 'TWITTER': {
      // Full "Send and manage Direct Messages" consent (group conversations, delete, react) requires dm.read + dm.write.
      // Ensure the app has "Read and write" Direct Messages in X Developer Portal → App → Settings → User authentication settings.
      // media.write is required for OAuth 2.0 v2 media upload (images/videos); without it X may return “Application-Only” on upload.
      const defaultTwitterScope = 'tweet.read tweet.write users.read media.write dm.read dm.write offline.access';
      const twitterScope = (typeof process.env.TWITTER_OAUTH_SCOPES === 'string' && process.env.TWITTER_OAUTH_SCOPES.trim())
        ? process.env.TWITTER_OAUTH_SCOPES.trim()
        : defaultTwitterScope;
      return `https://twitter.com/i/oauth2/authorize?client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI || callbackUrl)}&response_type=code&scope=${encodeURIComponent(twitterScope)}&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    }
    case 'LINKEDIN': {
      const linkedInMethod =
        method === 'page' || method === 'personal' ? (method as LinkedInConnectMethod) : undefined;
      if (!linkedInMethod) {
        throw new Error('LinkedIn connect requires method=personal or method=page');
      }
      return buildLinkedInOAuthAuthorizationUrl(userId, {
        method: linkedInMethod,
        step:
          step === 'identify' ? 'identify' : step === 'consent' ? 'consent' : 'connect',
      });
    }
    case 'THREADS': {
      return buildThreadsOAuthAuthorizeUrl({
        state,
        switchAccount: options?.threadsSwitchAccount,
        forceFullConsent: options?.threadsForceFullConsent,
      });
    }
    case 'PINTEREST': {
      const pinRedirect = (process.env.PINTEREST_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      const defaultScopes =
        'user_accounts:read,pins:read,boards:read,pins:write,boards:write';
      const scope =
        typeof process.env.PINTEREST_OAUTH_SCOPES === 'string' && process.env.PINTEREST_OAUTH_SCOPES.trim()
          ? process.env.PINTEREST_OAUTH_SCOPES.trim()
          : defaultScopes;
      const clientId = encodeURIComponent(
        process.env.PINTEREST_APP_ID || process.env.PINTEREST_CLIENT_ID || ''
      );
      return `https://www.pinterest.com/oauth/?client_id=${clientId}&redirect_uri=${encodeURIComponent(pinRedirect)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&refreshable=true`;
    }
    default:
      throw new Error('Unsupported platform');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: 'Social OAuth requires DATABASE_URL' }, { status: 503 });
    }
    if (databaseUrlLooksDirect) {
      return NextResponse.json(
        {
          message:
            'Database: use the Supabase Transaction pooler to avoid "max connections" errors. In Supabase: Project → Settings → Database → Connection string → choose "Transaction" (port 6543). Set that URI as DATABASE_URL in Vercel (URL-encode the password, e.g. @ → %40). Add ?pgbouncer=true if not in the string. Redeploy. See: https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler',
        },
        { status: 503 }
      );
    }
    const { platform } = await params;
    const plat = platform?.toUpperCase() as Platform;
    if (!plat || !PLATFORMS.includes(plat)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    const method = request.nextUrl.searchParams.get('method') ?? undefined;
    const step = request.nextUrl.searchParams.get('step') ?? undefined;

    const authHeader = request.headers.get('authorization');
    const funnelMode = request.nextUrl.searchParams.get('funnel') === '1';
    const funnelToken =
      request.headers.get('x-funnel-session')?.trim() ||
      request.cookies.get(FUNNEL_SESSION_COOKIE)?.value?.trim() ||
      null;

    let oauthStateKey: string;
    if (funnelMode) {
      const guestUserId = await resolveFunnelGuestUserId(funnelToken);
      if (!guestUserId) {
        return NextResponse.json({ message: 'Invalid or expired funnel session. Refresh and try again.' }, { status: 401 });
      }
      // Funnel always binds OAuth to the guest profile so the pre-signup flow can be tested end-to-end.
      oauthStateKey = funnelToken ? `${guestUserId}:funnel:${funnelToken}` : guestUserId;
    } else if (plat === 'THREADS') {
      const supabaseUserId = await getSupabaseUserIdFromAuthHeader(authHeader);
      if (!supabaseUserId) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      oauthStateKey = `${OAUTH_STATE_SUPABASE_PREFIX}${supabaseUserId}`;
    } else {
      const userId = await getPrismaUserIdFromRequest(authHeader);
      if (!userId) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }
      oauthStateKey = userId;
    }

    if (plat === 'INSTAGRAM' && method === 'instagram') {
      const igId = process.env.INSTAGRAM_APP_ID?.trim() || process.env.META_APP_ID?.trim();
      const igSecret = process.env.INSTAGRAM_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim();
      if (!igId || !igSecret) {
        return NextResponse.json(
          { message: 'Connect with Instagram (no Facebook) requires INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET (or META_APP_ID and META_APP_SECRET) in Vercel.' },
          { status: 503 }
        );
      }
    } else if (plat === 'INSTAGRAM' || plat === 'FACEBOOK') {
      const hasMetaId = Boolean(process.env.META_APP_ID?.trim());
      const hasMetaSecret = Boolean(process.env.META_APP_SECRET?.trim());
      if (!hasMetaId || !hasMetaSecret) {
        console.error('[Social OAuth] Missing META vars:', { hasMetaId, hasMetaSecret });
        return NextResponse.json(
          {
            message:
              'Instagram/Facebook: META_APP_ID and META_APP_SECRET must be set for Production in Vercel → Settings → Environment Variables. If they are set, ensure each variable is enabled for "Production" and redeploy.',
          },
          { status: 503 }
        );
      }
    } else if (plat === 'TWITTER') {
      // X (Twitter) is allowed for every plan; do not add a tier/Stripe gate here.
      // Prefer OAuth 2.0 PKCE (recommended for DMs: Bearer token for GET /2/dm_events and POST send).
      const twitterClientId = process.env.TWITTER_CLIENT_ID?.trim();
      const apiKey = process.env.TWITTER_API_KEY?.trim();
      const apiSecret = process.env.TWITTER_API_SECRET?.trim();
      if (twitterClientId) {
        const { verifier, challenge } = createTwitterOAuthPkce();
        await prisma.pendingConnection.deleteMany({
          where: { userId: oauthStateKey, platform: 'TWITTER' },
        });
        await prisma.pendingConnection.create({
          data: {
            userId: oauthStateKey,
            platform: 'TWITTER',
            payload: { pkceVerifier: verifier, oauthVersion: '2' },
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
        const baseUrl = resolveAppBaseUrl();
        const url = buildTwitterOAuth2AuthorizeUrl({
          userId: oauthStateKey,
          codeChallenge: challenge,
          baseUrl,
        });
        const redirectUri = resolveTwitterOAuthCallbackUrl(baseUrl);
        return NextResponse.json({
          url,
          redirectUri,
          scopes: defaultTwitterOAuthScopes(),
        });
      } else if (apiKey && apiSecret) {
        // Fallback: OAuth 1.0a when only API Key/Secret are set.
        const baseUrl = resolveAppBaseUrl();
        const callbackUrl = `${baseUrl}/api/social/oauth/twitter-1oa/callback`;
        const oauth = getTwitterOAuth1();
        if (!oauth) return NextResponse.json({ message: 'Twitter OAuth 1.0a not configured' }, { status: 503 });
        const requestTokenUrl = 'https://api.twitter.com/oauth/request_token';
        const authHeader = oauth.toHeader(
          oauth.authorize(
            { url: requestTokenUrl, method: 'POST', data: { oauth_callback: callbackUrl } },
            undefined as any
          ) as any
        );
        const res = await axios.post(requestTokenUrl, new URLSearchParams({ oauth_callback: callbackUrl }).toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...authHeader },
          validateStatus: () => true,
        });
        if (res.status !== 200) {
          const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
          console.error('[Twitter OAuth 1.0a] request_token failed', res.status, body);
          return NextResponse.json(
            { message: 'Twitter request token failed (HTTP ' + res.status + '). Add Callback URL in X Developer Portal: ' + callbackUrl },
            { status: 502 }
          );
        }
        const params = Object.fromEntries(new URLSearchParams(res.data as string));
        const requestToken = params.oauth_token;
        const requestTokenSecret = params.oauth_token_secret;
        if (!requestToken || !requestTokenSecret) {
          return NextResponse.json({ message: 'Twitter did not return a request token' }, { status: 502 });
        }
        await prisma.pendingConnection.create({
          data: { userId: oauthStateKey, platform: 'TWITTER', payload: { requestToken, requestTokenSecret } },
        });
        const authorizeUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}`;
        return NextResponse.json({ url: authorizeUrl });
      } else {
        return NextResponse.json(
          {
            message:
              'X (Twitter) Connect requires TWITTER_CLIENT_ID (OAuth 2.0, recommended for DMs) or TWITTER_API_KEY + TWITTER_API_SECRET (OAuth 1.0a) in Vercel.',
          },
          { status: 503 }
        );
      }
    } else if (plat === 'THREADS') {
      if (!threadsAppId() || !threadsAppSecret()) {
        return NextResponse.json(
          {
            message:
              'Threads is not configured. In Meta → your app → Threads settings → Basic, copy Threads App ID and Threads App Secret into Vercel as THREADS_APP_ID and THREADS_APP_SECRET (or META_APP_ID and META_APP_SECRET if you use one Meta app for everything). Enable Production, then redeploy.',
          },
          { status: 503 }
        );
      }
    } else if (plat === 'PINTEREST') {
      const pid = process.env.PINTEREST_APP_ID?.trim() || process.env.PINTEREST_CLIENT_ID?.trim();
      const psec = process.env.PINTEREST_APP_SECRET?.trim() || process.env.PINTEREST_CLIENT_SECRET?.trim();
      if (!pid || !psec) {
        return NextResponse.json(
          {
            message:
              'Pinterest requires PINTEREST_APP_ID and PINTEREST_APP_SECRET (or PINTEREST_CLIENT_ID and PINTEREST_CLIENT_SECRET) in Vercel.',
          },
          { status: 503 }
        );
      }
    }
    if (plat === 'LINKEDIN') {
      const linkedInStep =
        step === 'identify' ? 'identify' : step === 'consent' ? 'consent' : 'connect';
      if (linkedInStep === 'identify' || linkedInStep === 'consent') {
        const reconnectAccountId =
          request.nextUrl.searchParams.get('reconnect_account_id')?.trim() || undefined;
        await prepareLinkedInOAuthConnect(oauthStateKey, { reconnectAccountId });
      }
    }
    const threadsSwitchAccount =
      plat === 'THREADS' && request.nextUrl.searchParams.get('switch_account') === '1';
    const threadsForceFullConsent =
      plat === 'THREADS' &&
      (threadsOAuthForceFullConsentEnabled() ||
        request.nextUrl.searchParams.get('force_full_consent') === '1');
    if (threadsForceFullConsent) {
      await revokeThreadsGrantForAppReview(oauthStateKey);
    }
    const url = getOAuthUrl(plat, oauthStateKey, method, step, {
      threadsSwitchAccount,
      threadsForceFullConsent,
    });
    if (plat === 'THREADS') {
      const parsed = new URL(url);
      const clientId = parsed.searchParams.get('client_id')?.trim();
      if (!clientId) {
        console.error('[Social OAuth] Threads authorize URL missing client_id');
        return NextResponse.json(
          {
            message:
              'Threads App ID is missing on the server. Set THREADS_APP_ID and THREADS_APP_SECRET in Vercel (from Meta → Threads → Basic), enable Production, and redeploy.',
          },
          { status: 503 }
        );
      }
      const redirectUri = decodeURIComponent(parsed.searchParams.get('redirect_uri') || '');
      return NextResponse.json({
        url,
        redirectUri,
        forceFullConsent: threadsForceFullConsent,
      });
    }
    return NextResponse.json({ url });
  } catch (e) {
    const err = e as Error;
    const msg = (err?.message ?? String(e)).toLowerCase();
    console.error('[Social OAuth] start error:', err?.message ?? e);
    if (isPrismaPoolError(e)) {
      return NextResponse.json(
        {
          message:
            'Database is busy right now. Close extra dashboard tabs, wait 30 seconds, then try Connect again.',
        },
        { status: 503 }
      );
    }
    // Schema / missing table (e.g. User table dropped by 002_single_users_table)
    if (msg.includes('does not exist') || msg.includes('relation') || msg.includes('p2021')) {
      return NextResponse.json(
        {
          message:
            'Database schema error: the User table may be missing. If you ran the single-users migration (002), the app still needs the Prisma User and SocialAccount tables. Run: cd apps/web && npx prisma migrate deploy to restore them, or revert that migration.',
        },
        { status: 503 }
      );
    }
    // Database authentication rejected (wrong password, wrong pooler, project paused)
    if (msg.includes('authentication failed')) {
      return NextResponse.json(
        {
          message:
            'Database authentication failed. In Supabase: use the Transaction pooler connection string (port 6543). Copy the password from that dialog (it may differ from the direct DB password), URL-encode special characters (e.g. @ → %40). Ensure the project is not paused.',
        },
        { status: 503 }
      );
    }
    // Max connections: use pooler so serverless does not exhaust DB connections
    if (msg.includes('max client connections') || msg.includes('max_client_connections') || msg.includes('too many clients')) {
      return NextResponse.json(
        {
          message:
            'Database: max connections reached. Use the Supabase Transaction pooler: Project → Settings → Database → Connection string → "Transaction" (port 6543). Set that as DATABASE_URL in Vercel (URL-encode password), add ?pgbouncer=true if needed, then redeploy. https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler',
        },
        { status: 503 }
      );
    }
    // Real connection failures only (not every Prisma error)
    if (
      msg.includes("can't reach database") ||
      msg.includes('connection refused') ||
      msg.includes('econnrefused') ||
      msg.includes('p1001') ||
      msg.includes('p1012') ||
      msg.includes('connection string') ||
      msg.includes('invalid connection')
    ) {
      return NextResponse.json(
        {
          message:
            'Database connection failed. Use Supabase Transaction pooler (port 6543, not 5432) and URL-encode the password in DATABASE_URL (e.g. @ → %40).',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { message: `OAuth could not start: ${(err?.message ?? String(e)).slice(0, 120)}. Check Vercel → Logs for full error.` },
      { status: 503 }
    );
  }
}
