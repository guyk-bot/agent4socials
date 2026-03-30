import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';

/** Apply connection-history migration if DB is missing columns (e.g. production never ran migrate deploy). */
async function ensureConnectionHistoryMigration() {
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "firstConnectedAt" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(`ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3)`);
    await prisma.$executeRawUnsafe(
      `UPDATE "SocialAccount" SET "firstConnectedAt" = "createdAt", "connectedAt" = "createdAt" WHERE "firstConnectedAt" IS NULL`
    );
  } catch (_) {
    // ignore
  }
}

/**
 * Soft disconnect: set status = disconnected and disconnectedAt = now.
 * Do NOT delete the account or any metric snapshots; history is preserved for reconnect.
 * When the user reconnects the same account (same platform + platformUserId), the same row is updated.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
    }
    const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
    if (!userId) {
      return NextResponse.json({ message: 'Unauthorized. Sign in again and try disconnecting.' }, { status: 401 });
    }
    const { id } = await params;

    const account = await prisma.socialAccount.findFirst({
      where: { id, userId },
      select: { id: true, status: true },
    });
    if (!account) {
      return NextResponse.json({ message: 'Account not found. It may already be disconnected.' }, { status: 404 });
    }
    if (account.status === 'disconnected') {
      return NextResponse.json({ ok: true });
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
  } catch (e) {
    const errMsg = (e as Error)?.message ?? '';
    if (/firstConnectedAt|does not exist|column.*does not exist/i.test(errMsg)) {
      await ensureConnectionHistoryMigration();
      try {
        const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
        if (!userId) {
          return NextResponse.json({ message: 'Unauthorized. Sign in again and try disconnecting.' }, { status: 401 });
        }
        const { id } = await params;
        const account = await prisma.socialAccount.findFirst({
          where: { id, userId },
          select: { id: true, status: true },
        });
        if (!account) {
          return NextResponse.json({ message: 'Account not found. It may already be disconnected.' }, { status: 404 });
        }
        if (account.status === 'disconnected') {
          return NextResponse.json({ ok: true });
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
      } catch (_) {
        // fall through to generic error below
      }
    }
    const err = e as Error & { code?: string };
    const msg = err?.message ?? 'Disconnect failed';
    console.error('[DELETE /social/accounts/:id]', msg, err?.code ?? '');
    const isPoolerError = /Invalid.*invocation|prepared statement|42P05/i.test(msg);
    const userMessage = isPoolerError
      ? 'Database connection issue. Try again in a moment.'
      : msg.includes('Database') || msg.includes('connection')
        ? 'Database temporarily unavailable. Try again in a moment.'
        : 'Could not disconnect. Try again.';
    return NextResponse.json({ message: userMessage }, { status: 500 });
  }
}
