import axios from 'axios';
import { prisma, withPrismaPoolRetry } from '@/lib/db';

type TikTokOAuthRefreshResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/** Refresh TikTok access token when refresh_token is stored. Returns new access token or null. */
export async function refreshTikTokAccessToken(account: {
  id: string;
  refreshToken: string | null;
}): Promise<string | null> {
  if (!account.refreshToken) return null;
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return null;

  const r = await axios.post<TikTokOAuthRefreshResponse>(
    'https://open.tiktokapis.com/v2/oauth/token/',
    new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: account.refreshToken,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 8_000,
      validateStatus: () => true,
    }
  );
  const data = r.data;
  if (r.status < 200 || r.status >= 300 || !data?.access_token || data?.error) return null;

  const expiresInSec =
    typeof data.expires_in === 'number' && Number.isFinite(data.expires_in) ? data.expires_in : 86_400;
  await withPrismaPoolRetry('tiktok-refresh-token', () =>
    prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: data.access_token,
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
        expiresAt: new Date(Date.now() + expiresInSec * 1000),
        lastSyncError: null,
      },
    })
  );
  return data.access_token;
}

export function isTikTokAccessTokenInvalid(status: number, message?: string | null): boolean {
  if (status === 401) return true;
  const m = (message ?? '').toLowerCase();
  return (
    m.includes('access token is invalid') ||
    m.includes('not found in the request') ||
    m.includes('invalid_access_token') ||
    m.includes('access_token_invalid')
  );
}
