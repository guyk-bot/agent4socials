import { NextRequest, NextResponse } from 'next/server';
import { Platform, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import {
  LinkedInApiClient,
  LinkedInTokenExpiredError,
  canonicalPostUrnForMemberAnalytics,
  memberCreatorAnalyticsEntityQueryValue,
} from '@/lib/linkedin';
import { isLinkedInOrganizationAccount, refreshLinkedInImportedPostMetrics } from '@/lib/linkedin/sync-post-metrics';

export const maxDuration = 120;

/**
 * GET/POST /api/cron/sync-linkedin
 *
 * Background sync for LinkedIn (member flow):
 * - OpenID userinfo → person URN
 * - REST Posts (`/rest/posts?q=author`) for recent organic posts
 * - memberCreatorPostAnalytics totals per post
 * - Upserts `PostPerformance` and rolls up into `AccountMetricSnapshot` for the UTC calendar day.
 *
 * Organization accounts (urn:li:organization:…) use the existing batch stats path only.
 *
 * Auth: `X-Cron-Secret` or `Authorization: Bearer <CRON_SECRET>` or `?secret=`.
 */
export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}

async function handle(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'DATABASE_URL required' }, { status: 503 });
  }
  const cronSecret =
    request.headers.get('X-Cron-Secret') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    request.nextUrl.searchParams.get('secret');
  if (!process.env.CRON_SECRET || cronSecret !== process.env.CRON_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const accounts = await prisma.socialAccount.findMany({
    where: { platform: Platform.LINKEDIN, status: 'connected' },
    select: {
      id: true,
      userId: true,
      platformUserId: true,
      accessToken: true,
      expiresAt: true,
    },
  });

  const results: Array<Record<string, unknown>> = [];

  for (const acc of accounts) {
    if (acc.expiresAt && acc.expiresAt.getTime() < Date.now()) {
      await prisma.socialAccount
        .update({
          where: { id: acc.id },
          data: {
            lastSyncAttemptAt: new Date(),
            lastSyncStatus: 'needs_reconnect',
            lastSyncError: 'LinkedIn access token expired (expiresAt). Reconnect the account.',
          },
        })
        .catch(() => {});
      results.push({ socialAccountId: acc.id, ok: false, error: 'LINKEDIN_TOKEN_EXPIRED_CLOCK' });
      continue;
    }

    try {
      if (isLinkedInOrganizationAccount(acc.platformUserId)) {
        const { updated } = await refreshLinkedInImportedPostMetrics({
          id: acc.id,
          platformUserId: acc.platformUserId,
          accessToken: acc.accessToken,
        });
        await prisma.socialAccount
          .update({
            where: { id: acc.id },
            data: {
              lastSuccessfulSyncAt: new Date(),
              lastSyncAttemptAt: new Date(),
              lastSyncStatus: 'success',
              lastSyncError: null,
            },
          })
          .catch(() => {});
        results.push({
          socialAccountId: acc.id,
          ok: true,
          mode: 'organization_batch_metrics',
          importedPostsUpdated: updated,
        });
        continue;
      }

      const client = new LinkedInApiClient(acc.accessToken);
      const personUrn = await client.resolvePersonUrnFromUserInfo();
      const postsRes = await client.fetchRecentOrganicPosts(personUrn, 10);
      const elements = postsRes.elements ?? [];

      let sumImp = 0;
      let sumClk = 0;
      let sumCom = 0;
      let sumShr = 0;
      let sumWatchMs = 0;
      let anyWatch = false;

      for (const el of elements) {
        const rawId = el.id;
        if (!rawId || typeof rawId !== 'string') continue;
        const canonicalUrn = canonicalPostUrnForMemberAnalytics(rawId);
        const entityParam = memberCreatorAnalyticsEntityQueryValue(rawId);
        console.log(
          `[sync-linkedin] account=${acc.id} rawPostId=${rawId} canonicalUrn=${canonicalUrn} entityQueryValue=${entityParam}`
        );
        const engagement = await client.fetchMemberPostEngagement(rawId);
        sumImp += engagement.impressions;
        sumClk += engagement.clicks;
        sumCom += engagement.comments;
        sumShr += engagement.shares;
        if (engagement.videoWatchTimeMs != null) {
          sumWatchMs += engagement.videoWatchTimeMs;
          anyWatch = true;
        }

        const metricsRaw = {
          source: 'cron_sync_linkedin',
          restPostId: el.id ?? null,
          lifecycleState: el.lifecycleState ?? null,
          membersReached: engagement.membersReached,
        } satisfies Record<string, unknown>;

        await prisma.postPerformance.upsert({
          where: {
            socialAccountId_platformPostId: {
              socialAccountId: acc.id,
              platformPostId: engagement.postUrn,
            },
          },
          create: {
            userId: acc.userId,
            socialAccountId: acc.id,
            platform: Platform.LINKEDIN,
            platformPostId: engagement.postUrn,
            impressions: engagement.impressions,
            clicks: engagement.clicks,
            comments: engagement.comments,
            shares: engagement.shares,
            videoWatchTimeMs: engagement.videoWatchTimeMs ?? undefined,
            metricsRaw: metricsRaw as Prisma.InputJsonValue,
          },
          update: {
            impressions: engagement.impressions,
            clicks: engagement.clicks,
            comments: engagement.comments,
            shares: engagement.shares,
            videoWatchTimeMs: engagement.videoWatchTimeMs ?? null,
            metricsRaw: metricsRaw as Prisma.InputJsonValue,
            fetchedAt: new Date(),
          },
        });
      }

      const metricDate = new Date().toISOString().slice(0, 10);
      const now = new Date();
      await prisma.accountMetricSnapshot.upsert({
        where: {
          userId_platform_externalAccountId_metricDate: {
            userId: acc.userId,
            platform: Platform.LINKEDIN,
            externalAccountId: acc.platformUserId,
            metricDate,
          },
        },
        create: {
          userId: acc.userId,
          socialAccountId: acc.id,
          platform: Platform.LINKEDIN,
          externalAccountId: acc.platformUserId,
          metricDate,
          metricTimestamp: now,
          linkedinAggregatedImpressions: sumImp,
          linkedinAggregatedClicks: sumClk,
          linkedinAggregatedComments: sumCom,
          linkedinAggregatedShares: sumShr,
          linkedinAggregatedVideoWatchTimeMs: anyWatch ? sumWatchMs : null,
          source: 'scheduled_sync',
          insightsJson: {
            pipeline: 'cron_sync_linkedin',
            postsFetched: elements.length,
            personUrn,
          } as Prisma.InputJsonValue,
        },
        update: {
          metricTimestamp: now,
          linkedinAggregatedImpressions: sumImp,
          linkedinAggregatedClicks: sumClk,
          linkedinAggregatedComments: sumCom,
          linkedinAggregatedShares: sumShr,
          linkedinAggregatedVideoWatchTimeMs: anyWatch ? sumWatchMs : null,
          source: 'scheduled_sync',
          insightsJson: {
            pipeline: 'cron_sync_linkedin',
            postsFetched: elements.length,
            personUrn,
          } as Prisma.InputJsonValue,
        },
      });

      await prisma.socialAccount.update({
        where: { id: acc.id },
        data: {
          lastSuccessfulSyncAt: now,
          lastSyncAttemptAt: now,
          lastSyncStatus: 'success',
          lastSyncError: null,
        },
      });

      results.push({
        socialAccountId: acc.id,
        ok: true,
        mode: 'member_openid_posts_analytics',
        postsFetched: elements.length,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (e instanceof LinkedInTokenExpiredError) {
        await prisma.socialAccount
          .update({
            where: { id: acc.id },
            data: {
              lastSyncAttemptAt: new Date(),
              lastSyncStatus: 'needs_reconnect',
              lastSyncError: msg.slice(0, 500),
            },
          })
          .catch(() => {});
      } else {
        await prisma.socialAccount
          .update({
            where: { id: acc.id },
            data: {
              lastSyncAttemptAt: new Date(),
              lastSyncStatus: 'error',
              lastSyncError: msg.slice(0, 500),
            },
          })
          .catch(() => {});
      }
      results.push({
        socialAccountId: acc.id,
        ok: false,
        error: msg,
        tokenExpired: e instanceof LinkedInTokenExpiredError,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    accounts: accounts.length,
    results,
  });
}
