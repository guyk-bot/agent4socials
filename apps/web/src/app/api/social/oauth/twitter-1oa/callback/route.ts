import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTwitterOAuth1 } from '@/lib/twitter-oauth1';
import axios from 'axios';
import { Platform } from '@prisma/client';

export async function GET(request: NextRequest) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const dashboardUrl = `${baseUrl}/dashboard`;
  const accountsUrl = `${baseUrl}/dashboard/accounts`;
  const oauthToken = request.nextUrl.searchParams.get('oauth_token');
  const oauthVerifier = request.nextUrl.searchParams.get('oauth_verifier');

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_missing_params`);
  }

  const pending = await prisma.pendingTwitterOAuth1.findFirst({
    where: { requestToken: oauthToken },
    orderBy: { createdAt: 'desc' },
  });
  if (!pending) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_session_expired`);
  }

  const oauth = getTwitterOAuth1();
  if (!oauth) {
    await prisma.pendingTwitterOAuth1.deleteMany({ where: { id: pending.id } });
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_not_configured`);
  }

  const accessTokenUrl = 'https://api.twitter.com/oauth/access_token';
  const authHeader = oauth.toHeader(
    oauth.authorize(
      {
        url: accessTokenUrl,
        method: 'POST',
        data: { oauth_token: oauthToken, oauth_verifier: oauthVerifier },
      },
      { key: oauthToken, secret: pending.requestTokenSecret }
    ) as any
  );

  const res = await axios.post(
    accessTokenUrl,
    new URLSearchParams({ oauth_token: oauthToken, oauth_verifier: oauthVerifier }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...authHeader,
      },
      validateStatus: () => true,
    }
  );
  await prisma.pendingTwitterOAuth1.deleteMany({ where: { id: pending.id } });

  if (res.status !== 200) {
    console.error('[Twitter OAuth 1.0a] access_token failed', res.status, res.data);
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_exchange_failed`);
  }
  const params = Object.fromEntries(new URLSearchParams(res.data as string));
  const accessToken = params.oauth_token;
  const accessTokenSecret = params.oauth_token_secret;
  if (!accessToken || !accessTokenSecret) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_no_tokens`);
  }

  const account = await prisma.socialAccount.findFirst({
    where: { userId: pending.userId, platform: Platform.TWITTER },
  });
  if (!account) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_no_account`);
  }

  const credentialsJson = (account.credentialsJson as Record<string, unknown>) ?? {};
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      credentialsJson: {
        ...credentialsJson,
        twitterOAuth1AccessToken: accessToken,
        twitterOAuth1AccessTokenSecret: accessTokenSecret,
      },
    },
  });

  return NextResponse.redirect(`${dashboardUrl}?twitter_1oa=ok`);
}
