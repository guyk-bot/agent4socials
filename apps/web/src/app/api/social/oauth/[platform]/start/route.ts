import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { Platform } from '@prisma/client';

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const;

function getOAuthUrl(platform: Platform, userId: string): string {
  const state = userId;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com';
  const callbackUrl = `${baseUrl}/api/social/oauth/${platform.toLowerCase()}/callback`;

  switch (platform) {
    case 'INSTAGRAM':
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.META_REDIRECT_URI || callbackUrl)}&state=${state}&scope=instagram_basic,instagram_content_publish,pages_read_engagement`;
    case 'TIKTOK':
      return `https://www.tiktok.com/v2/auth/authorize/?client_key=${process.env.TIKTOK_CLIENT_KEY}&scope=user.info.basic,video.upload,video.publish&response_type=code&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI || callbackUrl)}&state=${state}`;
    case 'YOUTUBE':
      return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${process.env.YOUTUBE_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.YOUTUBE_REDIRECT_URI || callbackUrl)}&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload%20https://www.googleapis.com/auth/youtube.readonly&access_type=offline&state=${state}&prompt=consent`;
    case 'FACEBOOK':
      return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${encodeURIComponent(process.env.FACEBOOK_REDIRECT_URI || callbackUrl)}&state=${state}&scope=pages_manage_posts,pages_read_engagement,pages_show_list`;
    case 'TWITTER':
      return `https://twitter.com/i/oauth2/authorize?client_id=${process.env.TWITTER_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.TWITTER_REDIRECT_URI || callbackUrl)}&response_type=code&scope=tweet.read%20tweet.write%20users.read%20offline.access&state=${state}&code_challenge=challenge&code_challenge_method=plain`;
    case 'LINKEDIN':
      return `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${process.env.LINKEDIN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.LINKEDIN_REDIRECT_URI || callbackUrl)}&state=${state}&scope=openid%20profile%20email%20w_member_social`;
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
    if (plat === 'INSTAGRAM' || plat === 'FACEBOOK') {
      if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
        return NextResponse.json(
          { message: 'Instagram/Facebook connect requires META_APP_ID and META_APP_SECRET in Vercel environment variables.' },
          { status: 503 }
        );
      }
    }
    const url = getOAuthUrl(plat, userId);
    return NextResponse.json({ url });
  } catch (e) {
    const err = e as Error;
    const msg = err?.message ?? String(e);
    console.error('[Social OAuth] start error:', msg);
    if (
      msg.includes("Can't reach database") ||
      msg.includes('connection') ||
      msg.includes('invalid') ||
      msg.includes('P1001') ||
      msg.includes('P1012')
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
      { message: 'OAuth config missing for this platform. Set the required env vars (e.g. META_APP_ID for Instagram) and redeploy.' },
      { status: 503 }
    );
  }
}
