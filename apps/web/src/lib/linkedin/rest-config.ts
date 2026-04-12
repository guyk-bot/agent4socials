/**
 * LinkedIn `LinkedIn-Version` must be exactly `YYYYMM` (six digits). Env mistakes like `20260401`
 * cause HTTP 426; we normalize digit-only values to the first six digits.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export function getLinkedInRestApiVersion(): string {
  const raw = process.env.LINKEDIN_REST_API_VERSION?.trim() ?? '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(0, 6);
  if (/^\d{6}$/.test(digits)) return digits;
  if (digits.length > 6) return digits.slice(0, 6);
  /** Default aligns with Marketing / Community Management API monthly versioning. */
  return '202604';
}

/**
 * GET /rest/posts finder URL (Community Management Posts API). Replaces legacy `v2/ugcPosts?q=authors`.
 */
export function buildLinkedInRestPostsByAuthorUrl(authorUrn: string, count: number): string {
  const params = new URLSearchParams();
  params.set('author', authorUrn.trim());
  params.set('q', 'author');
  const n = Math.min(100, Math.max(1, Math.floor(count)));
  params.set('count', String(n));
  return `https://api.linkedin.com/rest/posts?${params.toString()}`;
}

/**
 * Required on every `api.linkedin.com` request (REST `/rest/*`, legacy `/v2/*`, OpenID `v2/userinfo`).
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export function linkedInRestCommunityHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': getLinkedInRestApiVersion(),
  };
}
