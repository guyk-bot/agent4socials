import { NextRequest, NextResponse } from 'next/server';
import { instagramAudienceQuerySchema } from '@/lib/analytics/breakdown-zod';
import { fetchInstagramAudienceByCountry } from '@/lib/analytics/providers/instagram';
import { AnalyticsApiError } from '@/lib/analytics/api-errors';

/**
 * GET /api/analytics/instagram/audience-by-country?accountId=...&range=7d|14d|30d|90d
 * TODO: Set META_ACCESS_TOKEN (server) and pass a real Instagram professional account id as accountId.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const raw = {
    accountId: sp.get('accountId') ?? '',
    range: sp.get('range') ?? '30d',
  };

  const parsed = instagramAudienceQuerySchema.safeParse({
    accountId: raw.accountId,
    range: raw.range === '7d' || raw.range === '14d' || raw.range === '30d' || raw.range === '90d' ? raw.range : '30d',
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: 'INVALID_QUERY',
          message: parsed.error.flatten().fieldErrors.accountId?.[0] ?? parsed.error.message,
        },
      },
      { status: 400 }
    );
  }

  try {
    const body = await fetchInstagramAudienceByCountry({
      accountId: parsed.data.accountId,
      range: parsed.data.range,
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
