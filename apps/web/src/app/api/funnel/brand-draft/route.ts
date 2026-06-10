import { NextRequest, NextResponse } from 'next/server';
import { buildFunnelBrandDraftForAccount } from '@/lib/funnel/build-brand-draft';
import { getFunnelSessionByToken, saveFunnelBrandContextDraft, FUNNEL_SESSION_COOKIE } from '@/lib/funnel-guest';

function readToken(req: NextRequest): string | null {
  return (
    req.headers.get('x-funnel-session')?.trim() ||
    req.cookies.get(FUNNEL_SESSION_COOKIE)?.value?.trim() ||
    null
  );
}

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const token = readToken(req);
  const row = await getFunnelSessionByToken(token);
  if (!row) {
    return NextResponse.json({ error: 'Invalid funnel session' }, { status: 401 });
  }

  const accountId =
    req.nextUrl.searchParams.get('accountId')?.trim() || row.connectedAccountId?.trim() || '';
  if (!accountId) {
    return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
  }

  const snapshot = await buildFunnelBrandDraftForAccount(accountId, row.guestUserId);
  if (!snapshot) {
    return NextResponse.json({ error: 'Account not found for this funnel session' }, { status: 404 });
  }

  await saveFunnelBrandContextDraft(token!, snapshot.draft);

  return NextResponse.json(snapshot);
}
