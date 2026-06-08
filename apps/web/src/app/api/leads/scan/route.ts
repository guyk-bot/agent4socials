import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { scanLeads } from '@/lib/leads/scan-leads';
import { saveLeadsScan } from '@/lib/leads/leads-scan-cache';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return NextResponse.json({ message: 'Lead mining needs OPENAI_API_KEY' }, { status: 503 });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  let body: { accountId?: string } = {};
  try {
    body = (await request.json()) as { accountId?: string };
  } catch {
    /* allow empty body = scan all accounts */
  }

  try {
    const accountId = body.accountId ?? null;
    const result = await scanLeads(userId, accountId);
    await saveLeadsScan(userId, {
      accountId,
      scanned: result.scanned,
      leads: result.leads,
      message: result.message,
    });
    return NextResponse.json({ ...result, scannedAt: new Date().toISOString() });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error('[leads/scan]', raw);
    return NextResponse.json(
      { message: raw.length < 280 ? raw : 'Lead scan failed. Try again.' },
      { status: 502 }
    );
  }
}
