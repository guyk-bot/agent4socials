import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import {
  getUnifiedKpiSummary,
  getUnifiedChartData,
  getUnifiedTopPosts,
  getUnifiedPostsHistory,
} from '@/lib/analytics/unified-metrics';

export async function GET(req: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(req.headers.get('authorization'));
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const raw = req.nextUrl.searchParams.get('days');
  const days = [7, 30, 90].includes(Number(raw)) ? Number(raw) : 30;

  const [kpi, chart, topPosts, history] = await Promise.all([
    getUnifiedKpiSummary(userId, days),
    getUnifiedChartData(userId, days),
    getUnifiedTopPosts(userId, days, 5),
    getUnifiedPostsHistory(userId, days, 60),
  ]);

  return NextResponse.json({ kpi, chart, topPosts, history });
}
