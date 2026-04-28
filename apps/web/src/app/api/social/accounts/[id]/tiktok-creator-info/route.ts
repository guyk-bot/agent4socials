import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { parseTikTokCreatorInfoResponse } from '@/lib/tiktok/tiktok-publish-compliance';

type TikTokOAuthRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

async function refreshTikTokAccessToken(account: {
  id: string;
  refreshToken: string | null;
}): Promise<string | null> {
  if (!account.refreshToken) return null;
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return null;

  const r = await axios.post<TikTokOAuthRefreshResponse>(
    'https://open.tiktokapis.com/v2/oauth/token/',
    new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 12_000,
      validateStatus: () => true,
    }
  );
  const data = r.data;
  if (r.status < 200 || r.status >= 300 || !data?.access_token || data?.error) return null;

  const expiresInSec = typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 86_400;
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      accessToken: data.access_token,
      ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      expiresAt: new Date(Date.now() + expiresInSec * 1000),
    },
  });
  return data.access_token;
}

/**
 * GET latest TikTok creator_info for the Post to TikTok UX (privacy options, interaction flags, max duration).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'TIKTOK' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ message: 'TikTok account not found' }, { status: 404 });
  }
  try {
    let accessToken = account.accessToken;
    const tokenExpired = account.expiresAt ? account.expiresAt.getTime() <= Date.now() + 60_000 : false;
    if (tokenExpired) {
      const refreshed = await refreshTikTokAccessToken(account);
      if (refreshed) accessToken = refreshed;
    }

    const res = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        timeout: 12_000,
        validateStatus: () => true,
      }
    );
    const parsed = parseTikTokCreatorInfoResponse(res.data);
    if (!parsed.ok) {
      const tokenError = /access token is invalid|not found in the request|invalid_access_token|access_token_invalid/i.test(parsed.error);
      if (tokenError) {
        const refreshed = await refreshTikTokAccessToken(account);
        if (refreshed) {
          const retryRes = await axios.post(
            'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
            {},
            {
              headers: {
                Authorization: `Bearer ${refreshed}`,
                'Content-Type': 'application/json; charset=UTF-8',
              },
              timeout: 12_000,
              validateStatus: () => true,
            }
          );
          const retryParsed = parseTikTokCreatorInfoResponse(retryRes.data);
          if (retryParsed.ok) {
            return NextResponse.json({ creator: retryParsed.data });
          }
        }
      }
    }
    if (!parsed.ok) {
      return NextResponse.json(
        { message: parsed.error, blockingCode: parsed.blockingCode },
        { status: parsed.blockingCode ? 429 : 502 }
      );
    }
    return NextResponse.json({ creator: parsed.data });
  } catch (e) {
    const msg = (e as Error)?.message ?? 'TikTok request failed';
    return NextResponse.json({ message: msg.slice(0, 300) }, { status: 502 });
  }
}
