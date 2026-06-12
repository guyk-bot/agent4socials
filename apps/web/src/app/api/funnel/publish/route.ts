import { NextRequest, NextResponse } from 'next/server';
import { runFunnelGuestPublish } from '@/lib/funnel-guest-actions';

export const maxDuration = 60;

type Body = { caption?: string };

export async function POST(req: NextRequest) {
  const token = req.headers.get('x-funnel-session')?.trim();
  if (!token) {
    return NextResponse.json({ error: 'Missing funnel session' }, { status: 400 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const caption = typeof body.caption === 'string' ? body.caption.trim() : '';
  if (!caption || caption.length > 500) {
    return NextResponse.json({ error: 'Caption is required (max 500 characters).' }, { status: 400 });
  }

  const result = await runFunnelGuestPublish(token, caption);
  return NextResponse.json(result);
}
