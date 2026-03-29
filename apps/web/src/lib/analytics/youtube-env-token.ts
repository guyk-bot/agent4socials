import axios from 'axios';

/**
 * Server-only: exchanges YOUTUBE_REFRESH_TOKEN for a short-lived access token.
 * TODO: In production, prefer per-user tokens from the database (see getValidYoutubeToken).
 */
export async function getYoutubeAccessTokenFromEnv(): Promise<string | null> {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await axios.post<{
      access_token?: string;
      error?: string;
      error_description?: string;
    }>(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15_000 }
    );
    if (res.data?.error) {
      console.warn('[YouTube env token]', res.data.error, res.data.error_description);
      return null;
    }
    return res.data?.access_token ?? null;
  } catch (e) {
    console.warn('[YouTube env token] refresh failed:', (e as Error)?.message ?? e);
    return null;
  }
}
