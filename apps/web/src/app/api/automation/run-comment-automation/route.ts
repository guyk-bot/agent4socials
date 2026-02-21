import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';

const baseUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://agent4socials.com').replace(/\/+$/, '');

/**
 * POST /api/automation/run-comment-automation
 * Authenticated trigger for keyword comment automation. Calls the cron endpoint
 * server-side with CRON_SECRET so the user can run it on demand (e.g. after
 * someone commented) without waiting for the scheduled cron.
 */
export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: 'CRON_SECRET is not set. Set it in Vercel (or .env) to use run now.' },
      { status: 503 }
    );
  }
  try {
    const res = await fetch(`${baseUrl()}/api/cron/comment-automation`, {
      method: 'POST',
      headers: { 'X-Cron-Secret': cronSecret },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(data, { status: res.status });
    }
    return NextResponse.json(data);
  } catch (e) {
    console.error('[Automation run-comment-automation]', e);
    return NextResponse.json(
      { ok: false, message: (e as Error).message ?? 'Request failed' },
      { status: 500 }
    );
  }
}
