import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/debug/test-graph
 * Calls Facebook/Instagram Graph API with the token from SocialAccount and returns raw responses.
 * For local debugging only; protect or remove in production.
 */
export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 503 });
  }
  const accounts = await prisma.socialAccount.findMany({
    where: { platform: { in: ['INSTAGRAM', 'FACEBOOK'] } },
    select: { id: true, platform: true, username: true, platformUserId: true, accessToken: true },
  });
  if (accounts.length === 0) {
    return NextResponse.json({ message: 'No Instagram or Facebook accounts in DB', accounts: [] });
  }
  const results: Record<string, unknown> = {};
  for (const a of accounts) {
    const key = `${a.platform}_${a.username}`;
    const token = a.accessToken;
    const pid = a.platformUserId;
    const prefix = `${baseUrl}/${pid}`;
    const tokenParam = `access_token=${encodeURIComponent(token)}`;

    const profileUrl = a.platform === 'INSTAGRAM'
      ? `${prefix}?fields=followers_count&${tokenParam}`
      : `${prefix}?fields=fan_count&${tokenParam}`;
    const insightsUrl = a.platform === 'INSTAGRAM'
      ? `${prefix}/insights?metric=reach,profile_views,views&metric_type=total_value&period=day&since=2026-01-16&until=2026-02-15&${tokenParam}`
      : `${prefix}/insights?metric=page_impressions,page_views_total,page_fan_reach&period=day&since=2026-01-16&until=2026-02-15&${tokenParam}`;
    const mediaUrl = a.platform === 'INSTAGRAM'
      ? `${prefix}/media?fields=id,caption,timestamp&${tokenParam}`
      : `${prefix}/published_posts?fields=id,message,created_time&${tokenParam}`;
    const convUrl = `${prefix}/conversations?fields=id,updated_time,senders&${tokenParam}`;

    let profileRes: unknown;
    let insightsRes: unknown;
    let mediaRes: unknown;
    let conversationsRes: unknown;
    try {
      profileRes = await fetch(profileUrl).then((r) => r.json());
    } catch (e) {
      profileRes = { fetchError: (e as Error).message };
    }
    try {
      insightsRes = await fetch(insightsUrl).then((r) => r.json());
    } catch (e) {
      insightsRes = { fetchError: (e as Error).message };
    }
    try {
      mediaRes = await fetch(mediaUrl).then((r) => r.json());
    } catch (e) {
      mediaRes = { fetchError: (e as Error).message };
    }
    try {
      conversationsRes = await fetch(convUrl).then((r) => r.json());
    } catch (e) {
      conversationsRes = { fetchError: (e as Error).message };
    }

    results[key] = {
      platformUserId: pid,
      accountId: a.id,
      tokenPreview: token.slice(0, 30) + '...',
      profile: profileRes,
      insights: insightsRes,
      media: mediaRes,
      conversations: conversationsRes,
    };
  }
  return NextResponse.json({ accounts: results });
}
