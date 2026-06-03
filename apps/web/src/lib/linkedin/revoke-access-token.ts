/**
 * Revoke a member access token at LinkedIn so the next OAuth can show the consent screen.
 * Best-effort: disconnect still succeeds if LinkedIn returns an error.
 */
export async function revokeLinkedInAccessToken(accessToken: string): Promise<void> {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim();
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret || !accessToken.trim()) return;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    token: accessToken.trim(),
  });

  const res = await fetch('https://www.linkedin.com/oauth/v2/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn('[LinkedIn revoke]', res.status, text.slice(0, 200));
  }
}
