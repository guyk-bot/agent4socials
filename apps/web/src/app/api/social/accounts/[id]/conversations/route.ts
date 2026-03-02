import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/conversations
 * Returns list of conversations (DMs) for this Instagram or Facebook account.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, platformUserId: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }

  if (account.platform !== 'INSTAGRAM' && account.platform !== 'FACEBOOK') {
    return NextResponse.json({ conversations: [], hint: 'Conversations are only available for Instagram and Facebook.' });
  }

  const token = (account.accessToken || '').trim();
  if (!token) {
    return NextResponse.json({
      conversations: [],
      error: 'No access token. Reconnect this account from the sidebar (Reconnect Facebook & Instagram) and choose your Page.',
    }, { status: 200 });
  }

  const isInstagram = account.platform === 'INSTAGRAM';
  // Messenger Platform: Instagram inbox uses graph.facebook.com/PAGE-ID/conversations?platform=instagram with Page token.
  // When Instagram was connected via Facebook we have linkedPageId; use Page endpoint. Else (Instagram-only) use graph.instagram.com/me/conversations.
  let linkedPageId = isInstagram && account.credentialsJson && typeof account.credentialsJson === 'object' && (account.credentialsJson as { linkedPageId?: string }).linkedPageId;
  if (isInstagram && !linkedPageId && token) {
    // Existing account may have been connected via Facebook before we stored linkedPageId. Resolve Page ID from same user's Facebook account with same token.
    const fb = await prisma.socialAccount.findFirst({
      where: { userId, platform: 'FACEBOOK', accessToken: token },
      select: { platformUserId: true },
    });
    if (fb?.platformUserId) linkedPageId = fb.platformUserId;
  }
  const conversationsPath = isInstagram && linkedPageId
    ? `https://graph.facebook.com/v18.0/${linkedPageId}/conversations`
    : isInstagram
      ? 'https://graph.instagram.com/v18.0/me/conversations'
      : `${baseUrl}/${account.platformUserId}/conversations`;
  const queryParams: Record<string, string> = {
    fields: 'id,updated_time,senders{id,name,username,picture}',
    access_token: token,
  };
  if (isInstagram) queryParams.platform = 'instagram';

  try {
    const res = await axios.get<{
      data?: Array<{
        id: string;
        updated_time?: string;
        senders?: {
          data?: Array<{
            id?: string;
            name?: string;
            username?: string;
            picture?: { data?: { url?: string } } | string;
          }>;
        };
      }>;
      error?: { message: string };
    }>(conversationsPath, {
      params: queryParams,
      timeout: 60_000,
    });

    if (res.data?.error) {
      const msg = res.data.error.message ?? '';
      const code = (res.data as { error?: { code?: number } }).error?.code;
      const metaMsg = typeof msg === 'string' ? msg : '';
      if (msg.includes('permission') || msg.includes('OAuth') || msg.includes('access'))
        return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.', debug: { rawMessage: metaMsg, code, metaMessage: metaMsg } });
      return NextResponse.json({ conversations: [], error: metaMsg, debug: { rawMessage: metaMsg, code, metaMessage: metaMsg } });
    }

    let list = (res.data?.data ?? []).map((c) => {
      const sendersData = c.senders?.data ?? [];
      const picUrl = (p: { data?: { url?: string } } | string | undefined): string | null => {
        if (!p) return null;
        if (typeof p === 'string') return p;
        return p?.data?.url ?? null;
      };
      return {
        id: c.id,
        updatedTime: c.updated_time ?? null,
        senders: sendersData.map((s) => ({
          id: s.id,
          name: s.name,
          username: s.username,
          pictureUrl: picUrl(s.picture),
        })),
      };
    });

    // Best-effort enrichment: if Meta returned sender IDs but no names/usernames/pictures,
    // look up profiles in a second call using the ids=... pattern.
    const missingProfileIds = new Set<string>();
    for (const conv of list) {
      for (const s of conv.senders) {
        if (s.id && !s.name && !s.username) {
          missingProfileIds.add(s.id);
        }
      }
    }

    if (missingProfileIds.size > 0) {
      try {
        const idsParam = Array.from(missingProfileIds).join(',');
        const profileFields = isInstagram
          ? 'id,name,username,profile_pic,profile_picture_url,picture'
          : 'id,name,first_name,last_name,profile_pic,picture';

        const profileRes = await axios.get<
          Record<
            string,
            {
              id?: string;
              name?: string;
              username?: string;
              first_name?: string;
              last_name?: string;
              profile_pic?: string;
              profile_picture_url?: string;
              picture?: { data?: { url?: string } };
            }
          >
        >(baseUrl, {
          params: {
            ids: idsParam,
            fields: profileFields,
            access_token: token,
          },
          timeout: 30_000,
        });

        const profiles = profileRes.data ?? {};
        list = list.map((conv) => ({
          ...conv,
          senders: conv.senders.map((s) => {
            if (!s.id) return s;
            const profile = profiles[s.id];
            if (!profile) return s;

            const fullName =
              profile.name ||
              [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
              undefined;
            const profilePicture =
              profile.profile_pic ||
              profile.profile_picture_url ||
              profile.picture?.data?.url ||
              null;

            return {
              ...s,
              name: s.name || fullName || s.name,
              username: s.username || profile.username || s.username,
              pictureUrl: s.pictureUrl || profilePicture || s.pictureUrl,
            };
          }),
        }));
      } catch (e) {
        console.warn('[Conversations] profile enrichment failed:', (e as Error)?.message);
      }
    }

    return NextResponse.json({ conversations: list });
  } catch (e) {
    const err = e as { message?: string; code?: string; response?: { data?: unknown; status?: number } };
    const msg = err?.message ?? '';
    const status = err?.response?.status;
    const axiosData = err?.response?.data;
    const isTimeout = err?.code === 'ECONNABORTED' || /timeout|408/i.test(msg);
    if (status === 400) {
      const metaMsg = axiosData && typeof axiosData === 'object' && (axiosData as { error?: { message?: string } }).error?.message;
      const hint = account.platform === 'INSTAGRAM'
        ? 'Instagram returned 400. Ensure instagram_manage_messages is granted: reconnect from the sidebar and choose your Page, or request Advanced Access in Meta App Dashboard.'
        : 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.';
      return NextResponse.json({
        conversations: [],
        error: hint,
        debug: { rawMessage: msg, responseData: axiosData, ...(metaMsg ? { metaMessage: metaMsg } : {}) },
      });
    }
    if (msg.includes('403') || msg.includes('permission') || msg.includes('OAuth'))
      return NextResponse.json({ conversations: [], error: 'Reconnect from the sidebar and choose your Page when asked to grant messaging permission.', debug: { rawMessage: msg, responseData: axiosData } });
    if (isTimeout)
      return NextResponse.json({ conversations: [], error: 'The request to load conversations timed out. Try again. If you have many Instagram conversations, request Advanced Access for instagram_manage_messages in Meta App Dashboard, or reconnect and choose your Page.', debug: { rawMessage: msg, responseData: axiosData } });
    console.error('[Conversations] error:', e);
    return NextResponse.json({ conversations: [], error: 'Could not load conversations.', debug: { rawMessage: msg, responseData: axiosData } });
  }
}
