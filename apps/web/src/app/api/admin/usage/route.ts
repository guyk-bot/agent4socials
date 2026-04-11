import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { getUserUsageSummary, getAllUsersUsageTotals, getUsageLeaderboardByUser } from '@/lib/usage-tracking';

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_USAGE_EMAILS?.trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function requesterIsUsageAdmin(userId: string): Promise<boolean> {
  const allowed = parseAdminEmails();
  if (allowed.size === 0) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u?.email) return false;
  return allowed.has(u.email.toLowerCase());
}

/**
 * GET /api/admin/usage?days=30
 * Returns daily usage breakdown for the authenticated user.
 *
 * GET /api/admin/usage?all=1&days=30
 * Returns per-user leaderboard (email + totals + byCategory). Requires **`ADMIN_USAGE_EMAILS`**
 * in env (comma-separated) to include the signed-in user's email — otherwise 403.
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(request.nextUrl.searchParams.get('days') || '30') || 30));
  const showAll = request.nextUrl.searchParams.get('all') === '1';

  try {
    if (showAll) {
      const ok = await requesterIsUsageAdmin(userId);
      if (!ok) {
        return NextResponse.json(
          {
            message: 'Forbidden',
            hint: 'Set ADMIN_USAGE_EMAILS in Vercel to a comma-separated list of admin emails (must include your account email) to use ?all=1.',
          },
          { status: 403 }
        );
      }
      const [leaderboard, flatTotals] = await Promise.all([
        getUsageLeaderboardByUser(days),
        getAllUsersUsageTotals(days),
      ]);
      return NextResponse.json({
        ok: true,
        days,
        leaderboard,
        /** Raw rows: userId + category + total (same window). */
        totalsByUserAndCategory: flatTotals,
        note: 'api_request counts each authenticated API handler that resolved your User via Bearer token (correlates with Vercel function invocations, not GB-hrs).',
      });
    }
    const summary = await getUserUsageSummary(userId, days);
    return NextResponse.json({ ok: true, days, userId, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
