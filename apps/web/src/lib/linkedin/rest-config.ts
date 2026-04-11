/**
 * LinkedIn `Linkedin-Version` header for Marketing / Community Management REST APIs.
 * @see https://learn.microsoft.com/en-us/linkedin/marketing/versioning
 */
export function getLinkedInRestApiVersion(): string {
  const v = process.env.LINKEDIN_REST_API_VERSION?.trim();
  if (v && /^\d{6}$/.test(v)) return v;
  return '202602';
}

/** Headers for `https://api.linkedin.com/rest/...` Community Management endpoints. */
export function linkedInRestCommunityHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'X-Restli-Protocol-Version': '2.0.0',
    'Linkedin-Version': getLinkedInRestApiVersion(),
  };
}
