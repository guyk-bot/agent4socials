import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { sweepNicheBatch } from '@/lib/trends/youtube-sweep';

export const maxDuration = 25;

const DEFAULT_BATCH = 8;
const MAX_BATCH = 20;

/**
 * POST /api/trends/sync-batch
 * Body JSON: { startIndex?: number, batchSize?: number }
 * Authenticated: runs YouTube sweep for the next batch of niches (all 98 in order). Call repeatedly until done=true.
 */
export async function POST(request: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized. Sign in again.' }, { status: 401 });
  }

  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ message: 'YOUTUBE_API_KEY is not set on the server.' }, { status: 503 });
  }

  let body: { startIndex?: number; batchSize?: number } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ message: 'Invalid JSON body' }, { status: 400 });
  }

  const startRaw = body.startIndex ?? 0;
  const batchRaw = body.batchSize ?? DEFAULT_BATCH;
  const startIndex = Number.isFinite(Number(startRaw)) ? Math.max(0, Math.floor(Number(startRaw))) : 0;
  const batchSize = Number.isFinite(Number(batchRaw))
    ? Math.min(MAX_BATCH, Math.max(1, Math.floor(Number(batchRaw))))
    : DEFAULT_BATCH;

  try {
    const result = await sweepNicheBatch(apiKey, startIndex, batchSize);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[trends/sync-batch]', e);
    return NextResponse.json({ message: (e as Error).message ?? 'Sweep failed' }, { status: 500 });
  }
}
