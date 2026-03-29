import { NextRequest, NextResponse } from 'next/server';
import { parseYoutubeQueryDates, youtubeTrafficQuerySchema } from '@/lib/analytics/breakdown-zod';
import { fetchYoutubeTrafficSources } from '@/lib/analytics/providers/youtube';
import { AnalyticsApiError } from '@/lib/analytics/api-errors';

/**
 * GET /api/analytics/youtube/traffic-sources?channelId=UC...&startDate=...&endDate=...
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raw = {
    channelId: sp.get('channelId') ?? '',
    startDate: sp.get('startDate') ?? '',
    endDate: sp.get('endDate') ?? '',
  };

  const parsed = youtubeTrafficQuerySchema.safeParse(raw);
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
    const body = await fetchYoutubeTrafficSources({
      channelId: parsed.data.channelId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
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
