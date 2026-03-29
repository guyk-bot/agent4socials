import { NextRequest, NextResponse } from 'next/server';
import { executeCommentAutomation } from '@/lib/comment-automation';

/**
 * GET/POST /api/cron/comment-automation
 * Call with header X-Cron-Secret: CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  return runCommentAutomation(request);
}

export async function POST(request: NextRequest) {
  return runCommentAutomation(request);
}

async function runCommentAutomation(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await executeCommentAutomation();
    return NextResponse.json(summary);
  } catch (e) {
    console.error('[Cron] comment-automation error:', e);
    return NextResponse.json(
      { message: 'Cron failed', error: (e as Error)?.message ?? String(e) },
      { status: 500 }
    );
  }
}
