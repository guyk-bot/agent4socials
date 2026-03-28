import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';
import { facebookGraphBaseUrl } from '@/lib/meta-graph-insights';
import { fetchInstagramDemographics } from '@/lib/analytics/extended-fetchers';

type Bucket = { url: string; status: number; data: unknown };

/** Same host/version as DM/comments routes for Instagram Business Login tokens. */
const graphInstagramHostBaseUrl = 'https://graph.instagram.com/v25.0';

const IG_USER_FIELDS =
  'id,username,name,profile_picture_url,followers_count,follows_count,media_count,biography,website,ig_id';

/**
 * Account-level day metrics (one request each in full export). Unsupported names return 400 in JSON.
 */
const IG_ACCOUNT_DAY_METRIC_CANDIDATES = [
  'impressions',
  'reach',
  'profile_views',
  'accounts_engaged',
  'follower_count',
  'website_clicks',
  'email_contacts',
  'phone_call_clicks',
  'text_message_clicks',
  'get_directions_clicks',
  'total_interactions',
];

const IG_MEDIA_INSIGHT_METRICS = 'impressions,reach,engagement,likes,comments,shares,saves';

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

function firstMediaId(data: unknown): string | null {
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

async function insightsDaySingleMetric(
  baseUrl: string,
  igUserId: string,
  token: string,
  since: number,
  until: number,
  metric: string
): Promise<Bucket & { metric: string }> {
  const url = `${baseUrl}/${igUserId}/insights`;
  const bucket = await getJson(url, {
    metric,
    period: 'day',
    since,
    until,
    access_token: token,
  });
  return { metric, ...bucket };
}

/**
 * GET /api/social/accounts/[id]/instagram-graph-debug
 * Raw Meta JSON for the connected Instagram professional account: graph.facebook.com (Page-linked)
 * and graph.instagram.com (Instagram Business Login). Tokens in paging URLs are redacted.
 * Query: full=1 — per-metric day insights, demographics probes, first media insights (many requests).
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
    where: { id, userId, platform: 'INSTAGRAM' },
    select: { id: true, platformUserId: true, username: true, accessToken: true, credentialsJson: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Instagram account not found' }, { status: 404 });
  }

  const igUserId = account.platformUserId;
  const token = account.accessToken?.trim() ?? '';
  if (!token) {
    return NextResponse.json({ message: 'No access token on account' }, { status: 400 });
  }

  const credJson =
    account.credentialsJson && typeof account.credentialsJson === 'object'
      ? (account.credentialsJson as Record<string, unknown>)
      : {};
  const instagramBusinessLogin = credJson.loginMethod === 'instagram_business';

  const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

  const untilSec = Math.floor(Date.now() / 1000);
  const sinceSec = untilSec - 28 * 24 * 60 * 60;

  const fbVersion = facebookGraphBaseUrl.replace('https://graph.facebook.com/', '');
  const out: Record<string, unknown> = {
    _meta: {
      igUserId,
      username: account.username,
      instagramBusinessLogin,
      facebookGraphApiVersion: fbVersion,
      graphInstagramHost: graphInstagramHostBaseUrl.replace('https://', ''),
      fullExport,
      description:
        'Bundles graph.facebook.com (IG user id + Page token when linked) and graph.instagram.com/v25.0 (Instagram Business Login). Day insights use a 28-day window (Instagram API limit). access_token values in URLs are redacted.',
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

  out.graph_facebook_ig_user = await getJson(`${facebookGraphBaseUrl}/${igUserId}`, {
    fields: IG_USER_FIELDS,
    access_token: token,
  });

  out.graph_instagram_me = await getJson(`${graphInstagramHostBaseUrl}/me`, {
    fields: IG_USER_FIELDS,
    access_token: token,
  });

  out.graph_instagram_ig_user = await getJson(`${graphInstagramHostBaseUrl}/${igUserId}`, {
    fields: IG_USER_FIELDS,
    access_token: token,
  });

  const mediaFields = 'id,media_type,media_product_type,caption,timestamp,permalink,thumbnail_url';
  out.graph_facebook_ig_media_sample = await getJson(`${facebookGraphBaseUrl}/${igUserId}/media`, {
    fields: mediaFields,
    limit: 5,
    access_token: token,
  });

  out.graph_instagram_me_media_sample = await getJson(`${graphInstagramHostBaseUrl}/me/media`, {
    fields: mediaFields,
    limit: 5,
    access_token: token,
  });

  const combinedMetricSets = [
    'impressions,reach,profile_views,accounts_engaged',
    'impressions,reach,profile_views',
    'reach',
  ];
  out.insights_combined_probes_facebook = await Promise.all(
    combinedMetricSets.map(async (metric) => {
      const url = `${facebookGraphBaseUrl}/${igUserId}/insights`;
      const b = await getJson(url, {
        metric,
        period: 'day',
        since: sinceSec,
        until: untilSec,
        access_token: token,
      });
      return { metric, ...b };
    })
  );

  out.insights_combined_probes_instagram_host = await Promise.all(
    combinedMetricSets.map(async (metric) => {
      const url = `${graphInstagramHostBaseUrl}/${igUserId}/insights`;
      const b = await getJson(url, {
        metric,
        period: 'day',
        since: sinceSec,
        until: untilSec,
        access_token: token,
      });
      return { metric, ...b };
    })
  );

  out.insights_follows_and_unfollows_facebook = await getJson(`${facebookGraphBaseUrl}/${igUserId}/insights`, {
    metric: 'follows_and_unfollows',
    period: 'day',
    metric_type: 'total_value',
    breakdown: 'follow_type',
    since: sinceSec,
    until: untilSec,
    access_token: token,
  });

  out.insights_follows_and_unfollows_instagram_host = await getJson(
    `${graphInstagramHostBaseUrl}/${igUserId}/insights`,
    {
      metric: 'follows_and_unfollows',
      period: 'day',
      metric_type: 'total_value',
      breakdown: 'follow_type',
      since: sinceSec,
      until: untilSec,
      access_token: token,
    }
  );

  if (fullExport) {
    out.insights_day_all_metrics_facebook = await Promise.all(
      IG_ACCOUNT_DAY_METRIC_CANDIDATES.map((metric) =>
        insightsDaySingleMetric(facebookGraphBaseUrl, igUserId, token, sinceSec, untilSec, metric).then((b) => ({
          host: 'graph.facebook.com',
          ...b,
        }))
      )
    );

    out.insights_day_all_metrics_instagram_host = await Promise.all(
      IG_ACCOUNT_DAY_METRIC_CANDIDATES.map((metric) =>
        insightsDaySingleMetric(graphInstagramHostBaseUrl, igUserId, token, sinceSec, untilSec, metric).then((b) => ({
          host: 'graph.instagram.com',
          ...b,
        }))
      )
    );

    try {
      const dem = await fetchInstagramDemographics(igUserId, token, 'last_30_days');
      out.demographics_extended = {
        demographics: dem.demographics,
        raw: dem.raw,
      };
    } catch (e) {
      out.demographics_extended = {
        error: (e as Error)?.message ?? String(e),
      };
    }

    const sampleMediaId =
      firstMediaId((out.graph_facebook_ig_media_sample as Bucket).data) ??
      firstMediaId((out.graph_instagram_me_media_sample as Bucket).data);

    if (sampleMediaId) {
      out.media_insights_first_item_facebook = await getJson(
        `${facebookGraphBaseUrl}/${sampleMediaId}/insights`,
        {
          metric: IG_MEDIA_INSIGHT_METRICS,
          period: 'lifetime',
          access_token: token,
        }
      );
      out.media_insights_first_item_instagram_host = await getJson(
        `${graphInstagramHostBaseUrl}/${sampleMediaId}/insights`,
        {
          metric: IG_MEDIA_INSIGHT_METRICS,
          period: 'lifetime',
          access_token: token,
        }
      );
      out.media_insights_note = { mediaId: sampleMediaId };
    } else {
      out.media_insights_first_item = {
        skipped: true,
        reason: 'No media id in graph_facebook_ig_media_sample or graph_instagram_me_media_sample.',
      };
    }
  }

  if (!fullExport) {
    out.note =
      'Add ?full=1 for per-metric day insights, demographics breakdown calls, and first media lifetime insights (many Graph requests).';
  }

  return NextResponse.json(redactAccessTokensInJson(out), {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
