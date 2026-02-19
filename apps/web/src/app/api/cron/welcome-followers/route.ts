import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * GET/POST /api/cron/welcome-followers
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * For users with dmNewFollowerEnabled and a Twitter account, fetches new followers
 * and sends the welcome DM to each (once per follower).
 */
export async function GET(request: NextRequest) {
  return runWelcomeFollowers(request);
}

export async function POST(request: NextRequest) {
  return runWelcomeFollowers(request);
}

async function runWelcomeFollowers(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const results: { userId: string; platform: string; sent: number; errors: string[] }[] = [];

  try {
    const settings = await prisma.automationSettings.findMany({
      where: {
        dmNewFollowerEnabled: true,
        dmNewFollowerMessage: { not: null },
      },
      select: { userId: true, dmNewFollowerMessage: true },
    });

    for (const s of settings) {
      const message = (s.dmNewFollowerMessage ?? '').trim();
      if (!message) continue;

      const twitterAccount = await prisma.socialAccount.findFirst({
        where: { userId: s.userId, platform: 'TWITTER' },
        select: { id: true, platformUserId: true, accessToken: true },
      });
      if (!twitterAccount) continue;

      const welcomed = await prisma.automationFollowerWelcome.findMany({
        where: { userId: s.userId, platform: 'TWITTER' },
        select: { platformUserId: true },
      });
      const welcomedSet = new Set(welcomed.map((w) => w.platformUserId));

      let followerIds: string[] = [];
      try {
        const res = await axios.get<{ data?: Array<{ id: string }> }>(
          `https://api.twitter.com/2/users/${twitterAccount.platformUserId}/followers`,
          {
            params: { max_results: 100 },
            headers: { Authorization: `Bearer ${twitterAccount.accessToken}` },
          }
        );
        followerIds = (res.data?.data ?? []).map((d) => d.id);
      } catch (e) {
        const msg = (e as Error)?.message ?? String(e);
        results.push({ userId: s.userId, platform: 'TWITTER', sent: 0, errors: [`Failed to get followers: ${msg}`] });
        continue;
      }

      const newFollowerIds = followerIds.filter((id) => !welcomedSet.has(id));
      const errors: string[] = [];
      let sent = 0;

      for (const participantId of newFollowerIds.slice(0, 20)) {
        try {
          const dmRes = await axios.post(
            `https://api.twitter.com/2/dm_conversations/with/${participantId}/messages`,
            { text: message },
            {
              headers: {
                Authorization: `Bearer ${twitterAccount.accessToken}`,
                'Content-Type': 'application/json',
              },
            }
          );
          if (dmRes.status >= 200 && dmRes.status < 300) {
            await prisma.automationFollowerWelcome.create({
              data: {
                userId: s.userId,
                platform: 'TWITTER',
                platformUserId: participantId,
              },
            });
            sent++;
          }
        } catch (e) {
          const msg = (e as Error)?.message ?? String(e);
          errors.push(`${participantId}: ${msg}`);
        }
      }

      results.push({ userId: s.userId, platform: 'TWITTER', sent, errors: errors.slice(0, 5) });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error('[Cron] welcome-followers error:', e);
    return NextResponse.json(
      { message: 'Cron failed', error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
