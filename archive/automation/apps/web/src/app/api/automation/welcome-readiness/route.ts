import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { checkWelcomeAutomationReadiness } from '@/lib/automation-welcome-readiness';

/**
 * GET /api/automation/welcome-readiness
 * Returns whether welcome automations are configured and what to fix before a live test.
 */
export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const report = await checkWelcomeAutomationReadiness(userId);
  return NextResponse.json(report);
}
