/**
 * Refresh X (Twitter) OAuth 2.0 access token using refresh_token.
 * Requires TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET.
 */
import axios from 'axios';

export async function refreshTwitterToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
}> {
  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Twitter client credentials not configured');
  const r = await axios.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
    'https://api.twitter.com/2/oauth2/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: { username: clientId, password: clientSecret },
    }
  );
  return {
    accessToken: r.data.access_token,
    refreshToken: r.data.refresh_token ?? null,
  };
}
