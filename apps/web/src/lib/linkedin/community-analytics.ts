/**
 * Optional LinkedIn Community Management analytics beyond what we persist on ImportedPost.
 * Requires the corresponding products/scopes on your LinkedIn app (see Microsoft Learn).
 */

import axios from 'axios';
import { linkedInRestCommunityHeaders } from '@/lib/linkedin/rest-config';

/** https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/follower-statistics */
export async function fetchLinkedInMemberFollowersCountMe(accessToken: string): Promise<{
  ok: boolean;
  status: number;
  count?: number;
}> {
  const url = 'https://api.linkedin.com/rest/memberFollowersCount?q=me';
  try {
    const r = await axios.get<{ elements?: Array<{ memberFollowersCount?: number }> }>(url, {
      headers: linkedInRestCommunityHeaders(accessToken),
      timeout: 12_000,
      validateStatus: () => true,
    });
    if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status };
    const n = r.data?.elements?.[0]?.memberFollowersCount;
    return {
      ok: true,
      status: r.status,
      count: typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.round(n)) : undefined,
    };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics */
export async function fetchLinkedInOrganizationalEntityFollowerStatistics(
  accessToken: string,
  organizationalEntityUrn: string
): Promise<{ ok: boolean; status: number; elements?: unknown[] }> {
  const urn = organizationalEntityUrn.trim();
  if (!urn.startsWith('urn:li:organization:')) return { ok: false, status: 0 };
  const org = encodeURIComponent(urn);
  const url = `https://api.linkedin.com/rest/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${org}`;
  try {
    const r = await axios.get<{ elements?: unknown[] }>(url, {
      headers: linkedInRestCommunityHeaders(accessToken),
      timeout: 18_000,
      validateStatus: () => true,
    });
    if (r.status < 200 || r.status >= 300) return { ok: false, status: r.status };
    const els = r.data?.elements ?? [];
    return { ok: true, status: r.status, elements: els.slice(0, 8) };
  } catch {
    return { ok: false, status: 0 };
  }
}
