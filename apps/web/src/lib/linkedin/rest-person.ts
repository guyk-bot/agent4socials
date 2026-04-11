import axios from 'axios';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';

/**
 * GET https://api.linkedin.com/rest/me — returns the member id URN when the token allows it
 * (often works with Marketing / Community products where classic v2/me returns 403).
 */
export async function fetchLinkedInRestPersonUrn(accessToken: string): Promise<{
  status: number;
  personUrn: string | null;
  raw: unknown;
}> {
  try {
    const r = await axios.get<Record<string, unknown>>('https://api.linkedin.com/rest/me', {
      headers: linkedInRestCommunityHeaders(accessToken),
      timeout: 12_000,
      validateStatus: () => true,
    });
    const raw = r.data ?? {};
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) {
      return { status: r.status, personUrn: null, raw };
    }
    const personUrn = id.startsWith('urn:li:') ? id : `urn:li:person:${id}`;
    return { status: r.status, personUrn, raw };
  } catch (e) {
    const ax = e as { message?: string };
    return { status: 0, personUrn: null, raw: { error: ax?.message ?? 'request failed' } };
  }
}
