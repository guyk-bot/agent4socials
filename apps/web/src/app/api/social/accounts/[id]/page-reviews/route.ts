import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

const baseUrl = 'https://graph.facebook.com/v18.0';

/**
 * GET /api/social/accounts/[id]/page-reviews
 * Returns Facebook Page ratings/reviews (requires pages_read_user_content).
 * Only for FACEBOOK platform accounts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
    if (account.platform !== 'FACEBOOK') {
      return NextResponse.json({ reviews: [], message: 'Only Facebook Page accounts support reviews.' }, { status: 200 });
    }

    const token = account.accessToken;
    const fields = 'created_time,rating,recommendation_type,review_text,has_rating,has_review';
    const res = await axios.get<{
      data?: Array<{
        created_time?: string;
        rating?: number;
        recommendation_type?: string;
        review_text?: string;
        has_rating?: boolean;
        has_review?: boolean;
      }>;
      error?: { message?: string; code?: number };
    }>(`${baseUrl}/${account.platformUserId}/ratings`, {
      params: { fields, access_token: token },
      timeout: 10_000,
    });

    if (res.data?.error) {
      const code = res.data.error.code;
      const msg = res.data.error.message ?? 'Failed to load reviews';
      if (code === 200 || code === 283) {
        return NextResponse.json(
          { reviews: [], error: 'pages_read_user_content permission required. Reconnect Facebook and ensure the scope is approved.', code },
          { status: 200 }
        );
      }
      return NextResponse.json({ reviews: [], error: msg }, { status: 200 });
    }

    const reviews = (res.data?.data ?? []).map((r) => ({
      created_time: r.created_time ?? null,
      rating: r.rating ?? null,
      recommendation_type: r.recommendation_type ?? null,
      review_text: r.review_text ?? null,
      has_rating: r.has_rating ?? false,
      has_review: r.has_review ?? false,
    }));

    return NextResponse.json({ reviews });
  } catch (e) {
    console.error('[page-reviews] error:', e);
    const msg = (e as { response?: { data?: { error?: { message?: string } }; status?: number } })?.response?.data?.error?.message;
    return NextResponse.json(
      { reviews: [], error: msg ?? (e instanceof Error ? e.message : 'Failed to load reviews') },
      { status: 200 }
    );
  }
}
