import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { mergeFunnelSessionToUser } from '@/lib/funnel-guest';
import { recordUserProductEvent } from '@/lib/user-product-events';

export async function POST(req: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { funnelToken?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const funnelToken = body.funnelToken?.trim() || req.headers.get('x-funnel-session')?.trim();
  if (!funnelToken) {
    return NextResponse.json({ error: 'Missing funnel session' }, { status: 400 });
  }

  try {
    const result = await mergeFunnelSessionToUser(funnelToken, userId);
    void recordUserProductEvent(userId, 'funnel_merged', {
      merged_accounts: result.mergedAccounts,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('[funnel/merge]', (e as Error)?.message);
    return NextResponse.json({ error: 'Merge failed' }, { status: 503 });
  }
}
