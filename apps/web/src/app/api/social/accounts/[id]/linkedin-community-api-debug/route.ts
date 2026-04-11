import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import { getPrismaUserIdFromRequest } from '@/lib/get-prisma-user';
import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import { linkedInAuthorUrnForUgc } from '@/lib/linkedin/sync-ugc-posts';
import { normalizeLinkedInPostUrn } from '@/lib/linkedin/sync-post-metrics';

export const dynamic = 'force-dynamic';

const LINKEDIN_VERSION = '202602';

function memberCreatorEntityParam(postUrn: string): string {
  const urn = normalizeLinkedInPostUrn(postUrn);
  if (urn.startsWith('urn:li:share:')) return `(share:${encodeURIComponent(urn)})`;
  return `(ugc:${encodeURIComponent(urn)})`;
}

function redactBearerInStrings(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(/Bearer\s+[\w-_.]+/gi, 'Bearer [REDACTED]');
  }
  if (Array.isArray(value)) return value.map(redactBearerInStrings);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const k of Object.keys(o)) {
      next[k] = redactBearerInStrings(o[k]);
    }
    return next;
  }
  return value;
}

type Probe = { url: string; status: number; data: unknown };

async function probeGet(url: string, headers: Record<string, string>): Promise<Probe> {
  try {
    const r = await axios.get(url, { headers, timeout: 18_000, validateStatus: () => true });
    return { url, status: r.status, data: r.data as unknown };
  } catch (e) {
    const ax = e as { message?: string };
    return { url, status: 0, data: { error: ax?.message ?? 'request failed' } };
  }
}

/**
 * GET /api/social/accounts/[id]/linkedin-community-api-debug
 * Returns raw JSON from LinkedIn endpoints we use for Community Management–style features
 * (posts, stats, social actions, org context). For debugging on the LinkedIn analytics page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const userId = await getPrismaUserIdFromRequest(request.headers.get('authorization'));
  if (!userId) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const account = await prisma.socialAccount.findFirst({
    where: { id, userId, platform: Platform.LINKEDIN },
    select: { id: true, platformUserId: true, accessToken: true },
  });
  if (!account?.accessToken) {
    return NextResponse.json({ message: 'LinkedIn account not found' }, { status: 404 });
  }

  const token = account.accessToken;
  const platformUserId = account.platformUserId.trim();
  const isOrg = platformUserId.toLowerCase().startsWith('urn:li:organization:');
  const authorUrn = linkedInAuthorUrnForUgc(platformUserId);

  const liV2 = {
    Authorization: `Bearer ${token}`,
    'X-Restli-Protocol-Version': '2.0.0',
  };
  const liRest = {
    ...liV2,
    'Linkedin-Version': LINKEDIN_VERSION,
  };

  const recentPosts = await prisma.importedPost.findMany({
    where: { socialAccountId: account.id, platform: Platform.LINKEDIN },
    orderBy: { publishedAt: 'desc' },
    take: 5,
    select: { platformPostId: true },
  });
  const samplePostUrns = recentPosts.map((p) => normalizeLinkedInPostUrn(p.platformPostId));
  const firstUrn = samplePostUrns[0];

  const authorsParam = `List(${encodeURIComponent(authorUrn)})`;
  const ugcPostsUrl = `https://api.linkedin.com/v2/ugcPosts?q=authors&authors=${authorsParam}&count=10`;

  const [
    ugcPosts_byAuthors,
    userinfo,
    me,
    network_FirstDegreeConnection,
    network_FirstDegreeRelationSize,
    network_CompanyFollowedByMember,
  ] = await Promise.all([
    probeGet(ugcPostsUrl, liV2),
    probeGet('https://api.linkedin.com/v2/userinfo', liV2),
    probeGet('https://api.linkedin.com/v2/me?projection=(id,vanityName,localizedHeadline)', liV2),
    isOrg
      ? Promise.resolve({ url: '(skipped — organization account)', status: 0, data: { skipped: true } })
      : probeGet(
          `https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(authorUrn)}?edgeType=FirstDegreeConnection`,
          liV2
        ),
    isOrg
      ? Promise.resolve({ url: '(skipped — organization account)', status: 0, data: { skipped: true } })
      : probeGet(
          `https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(authorUrn)}?edgeType=FirstDegreeRelationSize`,
          liV2
        ),
    isOrg
      ? Promise.resolve({ url: '(skipped — organization account)', status: 0, data: { skipped: true } })
      : probeGet(
          `https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(authorUrn)}?edgeType=CompanyFollowedByMember`,
          liV2
        ),
  ]);

  let organization_rest: Probe | null = null;
  let organizationAcls_administrator: Probe | null = null;
  if (isOrg) {
    const orgId = platformUserId.replace(/^urn:li:organization:/i, '').trim();
    if (orgId) {
      const orgUrl = `https://api.linkedin.com/rest/organizations/${encodeURIComponent(orgId)}?projection=(id,localizedName,followerCount)`;
      const aclUrl =
        'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR';
      [organization_rest, organizationAcls_administrator] = await Promise.all([
        probeGet(orgUrl, liRest),
        probeGet(aclUrl, liRest),
      ]);
    }
  }

  let organizationalEntityShareStatistics_batch: Probe | null = null;
  if (isOrg && samplePostUrns.length > 0) {
    const batch = samplePostUrns.slice(0, 5);
    const orgEnc = encodeURIComponent(platformUserId);
    const qs = batch.map((u, i) => `ugcPosts[${i}]=${encodeURIComponent(u)}`).join('&');
    const url = `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${orgEnc}&${qs}`;
    organizationalEntityShareStatistics_batch = await probeGet(url, liRest);
  }

  const memberCreatorPostAnalytics_byQueryType: Record<string, Probe> = {};
  if (!isOrg && firstUrn) {
    const entity = memberCreatorEntityParam(firstUrn);
    const types = ['IMPRESSION', 'REACTION', 'COMMENT', 'RESHARE'] as const;
    await Promise.all(
      types.map(async (queryType) => {
        const url =
          `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity` +
          `&entity=${entity}&queryType=${queryType}&aggregation=TOTAL`;
        memberCreatorPostAnalytics_byQueryType[queryType] = await probeGet(url, liRest);
      })
    );
  }

  let socialMetadata_firstPost: Probe | null = null;
  let socialActions_comments_firstPost: Probe | null = null;
  if (firstUrn) {
    const enc = encodeURIComponent(firstUrn);
    const metaUrl = `https://api.linkedin.com/rest/socialMetadata/${enc}`;
    const commentsUrl = `https://api.linkedin.com/rest/socialActions/${enc}/comments?count=5`;
    [socialMetadata_firstPost, socialActions_comments_firstPost] = await Promise.all([
      probeGet(metaUrl, liRest),
      probeGet(commentsUrl, liRest),
    ]);
  }

  const out = {
    meta: {
      fetchedAt: new Date().toISOString(),
      socialAccountId: account.id,
      platformUserId,
      isOrganizationAccount: isOrg,
      authorUrnUsedForUgcPosts: authorUrn,
      samplePostUrnsFromDb: samplePostUrns,
      note:
        'Responses are raw LinkedIn API bodies (status per call). Tokens are not included. Some calls return 403 until the correct Community Management / Marketing scopes are granted.',
    },
    probes: {
      ugcPosts_byAuthors,
      userinfo,
      me,
      network_FirstDegreeConnection,
      network_FirstDegreeRelationSize,
      network_CompanyFollowedByMember,
      organization_rest,
      organizationAcls_administrator,
      organizationalEntityShareStatistics_batch,
      memberCreatorPostAnalytics_byQueryType:
        Object.keys(memberCreatorPostAnalytics_byQueryType).length > 0
          ? memberCreatorPostAnalytics_byQueryType
          : null,
      socialMetadata_firstPost,
      socialActions_comments_firstPost,
    },
  };

  return NextResponse.json(redactBearerInStrings(out));
}
