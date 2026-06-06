import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { executeCommentAutomation } from '@/lib/comment-automation';

/**
 * POST /api/automation/run-comment-automation
 * Authenticated trigger for keyword comment automation. Runs the same logic as the cron
 * so the user can "Run now" from the Automation page without waiting for the schedule.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await executeCommentAutomation();
    return NextResponse.json(summary);
  } catch (e) {
    console.error('[Automation run-comment-automation]', e);
    return NextResponse.json(
      { ok: false, message: (e as Error).message ?? 'Request failed' },
      { status: 500 }
    );
  }
}
