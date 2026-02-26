import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';

/**
 * GET /api/social/notifications
 * Returns counts for nav badges: { inbox: number } (total comments across IG/FB/X).
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ inbox: 0 }, { status: 200 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ inbox: 0 }, { status: 200 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: { id: true, platform: true, accessToken: true },
  });
  let total = 0;
  for (const account of accounts) {
    if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK' && account.platform !== 'TWITTER') continue;
    const targets = await prisma.postTarget.findMany({
      where: {
        socialAccountId: account.id,
        platformPostId: { not: null },
        status: PostStatus.POSTED,
      },
      take: 10,
    });
    const token = account.accessToken;
    for (const target of targets) {
      const pid = target.platformPostId!;
      try {
        if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
          const res = await axios.get<{ data?: unknown[] }>(
            `https://graph.facebook.com/v18.0/${pid}/comments`,
            { params: { fields: 'id', access_token: token }, timeout: 8000 }
          );
          total += (res.data?.data ?? []).length;
        } else if (account.platform === 'TWITTER') {
          const res = await axios.get<{ data?: unknown[] }>(
            'https://api.twitter.com/2/tweets/search/recent',
            {
              params: {
                query: `conversation_id:${pid} is:reply`,
                'tweet.fields': 'id',
                max_results: 25,
              },
              headers: { Authorization: `Bearer ${token}` },
              timeout: 8000,
            }
          );
          total += (res.data?.data ?? []).length;
        }
      } catch (_) {
        // skip
      }
    }
  }
  return NextResponse.json({ inbox: Math.min(total, 99) });
}
