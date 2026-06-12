import { NextRequest, NextResponse } from 'next/server';
import { runFunnelGuestAnalytics } from '@/lib/funnel-guest-actions';

export const maxDuration = 45;

export async function GET(req: NextRequest) {
  const token = req.headers.get('x-funnel-session')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing funnel session' }, { status: 400 });
  }
  const result = await runFunnelGuestAnalytics(token);
  return NextResponse.json(result);
}
