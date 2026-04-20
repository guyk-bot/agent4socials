import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getTwitterOAuth1, signTwitterRequest } from '@/lib/twitter-oauth1';
import axios from 'axios';

export async function GET(request: NextRequest) {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const dashboardUrl = `${baseUrl}/dashboard`;
  const oauthToken = request.nextUrl.searchParams.get('oauth_token');
  const oauthVerifier = request.nextUrl.searchParams.get('oauth_verifier');

  if (!oauthToken || !oauthVerifier) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_missing_params`);
  }

  const candidates = await prisma.pendingConnection.findMany({
    where: { platform: 'TWITTER' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  const pending = candidates.find((c) => (c.payload as { requestToken?: string })?.requestToken === oauthToken);
  if (!pending) {
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_session_expired`);
  }
  const pPayload = pending.payload as { requestToken?: string; requestTokenSecret?: string };

  const oauth = getTwitterOAuth1();
  if (!oauth) {
    await prisma.pendingConnection.deleteMany({ where: { id: pending.id } });
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
      { key: oauthToken, secret: pPayload.requestTokenSecret ?? '' }
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
  await prisma.pendingConnection.deleteMany({ where: { id: pending.id } });

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

  // Fetch X user id and username with OAuth 1.0a so we can create or update the account
  const usersMeUrl = 'https://api.x.com/2/users/me';
  const userFields = { 'user.fields': 'id,username,name' };
  let platformUserId: string;
  let username: string | null = null;
  try {
    const meHeaders = signTwitterRequest('GET', usersMeUrl, { key: accessToken, secret: accessTokenSecret }, userFields);
    const meRes = await axios.get<{ data?: { id?: string; username?: string; name?: string }; errors?: unknown[] }>(usersMeUrl, {
      params: userFields,
      headers: meHeaders,
      timeout: 10_000,
      validateStatus: () => true,
    });
    if (meRes.status !== 200 || !meRes.data?.data?.id) {
      console.error('[Twitter OAuth 1.0a] users/me failed', meRes.status, meRes.data);
      return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_user_lookup_failed`);
    }
    platformUserId = String(meRes.data.data.id);
    username = meRes.data.data.username ?? null;
  } catch (e) {
    console.error('[Twitter OAuth 1.0a] users/me error', e);
    return NextResponse.redirect(`${dashboardUrl}?error=twitter_1oa_user_lookup_failed`);
  }

  const oauth1Creds = {
    twitterOAuth1AccessToken: accessToken,
    twitterOAuth1AccessTokenSecret: accessTokenSecret,
  };

  const existing = await prisma.socialAccount.findFirst({
    where: { userId: pending.userId, platform: 'TWITTER', platformUserId },
    select: { id: true, accessToken: true, credentialsJson: true },
  });

  if (existing) {
    const prevCreds =
      existing.credentialsJson && typeof existing.credentialsJson === 'object' && existing.credentialsJson !== null
        ? { ...(existing.credentialsJson as Record<string, unknown>) }
        : {};
    // Merge OAuth1 media creds into existing credentialsJson so we keep grantedScope etc.
    // Do NOT overwrite the OAuth2 Bearer accessToken (required to POST /2/tweets). If the
    // existing row for some reason has no Bearer yet, fall back to the OAuth1 sentinel
    // so the media-only path still works for legacy rows.
    const nextAccessToken =
      existing.accessToken && existing.accessToken !== 'oauth1' ? existing.accessToken : 'oauth1';
    await prisma.socialAccount.update({
      where: { id: existing.id },
      data: {
        platformUserId,
        username: username ?? platformUserId ?? '',
        credentialsJson: { ...prevCreds, ...oauth1Creds },
        accessToken: nextAccessToken,
        status: 'connected',
        disconnectedAt: null,
      },
    });
    return NextResponse.redirect(`${dashboardUrl}?accountId=${encodeURIComponent(existing.id)}&connecting=1`);
  }

  // No prior row for this platformUserId (rare: OAuth1 flow ran before OAuth2).
  // Check if there is ANY TWITTER account for this user we should merge into.
  const anyExisting = await prisma.socialAccount.findFirst({
    where: { userId: pending.userId, platform: 'TWITTER' },
    select: { id: true, accessToken: true, credentialsJson: true },
  });
  if (anyExisting) {
    const prevCreds =
      anyExisting.credentialsJson && typeof anyExisting.credentialsJson === 'object' && anyExisting.credentialsJson !== null
        ? { ...(anyExisting.credentialsJson as Record<string, unknown>) }
        : {};
    const nextAccessToken =
      anyExisting.accessToken && anyExisting.accessToken !== 'oauth1' ? anyExisting.accessToken : 'oauth1';
    await prisma.socialAccount.update({
      where: { id: anyExisting.id },
      data: {
        platformUserId,
        username: username ?? platformUserId ?? '',
        credentialsJson: { ...prevCreds, ...oauth1Creds },
        accessToken: nextAccessToken,
        status: 'connected',
        disconnectedAt: null,
      },
    });
    return NextResponse.redirect(`${dashboardUrl}?accountId=${encodeURIComponent(anyExisting.id)}&connecting=1`);
  }

  const created = await prisma.socialAccount.create({
    data: {
      userId: pending.userId,
      platform: 'TWITTER',
      platformUserId,
      username: username ?? platformUserId ?? '',
      credentialsJson: oauth1Creds,
      accessToken: 'oauth1',
    },
    select: { id: true },
  });
  return NextResponse.redirect(`${dashboardUrl}?accountId=${encodeURIComponent(created.id)}&connecting=1`);
}
