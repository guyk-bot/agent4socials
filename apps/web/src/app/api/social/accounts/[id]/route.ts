import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

/**
 * Soft disconnect: set status = disconnected and disconnectedAt = now.
 * Do NOT delete the account or any metric snapshots; history is preserved for reconnect.
 * When the user reconnects the same account (same platform + platformUserId), the same row is updated.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      status: 'disconnected',
      disconnectedAt: new Date(),
      accessToken: '',
      refreshToken: null,
    },
  });
  return NextResponse.json({ ok: true });
}
