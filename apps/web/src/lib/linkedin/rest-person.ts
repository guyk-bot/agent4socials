import axios from 'axios';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';

export type ResolveLinkedInAuthorUrnResult = {
  personUrn: string | null;
  source: 'credentials' | 'platformUserId' | 'rest/me' | 'v2/me' | 'none';
  restMeStatus: number;
  raw?: unknown;
};

function readStoredPersonUrn(credentialsJson?: unknown): string | null {
  const cred =
    credentialsJson && typeof credentialsJson === 'object'
      ? (credentialsJson as { linkedinRestPersonUrn?: string })
      : {};
  const fromRest = typeof cred.linkedinRestPersonUrn === 'string' ? cred.linkedinRestPersonUrn.trim() : '';
  if (fromRest.startsWith('urn:li:person:') || fromRest.startsWith('urn:li:organization:')) {
    return fromRest;
  }
  return null;
}

function normalizePersonOrOrgUrn(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('urn:li:person:') || trimmed.startsWith('urn:li:organization:')) {
    return trimmed;
  }
  // Accept numeric IDs (legacy format) AND alphanumeric base62 IDs (OIDC sub / newer LinkedIn member IDs).
  // LinkedIn's /v2/userinfo sub field IS the member ID per LinkedIn docs and can be used as urn:li:person:{sub}.
  // Exclude synthetic fallback IDs like "li-XXXXXXXX" that we generate when no real ID is available.
  if (/^\d+$/.test(trimmed) || (/^[A-Za-z0-9_-]{3,30}$/.test(trimmed) && !trimmed.startsWith('li-'))) {
    return `urn:li:person:${trimmed}`;
  }
  return null;
}

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
    const personUrn = normalizePersonOrOrgUrn(id.startsWith('urn:li:') ? id : `urn:li:person:${id}`);
    return { status: r.status, personUrn, raw };
  } catch (e) {
    const ax = e as { message?: string };
    return { status: 0, personUrn: null, raw: { error: ax?.message ?? 'request failed' } };
  }
}

/** Legacy profile API fallback when /rest/me is gated or returns no id. */
async function fetchLinkedInV2MePersonUrn(accessToken: string): Promise<{
  status: number;
  personUrn: string | null;
  raw: unknown;
}> {
  try {
    const r = await axios.get<{ id?: string }>('https://api.linkedin.com/v2/me', {
      params: { projection: '(id)' },
      headers: linkedInRestCommunityHeaders(accessToken),
      timeout: 12_000,
      validateStatus: () => true,
    });
    const raw = r.data ?? {};
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const personUrn = id ? normalizePersonOrOrgUrn(id) : null;
    return { status: r.status, personUrn, raw };
  } catch (e) {
    const ax = e as { message?: string };
    return { status: 0, personUrn: null, raw: { error: ax?.message ?? 'request failed' } };
  }
}

/**
 * Resolve the author URN required for posting and Community Management APIs.
 * Priority: stored credentials → platformUserId (alphanumeric OIDC sub or explicit URN) → REST /me → v2/me.
 */
export async function resolveLinkedInAuthorUrn(
  accessToken: string,
  options?: { platformUserId?: string; credentialsJson?: unknown }
): Promise<ResolveLinkedInAuthorUrnResult> {
  const stored = readStoredPersonUrn(options?.credentialsJson);
  if (stored) {
    return { personUrn: stored, source: 'credentials', restMeStatus: 200 };
  }

  const platformUserId = options?.platformUserId?.trim() ?? '';
  // Try platformUserId as a URN first. Covers explicit URNs and alphanumeric OIDC sub values.
  // normalizePersonOrOrgUrn accepts both numeric and alphanumeric LinkedIn member IDs.
  const platformUrn = normalizePersonOrOrgUrn(platformUserId);
  if (platformUrn) {
    return { personUrn: platformUrn, source: 'platformUserId', restMeStatus: 200 };
  }

  const rest = await fetchLinkedInRestPersonUrn(accessToken);
  if (rest.personUrn) {
    return { personUrn: rest.personUrn, source: 'rest/me', restMeStatus: rest.status, raw: rest.raw };
  }

  const v2 = await fetchLinkedInV2MePersonUrn(accessToken);
  if (v2.personUrn) {
    return { personUrn: v2.personUrn, source: 'v2/me', restMeStatus: rest.status, raw: v2.raw };
  }

  return { personUrn: null, source: 'none', restMeStatus: rest.status, raw: { restMe: rest.raw, v2Me: v2.raw } };
}

export function linkedInAuthorUrnMissingMessage(resolved: ResolveLinkedInAuthorUrnResult): string {
  const status = resolved.restMeStatus;
  return (
    `LinkedIn author URN missing (REST /me HTTP ${status}). ` +
    'Disconnect LinkedIn in Accounts, confirm your LinkedIn app has Share on LinkedIn enabled, ' +
    'set LINKEDIN_INCLUDE_W_MEMBER_SOCIAL=true in Vercel, redeploy, then reconnect.'
  ).slice(0, 500);
}
