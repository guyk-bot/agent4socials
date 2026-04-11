import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { getUserUsageSummary, getAllUsersUsageTotals } from '@/lib/usage-tracking';

/**
 * GET /api/admin/usage?days=30
 * Returns daily usage breakdown for the authenticated user.
 * Add ?all=1 to get aggregated totals across all users (admin-style view).
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
      const totals = await getAllUsersUsageTotals(days);
      return NextResponse.json({ ok: true, days, totals });
    }
    const summary = await getUserUsageSummary(userId, days);
    return NextResponse.json({ ok: true, days, userId, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
