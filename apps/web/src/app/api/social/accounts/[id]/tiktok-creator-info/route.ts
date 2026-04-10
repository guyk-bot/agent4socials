import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { parseTikTokCreatorInfoResponse } from '@/lib/tiktok/tiktok-publish-compliance';

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
    select: { accessToken: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ message: 'TikTok account not found' }, { status: 404 });
  }
  try {
    const res = await axios.post(
      'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',
      {},
      {
        headers: {
          Authorization: `Bearer ${account.accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        timeout: 12_000,
        validateStatus: () => true,
      }
    );
    const parsed = parseTikTokCreatorInfoResponse(res.data);
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
