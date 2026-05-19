import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { getCached, setCached } from '@/lib/server-memory-cache';

/**
 * GET /api/social/notifications
 * Legacy endpoint. Unread badge counts are computed on the client from localStorage
 * (`computeInboxHeaderUnread`) once inbox conversations/comments are loaded.
 * Totals here are always zero so we never show "99" for all threads when everything is read.
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

  const cacheKey = `notifications:v2-unread-client:${userId}`;
  const cached = getCached<NotificationsPayload>(cacheKey);
  if (cached) {
    const res = NextResponse.json(cached);
    res.headers.set('Cache-Control', 'private, max-age=30');
    return res;
  }

  const payload: NotificationsPayload = {
    inbox: 0,
    comments: 0,
    messages: 0,
    byPlatform: {},
  };
  setCached(cacheKey, payload, CACHE_TTL_MS);

  const res = NextResponse.json(payload);
  res.headers.set('Cache-Control', 'private, max-age=30');
  return res;
}
