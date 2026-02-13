import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/insights?since=YYYY-MM-DD&until=YYYY-MM-DD
 * Returns account-level analytics (followers, impressions over time) for Metricool-style Summary.
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
    select: { id: true, platform: true, platformUserId: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const since = request.nextUrl.searchParams.get('since') ?? '';
  const until = request.nextUrl.searchParams.get('until') ?? '';
  const sinceTs = since ? Math.floor(new Date(since).getTime() / 1000) : null;
  const untilTs = until ? Math.floor(new Date(until).getTime() / 1000) : null;

  const out: {
    platform: string;
    followers: number;
    impressionsTotal: number;
    impressionsTimeSeries: Array<{ date: string; value: number }>;
    followersTimeSeries?: Array<{ date: string; value: number }>;
  } = {
    platform: account.platform,
    followers: 0,
    impressionsTotal: 0,
    impressionsTimeSeries: [],
  };

  try {
    if (account.platform === 'INSTAGRAM') {
      const token = account.accessToken;
      try {
        const profileRes = await axios.get<{ followers_count?: number }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'followers_count', access_token: token } }
        );
        if (typeof profileRes.data?.followers_count === 'number') {
          out.followers = profileRes.data.followers_count;
        }
      } catch (_) {
        // profile may not have followers_count for some tokens
      }
      if (sinceTs != null && untilTs != null) {
        try {
          const insightsRes = await axios.get<{
            data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }> }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'impressions',
              period: 'day',
              since: sinceTs,
              until: untilTs,
              access_token: token,
            },
          });
          const impressionValues = insightsRes.data?.data?.find((d) => d.name === 'impressions')?.values ?? [];
          let total = 0;
          const series: Array<{ date: string; value: number }> = [];
          for (const v of impressionValues) {
            const val = typeof v.value === 'number' ? v.value : 0;
            total += val;
            const date = v.end_time ? v.end_time.slice(0, 10) : '';
            if (date) series.push({ date, value: val });
          }
          out.impressionsTotal = total;
          out.impressionsTimeSeries = series.sort((a, b) => a.date.localeCompare(b.date));
        } catch (_) {
          // insights may require instagram_manage_insights or 100+ followers
        }
      }
      return NextResponse.json(out);
    }

    if (account.platform === 'FACEBOOK') {
      const token = account.accessToken;
      try {
        const pageRes = await axios.get<{ fan_count?: number }>(
          `${baseUrl}/${account.platformUserId}`,
          { params: { fields: 'fan_count', access_token: token } }
        );
        if (typeof pageRes.data?.fan_count === 'number') {
          out.followers = pageRes.data.fan_count;
        }
      } catch (_) {}
      if (sinceTs != null && untilTs != null) {
        try {
          const insightsRes = await axios.get<{
            data?: Array<{ name: string; values?: Array<{ value: number; end_time?: string }> }>;
          }>(`${baseUrl}/${account.platformUserId}/insights`, {
            params: {
              metric: 'page_impressions',
              period: 'day',
              since: sinceTs,
              until: untilTs,
              access_token: token,
            },
          });
          const impressionValues = insightsRes.data?.data?.find((d) => d.name === 'page_impressions')?.values ?? [];
          let total = 0;
          const series: Array<{ date: string; value: number }> = [];
          for (const v of impressionValues) {
            const val = typeof v.value === 'number' ? v.value : 0;
            total += val;
            const date = v.end_time ? v.end_time.slice(0, 10) : '';
            if (date) series.push({ date, value: val });
          }
          out.impressionsTotal = total;
          out.impressionsTimeSeries = series.sort((a, b) => a.date.localeCompare(b.date));
        } catch (_) {}
      }
      return NextResponse.json(out);
    }
  } catch (e) {
    console.error('[Insights] error:', e);
  }
  return NextResponse.json(out);
}
