import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';

const PLATFORMS = ['INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'FACEBOOK', 'TWITTER', 'LINKEDIN'] as const;

type TokenResult = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  platformUserId: string;
  username: string;
  profilePicture?: string | null;
};

async function exchangeCodeInstagramLogin(code: string, callbackUrl: string): Promise<TokenResult> {
  const clientId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const clientSecret = process.env.INSTAGRAM_APP_SECRET || process.env.META_APP_SECRET;
  const r = await axios.post(
    'https://api.instagram.com/oauth/access_token',
    new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      grant_type: 'authorization_code',
      redirect_uri: callbackUrl,
      code,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const data = r.data?.data?.[0] ?? r.data;
  const accessToken = data.access_token;
  const platformUserId = data.user_id ?? String(data.user_id);
  let username = 'Instagram';
  let profilePicture: string | null = null;
  try {
    const meRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
      'https://graph.instagram.com/me',
      {
        params: {
          fields: 'username,profile_picture_url',
          access_token: accessToken,
        },
      }
    );
    if (meRes.data?.username) username = meRes.data.username;
    if (meRes.data?.profile_picture_url) profilePicture = meRes.data.profile_picture_url;
  } catch (_) {
    // use defaults
  }
  let finalToken = accessToken;
  let expiresIn = 3600;
  try {
    const longLived = await axios.get<{ access_token?: string; expires_in?: number }>(
      'https://graph.instagram.com/access_token',
      {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: clientSecret,
          access_token: accessToken,
        },
      }
    );
    if (longLived.data?.access_token) {
      finalToken = longLived.data.access_token;
      expiresIn = longLived.data.expires_in ?? 5183944;
    }
  } catch (_) {
    // store short-lived
  }
  return {
    accessToken: finalToken,
    refreshToken: null,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    platformUserId,
    username,
    profilePicture,
  };
}

async function exchangeCode(
  platform: Platform,
  code: string,
  callbackUrl: string
): Promise<TokenResult> {
  switch (platform) {
    case 'INSTAGRAM': {
      const r = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: callbackUrl,
          code,
        },
      });
      const accessToken = r.data.access_token;
      let username = 'Instagram';
      let profilePicture: string | null = null;
      let platformUserId = 'instagram-' + (accessToken?.slice(-8) || 'id');
      try {
        const pagesRes = await axios.get<{ data?: Array<{ id: string; instagram_business_account?: { id: string } }> }>(
          'https://graph.facebook.com/v18.0/me/accounts',
          { params: { fields: 'id,instagram_business_account', access_token: accessToken } }
        );
        const pages = pagesRes.data?.data || [];
        for (const page of pages) {
          const igAccountId = page.instagram_business_account?.id;
          if (!igAccountId) continue;
          const igRes = await axios.get<{ username?: string; profile_picture_url?: string }>(
            `https://graph.facebook.com/v18.0/${igAccountId}`,
            { params: { fields: 'username,profile_picture_url', access_token: accessToken } }
          );
          if (igRes.data?.username) {
            username = igRes.data.username;
            profilePicture = igRes.data.profile_picture_url ?? null;
            platformUserId = igAccountId;
            break;
          }
        }
      } catch (_) {
        // Keep defaults if profile fetch fails
      }
      return {
        accessToken,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId,
        username,
        profilePicture,
      };
    }
    case 'TIKTOK': {
      const r = await axios.post('https://open-api.tiktok.com/oauth/access_token/', {
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
      });
      const d = r.data?.data;
      return {
        accessToken: d.access_token,
        refreshToken: d.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (d.expires_in || 86400) * 1000),
        platformUserId: d.open_id || 'tiktok-id',
        username: 'TikTok User',
      };
    }
    case 'YOUTUBE': {
      const r = await axios.post('https://oauth2.googleapis.com/token', new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID!,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
        code,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      return {
        accessToken: r.data.access_token,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId: 'youtube-' + (r.data.access_token?.slice(-8) || 'id'),
        username: 'YouTube Channel',
      };
    }
    case 'FACEBOOK': {
      const r = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          client_id: process.env.META_APP_ID,
          client_secret: process.env.META_APP_SECRET,
          redirect_uri: callbackUrl,
          code,
        },
      });
      return {
        accessToken: r.data.access_token,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId: 'fb-' + (r.data.access_token?.slice(-8) || 'id'),
        username: 'Facebook Page',
      };
    }
    case 'TWITTER': {
      const r = await axios.post('https://api.twitter.com/2/oauth2/token', new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        redirect_uri: callbackUrl,
        code_verifier: 'challenge',
      }).toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: process.env.TWITTER_CLIENT_ID || '',
          password: process.env.TWITTER_CLIENT_SECRET || '',
        },
      });
      return {
        accessToken: r.data.access_token,
        refreshToken: r.data.refresh_token ?? null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 7200) * 1000),
        platformUserId: 'twitter-' + (r.data.access_token?.slice(-8) || 'id'),
        username: 'X User',
      };
    }
    case 'LINKEDIN': {
      const r = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: process.env.LINKEDIN_CLIENT_ID!,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET!,
      }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      return {
        accessToken: r.data.access_token,
        refreshToken: null,
        expiresAt: new Date(Date.now() + (r.data.expires_in || 3600) * 1000),
        platformUserId: 'li-' + (r.data.access_token?.slice(-8) || 'id'),
        username: 'LinkedIn',
      };
    }
    default:
      throw new Error('Unsupported platform');
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'Social OAuth requires DATABASE_URL' }, { status: 503 });
  }
  const { platform } = await params;
  const plat = platform?.toUpperCase() as Platform;
  if (!plat || !PLATFORMS.includes(plat)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const stateRaw = searchParams.get('state'); // Prisma userId or "userId:instagram"

  if (!code || !stateRaw) {
    return NextResponse.json({ error: 'Missing code or state' }, { status: 400 });
  }

  const isInstagramLogin = stateRaw.includes(':instagram');
  const userId = isInstagramLogin ? stateRaw.replace(/:instagram$/, '') : stateRaw;

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const defaultCallbackUrl = `${baseUrl}/api/social/oauth/${platform}/callback`;
  const callbackUrl =
    plat === 'INSTAGRAM' && isInstagramLogin && process.env.INSTAGRAM_REDIRECT_URI
      ? process.env.INSTAGRAM_REDIRECT_URI.replace(/\/+$/, '')
      : defaultCallbackUrl;

  let tokenData: TokenResult;
  try {
    if (plat === 'INSTAGRAM' && isInstagramLogin) {
      tokenData = await exchangeCodeInstagramLogin(code, callbackUrl);
    } else {
      tokenData = await exchangeCode(plat, code, callbackUrl);
    }
  } catch (e) {
    console.error('[Social OAuth] exchange error:', e);
    return NextResponse.json({ error: 'Failed to connect account' }, { status: 500 });
  }

  const profilePicture = tokenData.profilePicture ?? undefined;
  await prisma.socialAccount.upsert({
    where: {
      userId_platform_platformUserId: {
        userId,
        platform: plat,
        platformUserId: tokenData.platformUserId,
      },
    },
    update: {
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      username: tokenData.username,
      ...(profilePicture !== undefined && { profilePicture }),
      status: 'connected',
    },
    create: {
      userId,
      platform: plat,
      platformUserId: tokenData.platformUserId,
      username: tokenData.username,
      ...(profilePicture !== undefined && { profilePicture }),
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      status: 'connected',
    },
  });

  const accountsUrl = `${baseUrl}/accounts`;
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body><p>Account connected.</p><script>
(function(){
  if (window.opener) {
    try { window.close(); } catch (e) {}
  } else {
    window.location.href = ${JSON.stringify(accountsUrl)};
  }
})();
</script><p>Redirecting to <a href="${accountsUrl}">Accounts</a>…</p></body></html>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}
