import axios from 'axios';
import { prisma } from '@/lib/db';
import { getRedditUserAgent } from '@/lib/reddit-api';

type AccountSlice = {
  id: string;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
};

/**
 * Return a valid OAuth access token, refreshing with refresh_token when near expiry.
 */
export async function getValidRedditToken(account: AccountSlice): Promise<string> {
  const bufferMs = 120_000;
  if (account.expiresAt && account.expiresAt.getTime() > Date.now() + bufferMs) {
    return account.accessToken;
  }
  if (!account.refreshToken?.trim()) {
    return account.accessToken;
  }
  const clientId = process.env.REDDIT_CLIENT_ID?.trim();
  const clientSecret = process.env.REDDIT_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return account.accessToken;
  }
  try {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const r = await axios.post<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    }>(
      'https://www.reddit.com/api/v1/access_token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: account.refreshToken.trim(),
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basic}`,
          'User-Agent': getRedditUserAgent(),
        },
        validateStatus: () => true,
        timeout: 15_000,
      }
    );
    if (r.status !== 200 || !r.data?.access_token) {
      console.warn('[Reddit token] refresh failed:', r.status, r.data?.error ?? r.data);
      return account.accessToken;
    }
    const accessToken = r.data.access_token;
    const newRefresh = typeof r.data.refresh_token === 'string' && r.data.refresh_token.trim() ? r.data.refresh_token : account.refreshToken;
    const expiresIn = typeof r.data.expires_in === 'number' ? r.data.expires_in : 3600;
    const expiresAt = new Date(Date.now() + expiresIn * 1000);
    await prisma.socialAccount.update({
      where: { id: account.id },
      data: { accessToken, refreshToken: newRefresh, expiresAt },
    });
    return accessToken;
  } catch (e) {
    console.warn('[Reddit token] refresh error:', (e as Error)?.message ?? e);
    return account.accessToken;
  }
}
