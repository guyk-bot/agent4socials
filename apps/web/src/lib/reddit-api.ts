/**
 * Reddit requires a descriptive User-Agent on all API requests (including OAuth token refresh).
 * Format: platform:app_id:version (by /u/username)
 */
export function getRedditUserAgent(): string {
  const fromEnv = process.env.REDDIT_USER_AGENT?.trim();
  if (fromEnv) return fromEnv;
  return 'web:agent4socials:v1.0 (by /u/agent4socials)';
}

export function redditAuthHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': getRedditUserAgent(),
  };
}
