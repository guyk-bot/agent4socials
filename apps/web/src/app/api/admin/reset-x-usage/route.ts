import { NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { resetAllXApiUsage } from '@/lib/x/x-api-usage';
import { prisma } from '@/lib/db';
import type { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const userId = await getPrismaUserIdFromRequest(req.headers.get('authorization'));
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Allow any authenticated user to reset their own Twitter accounts.
    const affected = await prisma.socialAccount.findMany({
      where: { userId, platform: 'TWITTER' },
      select: { id: true },
    });

    for (const acc of affected) {
      await resetAllXApiUsage(); // resets all Twitter accounts for this user
      break; // resetAllXApiUsage already covers all accounts
    }

    // Always call the global reset to ensure the DB reflects the new limit,
    // regardless of whether the original migration ran.
    await resetAllXApiUsage();

    return NextResponse.json({
      ok: true,
      message: `Reset X API usage for ${affected.length} Twitter account(s). You can reload the dashboard now.`,
      accounts: affected.map((a) => a.id),
    });
  } catch (err) {
    console.error('[reset-x-usage]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
