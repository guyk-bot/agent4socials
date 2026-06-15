import { NextRequest, NextResponse } from 'next/server';
import { debugThreadsPublishWorkflow } from '@/lib/threads/debug-publish';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { accountId, text } = body;

    if (!accountId) {
      return NextResponse.json(
        { error: 'accountId is required' },
        { status: 400 }
      );
    }

    // Run the debug workflow
    const steps = await debugThreadsPublishWorkflow(
      accountId,
      text || 'Debug test from iZop AI - testing Threads publish workflow'
    );

    return NextResponse.json({
      success: true,
      steps,
      summary: {
        totalSteps: steps.length,
        successfulSteps: steps.filter(s => s.success).length,
        failedSteps: steps.filter(s => !s.success).length,
        firstFailure: steps.find(s => !s.success),
      },
    });
  } catch (error) {
    console.error('[Debug Threads Publish]', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error)?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}