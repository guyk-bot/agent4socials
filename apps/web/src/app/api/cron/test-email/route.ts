import { NextRequest, NextResponse } from 'next/server';
import { sendTestEmail } from '@/lib/resend';

/**
 * GET /api/cron/test-email?to=your@email.com
 * Sends a clearly marked test email to verify Resend is configured.
 * Call with X-Cron-Secret header (same as process-scheduled).
 * Real scheduled post emails have a different subject and link to the specific post.
 */
export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get('X-Cron-Secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const to = request.nextUrl.searchParams.get('to');
  if (!to || !to.includes('@')) {
    return NextResponse.json(
      { message: 'Add ?to=your@email.com to specify the recipient', ok: false },
      { status: 400 }
    );
  }

  const result = await sendTestEmail(to);

  return NextResponse.json({
    ok: result.ok,
    message: result.ok ? `Test email sent to ${to}. Check inbox and spam.` : result.error,
    error: result.error,
  });
}
