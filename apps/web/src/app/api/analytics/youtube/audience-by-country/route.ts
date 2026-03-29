import { NextRequest, NextResponse } from 'next/server';
import { parseYoutubeQueryDates, youtubeAudienceQuerySchema } from '@/lib/analytics/breakdown-zod';
import { fetchYoutubeAudienceByCountry } from '@/lib/analytics/providers/youtube';
import { AnalyticsApiError } from '@/lib/analytics/api-errors';

/**
 * GET /api/analytics/youtube/audience-by-country?channelId=UC...&startDate=...&endDate=...&primaryMetric=views|estimatedMinutesWatched
 * TODO: Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN for server-side token exchange.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raw = {
    channelId: sp.get('channelId') ?? '',
    startDate: sp.get('startDate') ?? '',
    endDate: sp.get('endDate') ?? '',
    primaryMetric: sp.get('primaryMetric') ?? 'views',
  };

  const parsed = youtubeAudienceQuerySchema.safeParse({
    ...raw,
    primaryMetric:
      raw.primaryMetric === 'estimatedMinutesWatched' ? 'estimatedMinutesWatched' : 'views',
  });

  if (!parsed.success) {
    const msg =
      parsed.error.flatten().fieldErrors.channelId?.[0] ??
      parsed.error.flatten().fieldErrors.startDate?.[0] ??
      parsed.error.flatten().fieldErrors.endDate?.[0] ??
      'Invalid query parameters.';
    return NextResponse.json({ error: { code: 'INVALID_QUERY', message: msg } }, { status: 400 });
  }

  const dates = parseYoutubeQueryDates(parsed.data.startDate, parsed.data.endDate);
  if (!dates.ok) {
    return NextResponse.json({ error: { code: 'INVALID_RANGE', message: dates.message } }, { status: 400 });
  }

  try {
    const body = await fetchYoutubeAudienceByCountry({
      channelId: parsed.data.channelId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      primaryMetric: parsed.data.primaryMetric,
    });
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof AnalyticsApiError) return e.toResponse();
    return NextResponse.json(
      { error: { code: 'UNEXPECTED', message: 'Unexpected server error.' } },
      { status: 500 }
    );
  }
}
