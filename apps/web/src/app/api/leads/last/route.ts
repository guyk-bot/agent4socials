import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { getSavedLeadsScan } from '@/lib/leads/leads-scan-cache';

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const saved = await getSavedLeadsScan(userId);
  if (!saved) {
    return NextResponse.json({ leads: [], scanned: 0, scannedAt: null });
  }
  return NextResponse.json({
    leads: saved.leads,
    scanned: saved.scanned,
    message: saved.message,
    accountId: saved.accountId,
    scannedAt: saved.scannedAt,
  });
}
