import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { PostStatus } from '@prisma/client';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { getCached, setCached } from '@/lib/server-memory-cache';

/**
 * GET /api/social/notifications
 * Returns counts for nav and inbox-tab badges.
 * inbox = total for header; byPlatform = per-platform counts for Messages/Comments badges.
 *
 * Rate-limit note:
 *   This endpoint used to call `/{postId}/comments` against Meta for the 50 most recent posts
 *   on every IG/FB account on every page load, which was responsible for the bulk of our
 *   "ShadowIGMedia/comments" + "Video/comments" Graph API usage. We now:
 *     - Read comment counts straight from the DB (ImportedPost.commentsCount is kept up to
 *       date by the sync engine) — zero live Meta calls for the comments badge.
 *     - Still fetch conversation counts for the messages badge, but cache the whole response
 *       in process memory for {@link CACHE_TTL_MS} so rapid refreshes reuse the cached payload.
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min – badges are fine being slightly stale

type NotificationsPayload = {
  inbox: number;
  comments: number;
  messages: number;
  byPlatform: Record<string, { comments: number; messages: number }>;
};

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0, byPlatform: {} }, { status: 200 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ inbox: 0, comments: 0, messages: 0, byPlatform: {} }, { status: 200 });
  }

  const cacheKey = `notifications:${userId}`;
  const cached = getCached<NotificationsPayload>(cacheKey);
  if (cached) {
    const res = NextResponse.json(cached);
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      accessToken: true,
      credentialsJson: true,
    },
  });

  let commentsTotal = 0;
  let messagesTotal = 0;
  let engagementTotal = 0;
  const byPlatform: Record<string, { comments: number; messages: number }> = {};

  for (const account of accounts) {
    if (!byPlatform[account.platform]) byPlatform[account.platform] = { comments: 0, messages: 0 };

    // Comment counts come straight from the DB (synced periodically by the sync engine).
    // We used to hit /{postId}/comments against Meta for 50 posts per account per request,
    // which was the single biggest source of our Graph API usage. No more.
    if (
      account.platform === 'INSTAGRAM' ||
      account.platform === 'FACEBOOK' ||
      account.platform === 'TWITTER'
    ) {
      const agg = await prisma.importedPost.aggregate({
        where: { socialAccountId: account.id },
        _sum: { commentsCount: true },
      });
      const commentsCount = agg._sum.commentsCount ?? 0;
      commentsTotal += commentsCount;
      byPlatform[account.platform].comments += commentsCount;
    }

    // Messages: we still need to hit the platform API (we don't persist message threads),
    // but we cache the whole notifications response so rapid refreshes don't re-fetch.
    if (account.platform === 'INSTAGRAM' || account.platform === 'FACEBOOK') {
      const token = account.accessToken;
      try {
        let messagesCount = 0;
        if (account.platform === 'INSTAGRAM') {
          let linkedPageId: string | null =
            account.credentialsJson && typeof account.credentialsJson === 'object'
              ? (account.credentialsJson as { linkedPageId?: string }).linkedPageId ?? null
              : null;
          if (!linkedPageId && token) {
            const fb = await prisma.socialAccount.findFirst({
              where: { userId, platform: 'FACEBOOK', accessToken: token },
              select: { platformUserId: true },
            });
            if (fb?.platformUserId) linkedPageId = fb.platformUserId;
          }
          const convPath = linkedPageId
            ? `${facebookGraphBaseUrl}/${linkedPageId}/conversations`
            : 'https://graph.instagram.com/v18.0/me/conversations';
          const convParams: Record<string, string> = { fields: 'id', access_token: token };
          if (linkedPageId) convParams.platform = 'instagram';
          const convRes = await axios.get<{ data?: unknown[] }>(convPath, { params: convParams, timeout: 5000 });
          messagesCount = (convRes.data?.data ?? []).length;
        } else {
          const convRes = await axios.get<{ data?: unknown[] }>(
            `${facebookGraphBaseUrl}/${account.platformUserId}/conversations`,
            { params: { fields: 'id', access_token: token }, timeout: 5000 }
          );
          messagesCount = (convRes.data?.data ?? []).length;
        }
        messagesTotal += messagesCount;
        byPlatform[account.platform].messages += messagesCount;
      } catch {
        // ignore – badges are best-effort
      }
    } else if (account.platform === 'TWITTER') {
      try {
        type TwitterDmResponse = { data?: Array<{ dm_conversation_id?: string }> };
        const dmRes = await axios.get<TwitterDmResponse>('https://api.x.com/2/dm_events', {
          params: { 'dm_event.fields': 'dm_conversation_id', max_results: 100 },
          headers: { Authorization: `Bearer ${account.accessToken}` },
          timeout: 8000,
        });
        const events = dmRes.data?.data ?? [];
        const convIds = new Set(events.map((e) => e.dm_conversation_id).filter(Boolean));
        const messagesCount = convIds.size;
        messagesTotal += messagesCount;
        byPlatform['TWITTER'].messages += messagesCount;
      } catch {
        // ignore
      }
    }
  }

  // Engagement tab count: posts with engagement data (ImportedPost or PostTarget for IG/FB/YT/PIN).
  const engagementAccounts = accounts.filter(
    (a) =>
      a.platform === 'INSTAGRAM' ||
      a.platform === 'FACEBOOK' ||
      a.platform === 'YOUTUBE' ||
      a.platform === 'PINTEREST'
  );
  for (const account of engagementAccounts) {
    const importedCount = await prisma.importedPost.count({
      where: { socialAccountId: account.id },
    });
    const targetCount = await prisma.postTarget.count({
      where: {
        socialAccountId: account.id,
        platformPostId: { not: null },
        status: PostStatus.POSTED,
      },
    });
    engagementTotal += Math.max(importedCount, targetCount, 0);
  }

  const payload: NotificationsPayload = {
    inbox: Math.min(commentsTotal + messagesTotal + engagementTotal, 99),
    comments: Math.min(commentsTotal, 99),
    messages: Math.min(messagesTotal, 99),
    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).map(([p, v]) => [
        p,
        { comments: Math.min(v.comments, 99), messages: Math.min(v.messages, 99) },
      ])
    ),
  };
  setCached(cacheKey, payload, CACHE_TTL_MS);

  const res = NextResponse.json(payload);
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
