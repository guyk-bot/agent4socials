import { NextRequest, NextResponse } from 'next/server';
import { sendScheduledPostLinksEmail } from '@/lib/resend';

/**
 * GET /api/cron/test-email?to=your@email.com
 * Sends a test email to verify Resend is configured correctly.
 * Call with X-Cron-Secret header (same as process-scheduled).
 * Use ?to=your@email.com to specify the recipient.
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

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');
  const testLink = `${baseUrl}/calendar`;
  const result = await sendScheduledPostLinksEmail(to, testLink);

  return NextResponse.json({
    ok: result.ok,
    message: result.ok ? `Test email sent to ${to}. Check inbox and spam.` : result.error,
    error: result.error,
  });
}
