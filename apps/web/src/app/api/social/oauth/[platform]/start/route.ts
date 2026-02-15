import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { Platform } from '@prisma/client';

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const;

function getOAuthUrl(platform: Platform, userId: string, method?: string): string {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const callbackUrl = `${baseUrl}/api/social/oauth/${platform.toLowerCase()}/callback`;
  const state =
    platform === 'INSTAGRAM' && method === 'instagram'
      ? `${userId}:instagram`
      : platform === 'LINKEDIN' && method === 'page'
        ? `${userId}:linkedin_page`
        : userId;

  switch (platform) {
    case 'INSTAGRAM':
      if (method === 'instagram') {
        const igClientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
        const scope = 'instagram_business_basic,instagram_business_content_publish,instagram_business_manage_messages,instagram_business_manage_insights';
        const redirectUri = (process.env.INSTAGRAM_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
        return `https://www.instagram.com/oauth/authorize?client_id=${igClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}`;
      }
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI || callbackUrl)}&state=${state}&scope=instagram_basic,instagram_content_publish,instagram_manage_messages,instagram_manage_insights,pages_read_engagement,pages_show_list,business_management`;
    case 'TIKTOK':
      return `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || callbackUrl)}&state=${state}`;
    case 'YOUTUBE': {
      const ytRedirect = (process.env.YOUTUBE_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(ytRedirect)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.readonly&access_type=offline&state=${state}&prompt=consent`;
    }
    case 'FACEBOOK': {
      // read_insights and pages_messaging are currently rejected by Meta as "Invalid Scopes" in the OAuth dialog.
      // We request the minimum needed to get a Page token; add those in App Dashboard (Products) if you need insights/inbox.
      const fbRedirectUri = (process.env.FACEBOOK_REDIRECT_URI || callbackUrl).replace(/\/+$/, '');
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(fbRedirectUri)}&state=${state}&scope=pages_read_engagement,pages_show_list,business_management`;
    }
    case 'TWITTER':
      return `https://twitter.com/i/oauth2/authorize?client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI || callbackUrl)}&response_type=code&scope=tweet.read%20tweet.write%20users.read%20dm.read%20dm.write%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    case 'LINKEDIN': {
      const linkedInScopes =
        method === 'page'
          ? 'openid profile email w_member_social r_organization_social w_organization_social'
          : 'openid profile email w_member_social';
      return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI || callbackUrl)}&state=${encodeURIComponent(state)}&scope=${encodeURIComponent(linkedInScopes)}`;
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
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    const { platform } = await params;
    const plat = platform?.toUpperCase() as Platform;
    if (!plat || !PLATFORMS.includes(plat)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    const method = request.nextUrl.searchParams.get('method') ?? undefined;

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
    }
    const url = getOAuthUrl(plat, userId, method);
    return NextResponse.json({ url });
  } catch (e) {
    const err = e as Error;
    const msg = (err?.message ?? String(e)).toLowerCase();
    console.error('[Social OAuth] start error:', err?.message ?? e);
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
