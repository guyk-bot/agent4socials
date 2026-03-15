import { NextRequest, NextResponse } from 'next/server';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import axios from 'axios';

/**
 * GET /api/social/accounts/[id]/token-debug
 * Validates the account's Meta (Instagram/Facebook) token and returns granted scopes.
 * Use this to verify instagram_content_publish etc. before troubleshooting 2207076.
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
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId },
    select: { id: true, platform: true, username: true, accessToken: true },
  });
  if (!account) {
    return NextResponse.json({ message: 'Account not found' }, { status: 404 });
  }
  const platform = (account.platform || '').toUpperCase();
  if (platform !== 'INSTAGRAM' && platform !== 'FACEBOOK') {
    return NextResponse.json(
      { message: 'Token debug is only supported for Instagram and Facebook' },
      { status: 400 }
    );
  }
  const appId = process.env.META_APP_ID || process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) {
    return NextResponse.json(
      { message: 'META_APP_ID and META_APP_SECRET required for token debug' },
      { status: 503 }
    );
  }
  const appToken = `${appId}|${appSecret}`;
  try {
    const res = await axios.get<{ data?: { is_valid?: boolean; scopes?: string[]; expires_at?: number; user_id?: string } }>(
      'https://graph.facebook.com/v18.0/debug_token',
      {
        params: {
          input_token: account.accessToken,
          access_token: appToken,
        },
        timeout: 10_000,
      }
    );
    const data = res.data?.data;
    const scopes = data?.scopes ?? [];
    const hasPublish = platform === 'INSTAGRAM'
      ? scopes.some((s) => s.includes('content_publish') || s.includes('content publish'))
      : scopes.some((s) => s.includes('manage_posts') || s.includes('manage posts'));
    const hasFacebookInsights = scopes.some((s) => s === 'read_insights' || s.includes('read_insights'));
    const hasInstagramInsights = scopes.some((s) => s === 'instagram_manage_insights' || s.includes('instagram_manage_insights'));
    return NextResponse.json({
      platform,
      username: account.username,
      isValid: data?.is_valid ?? false,
      scopes,
      expiresAt: data?.expires_at,
      hasPublishScope: hasPublish,
      hasFacebookInsightsScope: hasFacebookInsights,
      hasInstagramInsightsScope: hasInstagramInsights,
      raw: data,
    });
  } catch (err: unknown) {
    const ax = err as { response?: { data?: unknown }; message?: string };
    const msg = ax?.response?.data != null
      ? JSON.stringify(ax.response.data)
      : (ax?.message ?? 'Token debug failed');
    return NextResponse.json(
      { message: 'Meta debug_token failed', error: msg },
      { status: 502 }
    );
  }
}
