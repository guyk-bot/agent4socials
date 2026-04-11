/**
 * LinkedIn post metrics for Community Management–enabled apps.
 * Member: memberCreatorPostAnalytics (r_member_postAnalytics / member social products).
 * Organization Page: organizationalEntityShareStatistics (r_organization_social).
 */

import axios from 'axios';

const LINKEDIN_VERSION = '202602';

const liHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'X-Restli-Protocol-Version': '2.0.0',
  'Linkedin-Version': LINKEDIN_VERSION,
});

export function normalizeLinkedInPostUrn(platformPostId: string): string {
  const t = platformPostId.trim();
  if (t.startsWith('urn:li:ugcPost:')) return t;
  if (t.startsWith('urn:li:share:')) return t;
  return `urn:li:ugcPost:${t}`;
}

/** RestLI `entity` finder value for memberCreatorPostAnalytics. */
function memberCreatorEntityParam(postUrn: string): string {
  const urn = normalizeLinkedInPostUrn(postUrn);
  if (urn.startsWith('urn:li:share:')) return `(share:${encodeURIComponent(urn)})`;
  return `(ugc:${encodeURIComponent(urn)})`;
}

type MetricType = 'IMPRESSION' | 'REACTION' | 'COMMENT' | 'RESHARE';

async function fetchMemberMetric(
  accessToken: string,
  platformPostId: string,
  queryType: MetricType
): Promise<number> {
  const entity = memberCreatorEntityParam(platformPostId);
  const url =
    `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity` +
    `&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`;
  try {
    const r = await axios.get<{
      elements?: Array<{ count?: number }>;
    }>(url, { headers: liHeaders(accessToken), timeout: 12_000, validateStatus: () => true });
    if (r.status < 200 || r.status >= 300) return 0;
    const els = r.data?.elements ?? [];
    return els.reduce((s, e) => s + (typeof e.count === 'number' && Number.isFinite(e.count) ? e.count : 0), 0);
  } catch {
    return 0;
  }
}

export async function fetchMemberUgcPostLifetimeMetrics(
  accessToken: string,
  platformPostId: string
): Promise<{ impressions: number; likes: number; comments: number; shares: number }> {
  const [impressions, likes, comments, shares] = await Promise.all([
    fetchMemberMetric(accessToken, platformPostId, 'IMPRESSION'),
    fetchMemberMetric(accessToken, platformPostId, 'REACTION'),
    fetchMemberMetric(accessToken, platformPostId, 'COMMENT'),
    fetchMemberMetric(accessToken, platformPostId, 'RESHARE'),
  ]);
  return { impressions, likes, comments, shares };
}

type OrgStatRow = {
  ugcPost?: string;
  totalShareStatistics?: {
    impressionCount?: number;
    likeCount?: number;
    commentCount?: number;
    shareCount?: number;
  };
};

export async function fetchOrganizationUgcPostStatsBatch(
  accessToken: string,
  organizationUrn: string,
  platformPostIds: string[]
): Promise<Map<string, { impressions: number; likes: number; comments: number; shares: number }>> {
  const out = new Map<string, { impressions: number; likes: number; comments: number; shares: number }>();
  if (!organizationUrn.startsWith('urn:li:organization:') || platformPostIds.length === 0) return out;

  const orgEnc = encodeURIComponent(organizationUrn);
  const urns = platformPostIds.map((id) => normalizeLinkedInPostUrn(id));
  const qs = urns.map((u, i) => `ugcPosts[${i}]=${encodeURIComponent(u)}`).join('&');
  const url = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}&${qs}`;

  try {
    const r = await axios.get<{ elements?: OrgStatRow[] }>(url, {
      headers: liHeaders(accessToken),
      timeout: 20_000,
      validateStatus: () => true,
    });
    if (r.status < 200 || r.status >= 300) return out;
    for (const el of r.data?.elements ?? []) {
      const postUrn = el.ugcPost;
      if (!postUrn || typeof postUrn !== 'string') continue;
      const s = el.totalShareStatistics ?? {};
      out.set(postUrn, {
        impressions: typeof s.impressionCount === 'number' ? Math.max(0, Math.round(s.impressionCount)) : 0,
        likes: typeof s.likeCount === 'number' ? Math.max(0, Math.round(s.likeCount)) : 0,
        comments: typeof s.commentCount === 'number' ? Math.max(0, Math.round(s.commentCount)) : 0,
        shares: typeof s.shareCount === 'number' ? Math.max(0, Math.round(s.shareCount)) : 0,
      });
    }
  } catch {
    /* best-effort */
  }
  return out;
}

export function isLinkedInOrganizationAccount(platformUserId: string): boolean {
  return platformUserId.trim().toLowerCase().startsWith('urn:li:organization:');
}
