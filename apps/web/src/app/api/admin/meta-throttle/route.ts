/**
 * GET  /api/admin/meta-throttle          — current throttle status
 * POST /api/admin/meta-throttle          — body { action: "pause" | "resume", minutes?: number }
 *
 * Requires X-Cron-Secret header. Used to manually pause/resume Meta Graph calls
 * when the app is approaching its app-level rate limit.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  clearMetaThrottle,
  getMetaThrottleRemainingMinutes,
  getMetaThrottleUntilMs,
  isMetaNonCriticalThrottled,
  noteMetaRateLimitError,
} from '@/lib/meta-usage-guard';
import { prisma } from '@/lib/db';

const META_THROTTLE_KEY = 'meta:throttle-until';

async function getThrottleUntil(): Promise<number> {
  try {
    const row = await (prisma as unknown as {
      appKv?: { findUnique: (args: { where: { key: string } }) => Promise<{ value: string } | null> }
    }).appKv?.findUnique({ where: { key: META_THROTTLE_KEY } });
    return row ? (Number(row.value) || 0) : 0;
  } catch {
    return 0;
  }
}

async function clearThrottle(): Promise<void> {
  try {
    await (prisma as unknown as {
      appKv?: { deleteMany: (args: { where: { key: string } }) => Promise<unknown> }
    }).appKv?.deleteMany({ where: { key: META_THROTTLE_KEY } });
  } catch { /* ignore */ }
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('X-Cron-Secret') ?? request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  return header === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const until = Math.max(await getThrottleUntil(), getMetaThrottleUntilMs());
  const throttled = isMetaNonCriticalThrottled();
  return NextResponse.json({
    throttled,
    throttledUntil: until > 0 ? new Date(until).toISOString() : null,
    remainingMs: until > 0 ? Math.max(0, until - Date.now()) : 0,
    remainingMinutes: getMetaThrottleRemainingMinutes(),
    note: 'This is Izop app backoff, not the Meta Developer Dashboard rate limit percentage.',
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as { action?: string; minutes?: number };
  const action = body.action;
  if (action === 'pause') {
    const minutes = typeof body.minutes === 'number' && body.minutes > 0 ? body.minutes : 60;
    noteMetaRateLimitError();
    return NextResponse.json({ ok: true, action: 'paused', minutes });
  }
  if (action === 'resume') {
    await clearThrottle();
    clearMetaThrottle();
    return NextResponse.json({ ok: true, action: 'resumed' });
  }
  return NextResponse.json({ error: 'Unknown action. Use { action: "pause" | "resume" }' }, { status: 400 });
}
