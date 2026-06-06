import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { listTwitterFollowerIds, sendTwitterDmText } from '@/lib/twitter-send-dm';

/**
 * GET/POST /api/cron/welcome-followers
 * Call with header X-Cron-Secret: CRON_SECRET (or Authorization: Bearer CRON_SECRET).
 * For users with dmNewFollowerEnabled and a Twitter account, fetches new followers
 * and sends the welcome DM to each (once per follower). Instagram and Facebook are not
 * supported for proactive new-follower DMs (API limitation).
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
    const users = await prisma.user.findMany({
      select: { id: true, automationSettings: true },
    });
    const settings = users.filter((u) => {
      const s = u.automationSettings as {
        dmNewFollowerEnabled?: boolean;
        dmNewFollowerMessage?: string | null;
        dmNewFollowerEnabledByPlatform?: Record<string, boolean>;
        dmNewFollowerMessagesByPlatform?: Record<string, string | null>;
      } | null;
      if (!s) return false;
      const by = s.dmNewFollowerEnabledByPlatform;
      const xOn = by?.['X (Twitter)'] === true || s.dmNewFollowerEnabled === true;
      const msg =
        (s.dmNewFollowerMessagesByPlatform?.['X (Twitter)'] ?? s.dmNewFollowerMessage ?? '').trim();
      return xOn && msg.length > 0;
    });

    for (const u of settings) {
      const s = u.automationSettings as {
        dmNewFollowerMessage?: string | null;
        dmNewFollowerMessagesByPlatform?: Record<string, string | null>;
      };
      const message = (
        s?.dmNewFollowerMessagesByPlatform?.['X (Twitter)'] ?? s?.dmNewFollowerMessage ?? ''
      ).trim();
      const userId = u.id;
      if (!message) continue;

      const twitterAccount = await prisma.socialAccount.findFirst({
        where: { userId, platform: 'TWITTER' },
        select: { id: true, platformUserId: true, accessToken: true, refreshToken: true, credentialsJson: true },
      });
      if (!twitterAccount?.accessToken) continue;

      const welcomed = await prisma.automationFollowerWelcome.findMany({
        where: { userId, platform: 'TWITTER' },
        select: { platformUserId: true },
      });
      const welcomedSet = new Set(welcomed.map((w) => w.platformUserId));

      const followersRes = await listTwitterFollowerIds({
        accessToken: twitterAccount.accessToken,
        refreshToken: twitterAccount.refreshToken,
        credentialsJson: twitterAccount.credentialsJson,
        platformUserId: twitterAccount.platformUserId,
      });

      if (!followersRes.ok) {
        results.push({ userId, platform: 'TWITTER', sent: 0, errors: [followersRes.error] });
        continue;
      }

      const newFollowerIds = followersRes.ids.filter((id) => !welcomedSet.has(id));
      const errors: string[] = [];
      let sent = 0;

      for (const participantId of newFollowerIds.slice(0, 20)) {
        const sendRes = await sendTwitterDmText(
          {
            accessToken: twitterAccount.accessToken,
            refreshToken: twitterAccount.refreshToken,
            credentialsJson: twitterAccount.credentialsJson,
          },
          participantId,
          message
        );
        if (sendRes.ok) {
          await prisma.automationFollowerWelcome.create({
            data: {
              userId,
              platform: 'TWITTER',
              platformUserId: participantId,
            },
          });
          sent++;
        } else {
          errors.push(`${participantId}: ${sendRes.error}`);
        }
      }

      results.push({ userId, platform: 'TWITTER', sent, errors: errors.slice(0, 5) });
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
