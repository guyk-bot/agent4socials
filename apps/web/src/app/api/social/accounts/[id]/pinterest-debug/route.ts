import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { getValidPinterestToken } from '@/lib/pinterest-token';

type Bucket = { url: string; status: number; data: unknown };

/**
 * GET /api/social/accounts/[id]/pinterest-debug
 * Returns raw Pinterest v5 JSON for the connected account (user_account, analytics, top_pins, boards, pins sample).
 * Optional query: start_date, end_date (YYYY-MM-DD) for analytics; defaults to last 30 days.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'PINTEREST' },
    select: { id: true, accessToken: true, refreshToken: true, expiresAt: true, username: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Pinterest account not found' }, { status: 404 });
  }

  let token: string;
  try {
    token = await getValidPinterestToken({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      expiresAt: account.expiresAt,
    });
  } catch (e) {
    return NextResponse.json(
      { message: 'Could not refresh Pinterest token. Reconnect the account.', error: (e as Error)?.message },
      { status: 400 }
    );
  }

  const headers = { Authorization: `Bearer ${token}` };
  const sp = request.nextUrl.searchParams;
  const end = sp.get('end_date')?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const start =
    sp.get('start_date')?.slice(0, 10) ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  async function bucket(url: string, config?: { params?: Record<string, string | number> }): Promise<Bucket> {
    try {
      const res = await axios.get(url, {
        headers,
        params: config?.params,
        validateStatus: () => true,
        timeout: 30_000,
      });
      return { url, status: res.status, data: res.data };
    } catch (e) {
      const ax = e as { message?: string; response?: { status?: number; data?: unknown } };
      return {
        url,
        status: ax.response?.status ?? 0,
        data: ax.response?.data ?? { error: ax.message ?? 'request failed' },
      };
    }
  }

  const [userAccount, analytics, topPins, boards, pinsPage] = await Promise.all([
    bucket('https://api.pinterest.com/v5/user_account'),
    bucket('https://api.pinterest.com/v5/user_account/analytics', {
      params: { start_date: start, end_date: end },
    }),
    bucket('https://api.pinterest.com/v5/user_account/analytics/top_pins', {
      params: { start_date: start, end_date: end, sort_by: 'IMPRESSION', num_of_pins: 25 },
    }),
    bucket('https://api.pinterest.com/v5/boards', { params: { page_size: 25 } }),
    bucket('https://api.pinterest.com/v5/pins', { params: { page_size: 25 } }),
  ]);

  return NextResponse.json({
    queried: { start_date: start, end_date: end },
    user_account: userAccount,
    user_account_analytics: analytics,
    top_pins: topPins,
    boards: boards,
    pins_page: pinsPage,
  });
}
