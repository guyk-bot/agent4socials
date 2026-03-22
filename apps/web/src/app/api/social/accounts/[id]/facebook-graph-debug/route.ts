import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl, metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';
import { FACEBOOK_PAGE_DAY_METRIC_CANDIDATES } from '@/lib/facebook/metric-candidates';
import { probePageDayMetric } from '@/lib/facebook/discovery';

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
      graphApiVersion: facebookGraphBaseUrl.replace('https://graph.facebook.com/', ''),
      description:
        'All calls below use the same graphApiVersion (META_GRAPH_API_VERSION, default v22). Page /insights requires a valid metric= per request; comma lists fail if any name is invalid. Field notifications is not available on Page objects.',
    },
  };

  if (appToken) {
    out.debug_token = await getJson(`${facebookGraphBaseUrl}/debug_token`, {
      input_token: token,
      access_token: appToken,
    });
  } else {
    out.debug_token = {
      url: `${facebookGraphBaseUrl}/debug_token`,
      status: 0,
      data: { skipped: true, reason: 'META_APP_ID and META_APP_SECRET not set in this environment' },
    };
  }

  out.page_fields = await getJson(`${facebookGraphBaseUrl}/${pageId}`, {
    fields:
      'id,name,username,fan_count,followers_count,about,category,category_list,verification_status,link,website,phone,is_published,is_verified',
    access_token: token,
  });

  // Single-metric probes (matches production discovery). Never use a comma-separated metric= list here.
  const probeMetrics = FACEBOOK_PAGE_DAY_METRIC_CANDIDATES.slice(0, 12);
  out.insights_metric_probes = await Promise.all(
    probeMetrics.map(async (metric) => {
      const r = await probePageDayMetric(pageId, token, metric, sinceStr, untilPlus);
      const url = `${metaGraphInsightsBaseUrl}/${pageId}/insights?metric=${encodeURIComponent(metric)}&period=day&since=${sinceStr}&until=${untilPlus}`;
      if (r.ok) {
        return { metric, url, status: 200, ok: true as const };
      }
      return {
        metric,
        url,
        status: 400,
        ok: false as const,
        error: r.error,
        code: r.code,
      };
    })
  );

  out.published_posts_sample = await getJson(`${facebookGraphBaseUrl}/${pageId}/published_posts`, {
    fields: 'id,message,created_time,permalink_url',
    limit: 5,
    access_token: token,
  });

  out.posts_feed_sample = await getJson(`${facebookGraphBaseUrl}/${pageId}/posts`, {
    fields: 'id,message,created_time',
    limit: 5,
    access_token: token,
  });

  out.conversations_sample = await getJson(`${facebookGraphBaseUrl}/${pageId}/conversations`, {
    platform: 'MESSENGER',
    limit: 3,
    access_token: token,
  });

  out.page_notifications_unavailable = {
    note: 'GET /{page-id}/notifications is not a valid Page field. Meta returns (#100) Tried accessing nonexisting field (notifications). Do not call it.',
  };

  out.ratings_sample = await getJson(`${facebookGraphBaseUrl}/${pageId}/ratings`, {
    limit: 3,
    access_token: token,
  });

  return NextResponse.json(out, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
