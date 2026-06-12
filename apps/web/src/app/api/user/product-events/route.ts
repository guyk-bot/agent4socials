import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { recordUserProductEvent } from '@/lib/user-product-events';

export const runtime = 'nodejs';

type Body = {
  event?: string;
  properties?: Record<string, string | number | boolean | null>;
};

export async function POST(req: NextRequest) {
  const userId = await getPrismaUserIdFromRequest(req.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const event = typeof body.event === 'string' ? body.event.trim() : '';
  if (!event || event.length > 80) {
    return NextResponse.json({ error: 'Invalid event name' }, { status: 400 });
  }

  await recordUserProductEvent(userId, event, body.properties ?? undefined);
  return NextResponse.json({ ok: true });
}
