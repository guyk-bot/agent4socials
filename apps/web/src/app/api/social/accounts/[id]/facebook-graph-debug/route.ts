import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl, metaGraphInsightsBaseUrl } from '@/lib/meta-graph-insights';
import {
  FACEBOOK_PAGE_DAY_METRIC_CANDIDATES,
  FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES,
} from '@/lib/facebook/metric-candidates';
import { probePageDayMetric } from '@/lib/facebook/discovery';

type Bucket = { url: string; status: number; data: unknown };

/** Strip access_token query values so paging.next URLs are safe to copy. */
function redactAccessTokensInJson(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/access_token=[^&\s"'<>]+/gi, 'access_token=[REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactAccessTokensInJson);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      next[k] = redactAccessTokensInJson(o[k]);
    }
    return next;
  }
  return value;
}

function firstGraphListItemId(data: unknown): string | null {
  const d = data as { data?: { id?: string }[] };
  const id = d?.data?.[0]?.id;
  return typeof id === 'string' ? id : null;
}

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
 * Query: `full=1` adds full `/{page-id}/insights` and `/{post-id}/insights` bodies for every candidate metric
 * (many Graph calls; paging URLs in JSON are token-redacted).
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
  const fullExport = request.nextUrl.searchParams.get('full') === '1';
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
      fullExport,
      description:
        'All calls below use the same graphApiVersion (META_GRAPH_API_VERSION, default v22). Page /insights requires a valid metric= per request; comma lists fail if any name is invalid. Field notifications is not available on Page objects. URL strings in JSON have access_token values redacted. For stored DB rows and discovery registry, use GET .../facebook-analytics-debug and .../facebook-storage-evidence.',
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

  const publishedPostsSample = await getJson(`${facebookGraphBaseUrl}/${pageId}/published_posts`, {
    fields: 'id,message,created_time,permalink_url',
    limit: 5,
    access_token: token,
  });
  out.published_posts_sample = publishedPostsSample;

  const insightsUrl = `${metaGraphInsightsBaseUrl}/${pageId}/insights`;

  if (fullExport) {
    out.insights_page_day_all_metrics = await Promise.all(
      FACEBOOK_PAGE_DAY_METRIC_CANDIDATES.map(async (metric) => {
        const bucket = await getJson(insightsUrl, {
          metric,
          period: 'day',
          since: sinceStr,
          until: untilPlus,
          access_token: token,
        });
        return { metric, ...bucket };
      })
    );
    const samplePostId = firstGraphListItemId(publishedPostsSample.data);
    if (samplePostId) {
      const postInsightsUrl = `${metaGraphInsightsBaseUrl}/${samplePostId}/insights`;
      out.insights_post_lifetime_all_metrics = await Promise.all(
        FACEBOOK_POST_LIFETIME_METRIC_CANDIDATES.map(async (metric) => {
          const bucket = await getJson(postInsightsUrl, {
            metric,
            period: 'lifetime',
            access_token: token,
          });
          return { metric, postId: samplePostId, ...bucket };
        })
      );
    } else {
      out.insights_post_lifetime_all_metrics = {
        skipped: true,
        reason: 'No post id in published_posts_sample (empty feed or error).',
      };
    }
  } else {
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
  }

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

  return NextResponse.json(redactAccessTokensInJson(out), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
