import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * GET /api/social/accounts/[id]/x-dm-debug
 * Calls X API users/me and dm_events with the account token and returns raw responses
 * so we can see why DMs might not be loading (e.g. 403, 0 events, error message).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, username: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'TWITTER') {
    return NextResponse.json({ message: 'x-dm-debug is only for X (Twitter) accounts' }, { status: 400 });
  }
  const token = (account.accessToken || '').trim();
  if (!token) {
    return NextResponse.json({
      error: 'No access token',
      hint: 'Reconnect X from the sidebar so we have a token to test with.',
    });
  }

  const out: {
    account: { id: string; username: string | null; platformUserId: string | null };
    usersMe: { status: number; data?: unknown; error?: unknown; message?: string };
    dmEvents: { status: number; url: string; params: Record<string, string>; data?: unknown; meta?: unknown; error?: unknown; message?: string; fullResponse?: unknown };
  } = {
    account: { id: account.id, username: account.username, platformUserId: account.platformUserId },
    usersMe: { status: 0 },
    dmEvents: { status: 0, url: 'https://api.x.com/2/dm_events', params: {} },
  };

  // 1) GET users/me to verify token
  try {
    const meRes = await axios.get('https://api.x.com/2/users/me', {
      params: { 'user.fields': 'id,username,name' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10_000,
      validateStatus: () => true,
    });
    out.usersMe.status = meRes.status;
    out.usersMe.data = meRes.data?.data ?? null;
    out.usersMe.error = meRes.data?.errors ?? meRes.data?.error ?? null;
    if (meRes.status !== 200) {
      out.usersMe.message = meRes.data?.detail ?? meRes.data?.title ?? (typeof meRes.data === 'object' ? JSON.stringify(meRes.data) : String(meRes.data));
    }
  } catch (e) {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    out.usersMe.status = err?.response?.status ?? 0;
    out.usersMe.message = err?.message ?? 'Request failed';
    out.usersMe.error = err?.response?.data ?? null;
  }

  // 2) GET dm_events with same params as conversations route (no event_types — it can cause 0 results on some tiers)
  const dmParams: Record<string, string> = {
    'dm_event.fields': 'dm_conversation_id,created_at,sender_id,participant_ids',
    expansions: 'sender_id,participant_ids',
    'user.fields': 'id,name,username,profile_image_url',
    max_results: '100',
  };
  out.dmEvents.params = dmParams;
  try {
    const dmRes = await axios.get('https://api.x.com/2/dm_events', {
      params: dmParams,
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15_000,
      validateStatus: () => true,
    });
    out.dmEvents.status = dmRes.status;
    out.dmEvents.data = dmRes.data?.data ?? null;
    out.dmEvents.meta = dmRes.data?.meta ?? null;
    out.dmEvents.error = dmRes.data?.errors ?? dmRes.data?.error ?? null;
    out.dmEvents.fullResponse = dmRes.data ?? null;
    if (dmRes.status !== 200) {
      out.dmEvents.message = dmRes.data?.detail ?? dmRes.data?.title ?? (dmRes.data?.error?.message ?? (typeof dmRes.data === 'object' ? JSON.stringify(dmRes.data) : String(dmRes.data)));
    } else if (Array.isArray(dmRes.data?.data)) {
      out.dmEvents.message = `Returned ${dmRes.data.data.length} DM event(s)`;
    } else {
      out.dmEvents.message = 'Response had no data array';
    }
  } catch (e) {
    const err = e as { response?: { status?: number; data?: unknown }; message?: string };
    out.dmEvents.status = err?.response?.status ?? 0;
    out.dmEvents.message = err?.message ?? 'Request failed';
    out.dmEvents.error = err?.response?.data ?? null;
  }

  return NextResponse.json(out);
}
