import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

/** POST /api/social/pending/dismiss — clear OAuth picker session after connect completes. */
export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  let body: { pendingId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Invalid JSON' }, { status: 400 });
  }
  const { pendingId } = body;
  if (!pendingId) {
    return NextResponse.json({ message: 'Missing pendingId' }, { status: 400 });
  }
  await prisma.pendingConnection.deleteMany({
    where: { id: pendingId, userId },
  });
  return NextResponse.json({ ok: true });
}
