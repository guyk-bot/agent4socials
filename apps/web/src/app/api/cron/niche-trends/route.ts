import { NextRequest, NextResponse } from 'next/server';
import { runNicheTrendSweep } from '@/lib/trends/youtube-sweep';

export const maxDuration = 25;

function checkAuthorization(request: NextRequest): boolean {
  const rawEnvSecret = process.env.CRON_SECRET;
  if (!rawEnvSecret) return false;
  const cronSecret = rawEnvSecret.trim().replace(/^['"]|['"]$/g, '');
  const provided =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('x-cron-secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret') ||
    '';
  return provided.trim() === cronSecret;
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ message: 'YOUTUBE_API_KEY required' }, { status: 503 });
  }
  if (!checkAuthorization(request)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  try {
    const summary = await runNicheTrendSweep(apiKey);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
