import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

type AccountItem = { id: string; username?: string; profilePicture?: string };

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const pendingId = request.nextUrl.searchParams.get('pendingId');
  if (!pendingId) {
    return NextResponse.json({ message: 'Missing pendingId' }, { status: 400 });
  }
  const pending = await prisma.pendingConnection.findUnique({
    where: { id: pendingId },
  });
  if (!pending || pending.userId !== userId || pending.platform !== 'INSTAGRAM') {
    return NextResponse.json({ message: 'Not found or expired' }, { status: 404 });
  }
  const payload = pending.payload as { accounts?: AccountItem[]; accessToken?: string };
  if (pending.expiresAt && new Date() > pending.expiresAt) {
    await prisma.pendingConnection.delete({ where: { id: pendingId } }).catch(() => {});
    return NextResponse.json({ message: 'Expired' }, { status: 410 });
  }
  const accounts = (payload?.accounts ?? []) as AccountItem[];
  return NextResponse.json({ accounts });
}
