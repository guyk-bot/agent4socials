import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/automation/reset-welcome-history
 * Clears all dmFirstWelcomeSent rows for the current user so that
 * first-incoming auto-DM can fire again for previously-welcomed conversations.
 * Useful during testing.
 */
export async function DELETE(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const accountIds = (
    await prisma.socialAccount.findMany({
      where: { userId },
      select: { id: true },
    })
  ).map((a) => a.id);

  const { count } = await prisma.dmFirstWelcomeSent.deleteMany({
    where: { socialAccountId: { in: accountIds } },
  });

  return NextResponse.json({ ok: true, deleted: count });
}
