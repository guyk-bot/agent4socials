/**
 * LinkedIn `Linkedin-Version` header for Marketing / Community Management REST APIs.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export function getLinkedInRestApiVersion(): string {
  const v = process.env.LINKEDIN_REST_API_VERSION?.trim();
  if (v && /^\d{6}$/.test(v)) return v;
  /** Default aligns with Marketing / Community Management API monthly versioning. */
  return '202604';
}

/**
 * Required headers for LinkedIn REST (`/rest/*`) and versioned OpenID (`/v2/userinfo`) calls.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export function linkedInRestCommunityHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'LinkedIn-Version': getLinkedInRestApiVersion(),
  };
}
