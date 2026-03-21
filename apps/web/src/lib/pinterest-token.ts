import axios from 'axios';
import { prisma } from '@/lib/db';

function pinterestClientAuthHeader(): string | null {
  const id = process.env.PINTEREST_APP_ID?.trim() || process.env.PINTEREST_CLIENT_ID?.trim();
  const secret = process.env.PINTEREST_APP_SECRET?.trim() || process.env.PINTEREST_CLIENT_SECRET?.trim();
  if (!id || !secret) return null;
  return `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`;
}

/**
 * Returns a valid Pinterest v5 access token; refreshes using refresh_token when near expiry.
 */
export async function getValidPinterestToken(account: {
  id: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
}): Promise<string> {
  const fiveMinutes = 5 * 60 * 1000;
  const isExpired =
    !account.expiresAt ||
    new Date(account.expiresAt).getTime() - Date.now() < fiveMinutes;

  if (!isExpired) return account.accessToken;

  const refreshToken = account.refreshToken;
  const authHeader = pinterestClientAuthHeader();
  if (!refreshToken || !authHeader) return account.accessToken;

  try {
    const res = await axios.post<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_token_expires_in?: number;
    }>(
      'https://api.pinterest.com/v5/oauth/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: authHeader,
        },
      }
    );

    const newToken = res.data?.access_token;
    if (!newToken) return account.accessToken;

    const expiresIn = res.data.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    const newRefresh = res.data.refresh_token ?? refreshToken;

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: newToken,
        refreshToken: newRefresh,
        expiresAt,
      },
    });

    return newToken;
  } catch (e) {
    console.warn('[Pinterest token] refresh failed:', (e as Error)?.message ?? e);
    return account.accessToken;
  }
}
