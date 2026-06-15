import { NextRequest, NextResponse } from 'next/server';
import { debugThreadsPublishWorkflow } from '@/lib/threads/debug-publish';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Sign in to izop.ai, then run the test again.' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { accountId, text } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'accountId is required' },
        { status: 400 }
      );
    }

    const owned = await prisma.socialAccount.findFirst({
      where: { id: accountId, userId, platform: 'THREADS' },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json(
        {
          success: false,
          error: 'Threads account not found for your user. Use the account ID from Accounts after reconnect.',
        },
        { status: 404 }
      );
    }

    const steps = await debugThreadsPublishWorkflow(
      accountId,
      text || 'Debug test from iZop AI - testing Threads publish workflow'
    );

    const failedSteps = steps.filter((s) => !s.success);

    return NextResponse.json({
      success: failedSteps.length === 0,
      steps,
      summary: {
        totalSteps: steps.length,
        successfulSteps: steps.filter((s) => s.success).length,
        failedSteps: failedSteps.length,
        firstFailure: failedSteps[0],
      },
      error: failedSteps[0]?.error,
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