import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { signTwitterRequest } from '@/lib/twitter-oauth1';

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
    select: { id: true, platform: true, platformUserId: true, username: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  if (account.platform !== 'TWITTER') {
    return NextResponse.json({ message: 'x-dm-debug is only for X (Twitter) accounts' }, { status: 400 });
  }
  const token = (account.accessToken || '').trim();
  const credJson = (account.credentialsJson && typeof account.credentialsJson === 'object'
    ? account.credentialsJson : {}) as Record<string, unknown>;
  // Only use OAuth 1.0a if THIS account was explicitly connected via OAuth 1.0a.
  // Env var TWITTER_ACCESS_TOKEN may belong to a different X account (dev account).
  const oauth1UserToken = credJson.twitterOAuth1AccessToken as string | undefined;
  const oauth1UserSecret = credJson.twitterOAuth1AccessTokenSecret as string | undefined;
  const useOAuth1ForDm = Boolean(oauth1UserToken && oauth1UserSecret && process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET);

  if (!token && !useOAuth1ForDm) {
    return NextResponse.json({
      error: 'No token for X',
      hint: 'Set TWITTER_ACCESS_TOKEN and TWITTER_ACCESS_TOKEN_SECRET (OAuth 1.0 user keys) and TWITTER_API_KEY, TWITTER_API_SECRET (consumer keys), or reconnect X.',
    });
  }

  const grantedScope = (credJson.grantedScope as string | undefined) ?? null;
  const out: {
    account: { id: string; username: string | null; platformUserId: string | null; grantedScope: string | null };
    authUsed: string;
    usersMe: { status: number; data?: unknown; error?: unknown; message?: string };
    dmEvents: { status: number; url: string; params: Record<string, string>; auth: string; data?: unknown; meta?: unknown; error?: unknown; message?: string; fullResponse?: unknown };
  } = {
    account: { id: account.id, username: account.username, platformUserId: account.platformUserId, grantedScope },
    authUsed: useOAuth1ForDm ? 'OAuth 1.0a (user Access Token + Secret)' : 'Bearer (OAuth 2.0 user token via PKCE)',
    usersMe: { status: 0 },
    dmEvents: { status: 0, url: 'https://api.x.com/2/dm_events', params: {}, auth: useOAuth1ForDm ? 'OAuth 1.0a' : 'Bearer' },
  };

  // 1) GET users/me to verify token (scope is not a valid user.fields value in X API v2)
  try {
    const meRes = await axios.get('https://api.x.com/2/users/me', {
      params: { 'user.fields': 'id,username,name,public_metrics' },
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

  // 2) GET dm_events — official docs use event_types: MessageCreate and Bearer user token
  const dmParams: Record<string, string> = {
    'dm_event.fields': 'id,text,sender_id,dm_conversation_id,created_at,participant_ids',
    event_types: 'MessageCreate',
    expansions: 'sender_id,participant_ids',
    'user.fields': 'id,name,username,profile_image_url',
    max_results: '100',
  };
  out.dmEvents.params = dmParams;
  try {
    const dmHeaders = useOAuth1ForDm
      ? signTwitterRequest('GET', 'https://api.x.com/2/dm_events', { key: oauth1UserToken!, secret: oauth1UserSecret! }, dmParams)
      : { Authorization: `Bearer ${token}` };
    const dmRes = await axios.get('https://api.x.com/2/dm_events', {
      params: dmParams,
      headers: dmHeaders,
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
