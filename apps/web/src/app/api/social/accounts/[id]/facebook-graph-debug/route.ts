import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const FB = 'https://graph.facebook.com/v18.0';

type Bucket = { url: string; status: number; data: unknown };

async function getJson(url: string, params: Record<string, string | number | undefined>): Promise<Bucket> {
  try {
    const res = await axios.get(url, { params, timeout: 12_000, validateStatus: () => true });
    return { url, status: res.status, data: res.data };
  } catch (e) {
    const ax = e as { message?: string; response?: { status?: number; data?: unknown } };
    return {
      url,
      status: ax.response?.status ?? 0,
      data: ax.response?.data ?? { error: ax.message ?? 'request failed' },
    };
  }
}

/**
 * GET /api/social/accounts/[id]/facebook-graph-debug
 * Returns raw Graph API JSON for the connected Facebook Page (read_insights, page fields, sample posts, etc.).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getPrismaUserIdFromRequest(_request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: 'FACEBOOK' },
    select: { id: true, platformUserId: true, username: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Facebook account not found' }, { status: 404 });
  }

  const pageId = account.platformUserId;
  const token = account.accessToken?.trim() ?? '';
  if (!token) {
    return NextResponse.json({ message: 'No access token on account' }, { status: 400 });
  }

  const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

  const until = new Date();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 7);
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);
  const untilPlus = (() => {
    const d = new Date(untilStr + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const out: Record<string, Bucket | unknown> = {
    _meta: {
      pageId,
      username: account.username,
      description:
        'Raw responses from Graph API. If insights_read_insights returns (#100) invalid metric, Meta deprecated a name (e.g. page_impressions → page_media_view), not missing read_insights. Scopes are listed under debug_token.',
    },
  };

  if (appToken) {
    out.debug_token = await getJson(`${FB}/debug_token`, {
      input_token: token,
      access_token: appToken,
    });
  } else {
    out.debug_token = {
      url: `${FB}/debug_token`,
      status: 0,
      data: { skipped: true, reason: 'META_APP_ID and META_APP_SECRET not set in this environment' },
    };
  }

  out.page_fields = await getJson(`${FB}/${pageId}`, {
    fields:
      'id,name,username,fan_count,followers_count,about,category,category_list,verification_status,link,website,phone,is_published,is_verified',
    access_token: token,
  });

  // Meta deprecated page_impressions (use page_media_view). Omit page_fan_removes here so this bucket is less likely to 400.
  out.insights_read_insights = await getJson(`${FB}/${pageId}/insights`, {
    metric: 'page_media_view,page_views_total,page_engaged_users,page_fan_adds',
    period: 'day',
    since: sinceStr,
    until: untilPlus,
    access_token: token,
  });

  out.published_posts_sample = await getJson(`${FB}/${pageId}/published_posts`, {
    fields: 'id,message,created_time,permalink_url',
    limit: 5,
    access_token: token,
  });

  out.posts_feed_sample = await getJson(`${FB}/${pageId}/posts`, {
    fields: 'id,message,created_time',
    limit: 5,
    access_token: token,
  });

  out.conversations_sample = await getJson(`${FB}/${pageId}/conversations`, {
    platform: 'MESSENGER',
    limit: 3,
    access_token: token,
  });

  out.page_notifications_sample = await getJson(`${FB}/${pageId}/notifications`, {
    limit: 5,
    access_token: token,
  });

  out.ratings_sample = await getJson(`${FB}/${pageId}/ratings`, {
    limit: 3,
    access_token: token,
  });

  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
