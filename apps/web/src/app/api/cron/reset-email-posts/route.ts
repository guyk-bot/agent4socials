import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/cron/reset-email-posts
 * One-time fix: clears scheduleEmailSentAt for posts that were marked "sent" but never actually
 * had an email delivered (due to the bug where we set scheduleEmailSentAt before Resend completed).
 * Call with header X-Cron-Secret (same as process-scheduled).
 * After running, trigger /api/cron/process-scheduled to re-send the emails.
 */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await prisma.post.updateMany({
      where: {
        scheduleDelivery: 'email_links',
        scheduleEmailSentAt: { not: null },
      },
      data: { scheduleEmailSentAt: null },
    });
    return NextResponse.json({
      message: `Reset ${result.count} post(s). Run /api/cron/process-scheduled to re-send emails.`,
      resetCount: result.count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Cron] reset-email-posts error:', err);
    return NextResponse.json({ message: 'Reset failed', error: message }, { status: 500 });
  }
}
