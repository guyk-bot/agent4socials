import { NextRequest, NextResponse } from 'next/server';
import { debugThreadsPublishWorkflow } from '@/lib/threads/debug-publish';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

async function requireUserId(request: NextRequest): Promise<string | NextResponse> {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json(
      { success: false, error: 'Unauthorized. Sign in to izop.ai, then run the test again.' },
      { status: 401 }
    );
  }
  return userId;
}

/** List connected Threads accounts for the signed-in user (for debug UI). */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (userId instanceof NextResponse) return userId;

    const accounts = await prisma.socialAccount.findMany({
      where: { userId, platform: 'THREADS', status: 'connected' },
      select: { id: true, username: true, platformUserId: true, lastSyncStatus: true },
      orderBy: { connectedAt: 'desc' },
    });

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('[Debug Threads Publish GET]', error);
    return NextResponse.json(
      { success: false, error: (error as Error)?.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId(request);
    if (userId instanceof NextResponse) return userId;

    const body = await request.json();
    const { accountId, text } = body;

    if (!accountId) {
      return NextResponse.json(
        { success: false, error: 'accountId is required' },
        { status: 400 }
      );
    }

    const owned = await prisma.socialAccount.findFirst({
      where: { id: accountId, userId, platform: 'THREADS', status: 'connected' },
      select: { id: true },
    });
    if (!owned) {
      const [connectedThreads, rowById] = await Promise.all([
        prisma.socialAccount.findMany({
          where: { userId, platform: 'THREADS', status: 'connected' },
          select: { id: true, username: true },
          orderBy: { connectedAt: 'desc' },
        }),
        prisma.socialAccount.findUnique({
          where: { id: accountId },
          select: { id: true, userId: true, platform: true, status: true, username: true },
        }),
      ]);

      let hint = 'Use a connected Threads account ID from Accounts.';
      if (rowById && rowById.userId !== userId) {
        hint = 'That account ID belongs to a different izop user.';
      } else if (rowById?.status === 'disconnected') {
        hint = 'That Threads account is disconnected. Reconnect it from Accounts, then use the new ID if it changed.';
      } else if (rowById && rowById.platform !== 'THREADS') {
        hint = `That ID is a ${rowById.platform} account, not Threads.`;
      } else if (!rowById) {
        hint = 'No account exists with that ID. Copy the ID from Accounts after your latest reconnect.';
      }

      return NextResponse.json(
        {
          success: false,
          error: `Threads account not found for your user. ${hint}`,
          connectedThreadsAccounts: connectedThreads,
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