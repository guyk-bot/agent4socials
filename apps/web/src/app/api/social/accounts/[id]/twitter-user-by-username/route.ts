import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * GET /api/social/accounts/[id]/twitter-user-by-username?username=xxx
 * Returns Twitter user id, name, username, profile_image_url for the given username.
 * Used when we cannot derive the DM recipient from the conversation (e.g. only our messages).
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
  const username = request.nextUrl.searchParams.get('username')?.trim();
  if (!username) {
    return NextResponse.json({ message: 'username query parameter required' }, { status: 400 });
  }
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, accessToken: true },
  });
  if (!account || account.platform !== 'TWITTER') {
    return NextResponse.json({ message: 'Account not found or not a Twitter account' }, { status: 404 });
  }
  const token = account.accessToken ?? '';
  if (!token) {
    return NextResponse.json({ message: 'No access token. Reconnect your X account.' }, { status: 400 });
  }
  try {
    const res = await axios.get<{
      data?: { id: string; name?: string; username?: string; profile_image_url?: string };
      error?: { message?: string };
    }>(`https://api.twitter.com/2/users/by/username/${encodeURIComponent(username)}`, {
      params: { 'user.fields': 'id,name,username,profile_image_url' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
    });
    if (res.data?.error) {
      return NextResponse.json(
        { message: res.data.error.message ?? 'User not found' },
        { status: 404 }
      );
    }
    const u = res.data?.data;
    if (!u?.id) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({
      id: u.id,
      name: u.name ?? undefined,
      username: u.username ?? undefined,
      profile_image_url: u.profile_image_url?.replace(/_normal\./, '_400x400.') ?? undefined,
    });
  } catch (e) {
    const err = e as { response?: { data?: { error?: { message?: string } }; status?: number }; message?: string };
    const status = err?.response?.status;
    const msg = err?.response?.data?.error?.message ?? err?.message ?? 'Could not look up user.';
    if (status === 404) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ message: msg }, { status: status && status >= 400 ? status : 500 });
  }
}
