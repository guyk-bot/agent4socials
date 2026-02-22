import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { getTwitterOAuth1 } from '@/lib/twitter-oauth1';
import axios from 'axios';

/** Start Twitter OAuth 1.0a flow to obtain credentials for media upload (v1.1 upload often requires 1.0a). */
export async function GET(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { message: 'Twitter OAuth 1.0a is not configured. Add TWITTER_API_KEY and TWITTER_API_SECRET (API Key and Secret from X Developer Portal) in Vercel.' },
      { status: 503 }
    );
  }
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
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
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...authHeader,
    },
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    console.error('[Twitter OAuth 1.0a] request_token failed', res.status, res.data);
    return NextResponse.json({ message: 'Twitter request token failed. Check TWITTER_API_KEY and TWITTER_API_SECRET.' }, { status: 502 });
  }
  const params = Object.fromEntries(new URLSearchParams(res.data as string));
  const requestToken = params.oauth_token;
  const requestTokenSecret = params.oauth_token_secret;
  if (!requestToken || !requestTokenSecret) {
    return NextResponse.json({ message: 'Twitter did not return a request token' }, { status: 502 });
  }

  await prisma.pendingTwitterOAuth1.create({
    data: { userId, requestToken, requestTokenSecret },
  });

  const authorizeUrl = `https://api.twitter.com/oauth/authorize?oauth_token=${encodeURIComponent(requestToken)}`;
  return NextResponse.json({ url: authorizeUrl });
}
