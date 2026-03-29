import axios from 'axios';
import { prisma } from '@/lib/db';

/**
 * Returns a valid YouTube access token for the given socialAccount.
 * If the stored token is expired (or will expire within 5 minutes), it refreshes
 * using the stored refreshToken and updates the DB.
 */
export async function getValidYoutubeToken(account: {
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
  if (!refreshToken || !process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) {
    return account.accessToken;
  }

  try {
    const res = await axios.post<{
      access_token?: string;
      expires_in?: number;
    }>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const newToken = res.data?.access_token;
    if (!newToken) return account.accessToken;

    const expiresIn = res.data?.expires_in ?? 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { accessToken: newToken, expiresAt },
    });

    return newToken;
  } catch (e) {
    console.warn('[YouTube token] refresh failed:', (e as Error)?.message ?? e);
    return account.accessToken;
  }
}
