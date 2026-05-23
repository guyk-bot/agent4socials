import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { isPrismaPoolError, prisma, withPrismaPoolRetry } from '@/lib/db';
import { parseTikTokCreatorInfoResponse } from '@/lib/tiktok/tiktok-publish-compliance';
import { buildTikTokCreatorInfoForClient } from '@/lib/tiktok/tiktok-creator-info-response';
import { refreshTikTokAccessToken } from '@/lib/tiktok/refresh-token';

export const maxDuration = 30;

function fallbackResponse(account: { username: string | null; profilePicture: string | null }, reason?: string) {
  return NextResponse.json({
    creator: buildTikTokCreatorInfoForClient({
      username: account.username,
      profilePicture: account.profilePicture,
    }),
    fromFallback: true,
    ...(reason ? { message: reason } : {}),
  });
}

/**
 * GET latest TikTok creator_info for the Post to TikTok UX (privacy options, interaction flags, max duration).
 * Always returns usable defaults quickly when TikTok or our DB is slow (no blocking spinner in the modal).
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
  let account: {
    id: string;
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: Date | null;
    username: string | null;
    profilePicture: string | null;
  } | null;
  try {
    account = await withPrismaPoolRetry('tiktok-creator-info-account', () =>
      prisma.socialAccount.findFirst({
        where: { id, userId, platform: 'TIKTOK' },
        select: {
          id: true,
          accessToken: true,
          refreshToken: true,
          expiresAt: true,
          username: true,
          profilePicture: true,
        },
      })
    );
  } catch (e) {
    if (isPrismaPoolError(e)) {
      return fallbackResponse(
        { username: null, profilePicture: null },
        'Database is busy. Using default TikTok settings so you can continue.'
      );
    }
    throw e;
  }
  if (!account?.accessToken) {
    return NextResponse.json({ message: 'TikTok account not found' }, { status: 404 });
  }

  const accountLite = { username: account.username, profilePicture: account.profilePicture };

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
        timeout: 8_000,
        validateStatus: () => true,
      }
    );
    if (res.status < 200 || res.status >= 300) {
      const errBody = res.data as { error?: { message?: string; code?: string } } | undefined;
      const msg = errBody?.error?.message ?? `TikTok API HTTP ${res.status}`;
      return fallbackResponse(accountLite, msg.slice(0, 200));
    }
    const parsed = parseTikTokCreatorInfoResponse(res.data);
    if (!parsed.ok) {
      const tokenError = /access token is invalid|not found in the request|invalid_access_token|access_token_invalid/i.test(
        parsed.error
      );
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
              timeout: 8_000,
              validateStatus: () => true,
            }
          );
          const retryParsed = parseTikTokCreatorInfoResponse(retryRes.data);
          if (retryParsed.ok) {
            return NextResponse.json({
              creator: buildTikTokCreatorInfoForClient({
                creator: retryParsed.data,
                username: account.username,
                profilePicture: account.profilePicture,
              }),
            });
          }
        }
      }
      return fallbackResponse(accountLite, parsed.error.slice(0, 200));
    }
    return NextResponse.json({
      creator: buildTikTokCreatorInfoForClient({
        creator: parsed.data,
        username: account.username,
        profilePicture: account.profilePicture,
      }),
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? 'TikTok request failed';
    return fallbackResponse(accountLite, msg.slice(0, 200));
  }
}
