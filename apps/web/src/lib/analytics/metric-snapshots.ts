/**
 * Persistent follower/following/fans history for Instagram and Facebook only.
 * YouTube is explicitly excluded: use platform API data only.
 *
 * Reconnect preservation: history is keyed by userId + platform + externalAccountId (platformUserId),
 * so when a user disconnects and reconnects the same account, we reuse the same SocialAccount row
 * and all prior snapshots remain.
 */

import { prisma } from '@/lib/db';
import { Platform } from '@prisma/client';
import axios from 'axios';
import { facebookGraphBaseUrl, instagramGraphHostBaseUrl } from '@/lib/meta-graph-insights';

const INSTAGRAM_FACEBOOK = ['INSTAGRAM', 'FACEBOOK'] as const;

let _tableEnsured = false;
let _ensureInFlight: Promise<void> | null = null;

async function snapshotTableExists(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'AccountMetricSnapshot'
      ) AS "exists"`
    );
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

async function runSnapshotTableMigrations(): Promise<void> {
  await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "AccountMetricSnapshot" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "socialAccountId" TEXT NOT NULL,
        "platform" "Platform" NOT NULL,
        "externalAccountId" TEXT NOT NULL,
        "metricDate" TEXT NOT NULL,
        "metricTimestamp" TIMESTAMP(3) NOT NULL,
        "followersCount" INTEGER,
        "followingCount" INTEGER,
        "fansCount" INTEGER,
        "insightsJson" JSONB,
        "source" TEXT NOT NULL DEFAULT 'bootstrap',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AccountMetricSnapshot_pkey" PRIMARY KEY ("id")
      )
    `);
  await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "AccountMetricSnapshot_userId_platform_externalAccountId_metricDate_key"
        ON "AccountMetricSnapshot"("userId", "platform", "externalAccountId", "metricDate")
    `);
  await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_socialAccountId_metricDate_idx"
        ON "AccountMetricSnapshot"("socialAccountId", "metricDate")
    `);
  await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'AccountMetricSnapshot_userId_fkey'
        ) THEN
          ALTER TABLE "AccountMetricSnapshot"
            ADD CONSTRAINT "AccountMetricSnapshot_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
  await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'AccountMetricSnapshot_socialAccountId_fkey'
        ) THEN
          ALTER TABLE "AccountMetricSnapshot"
            ADD CONSTRAINT "AccountMetricSnapshot_socialAccountId_fkey"
            FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
}

/**
 * Best-effort: create AccountMetricSnapshot table + indexes if they don't exist yet.
 * Single-flight + fast probe so concurrent /insights calls share the work.
 */
async function ensureSnapshotTable(): Promise<void> {
  if (_tableEnsured) return;
  if (_ensureInFlight) { await _ensureInFlight; return; }
  const run = (async () => {
    try {
      if (await snapshotTableExists()) { _tableEnsured = true; return; }
      await runSnapshotTableMigrations();
      _tableEnsured = true;
      console.log('[MetricSnapshot] AccountMetricSnapshot table ensured.');
    } catch (e) {
      console.warn('[MetricSnapshot] ensureSnapshotTable failed (non-fatal):', (e as Error)?.message?.slice(0, 200));
    }
  })();
  _ensureInFlight = run;
  try { await run; } finally { if (_ensureInFlight === run) _ensureInFlight = null; }
}
const fbBaseUrl = facebookGraphBaseUrl;
const igBaseUrl = instagramGraphHostBaseUrl;

export type SnapshotSource = 'bootstrap' | 'scheduled_sync' | 'manual_refresh';

/** Fetch current follower/following from Instagram (profile node). */
export async function fetchCurrentInstagramMetrics(
  platformUserId: string,
  accessToken: string
): Promise<{ followersCount: number; followingCount: number | null }> {
  let followersCount = 0;
  let followingCount: number | null = null;
  for (const base of [fbBaseUrl, igBaseUrl]) {
    try {
      const res = await axios.get<{ followers_count?: number; follows_count?: number }>(
        `${base}/${platformUserId}`,
        {
          params: { fields: 'followers_count,follows_count', access_token: accessToken },
          timeout: 8_000,
        }
      );
      if (typeof res.data?.followers_count === 'number') followersCount = res.data.followers_count;
      if (typeof res.data?.follows_count === 'number') followingCount = res.data.follows_count;
      if (followersCount > 0) break;
    } catch {
      continue;
    }
  }
  return { followersCount, followingCount };
}

/** Fetch current fans/followers from Facebook Page (fan_count). */
export async function fetchCurrentFacebookMetrics(
  platformUserId: string,
  accessToken: string
): Promise<{ followersCount: number; fansCount: number; followingCount: null }> {
  let followersCount = 0;
  let fansCount = 0;
  try {
    const res = await axios.get<{ fan_count?: number; followers_count?: number }>(
      `${fbBaseUrl}/${platformUserId}`,
      {
        params: { fields: 'fan_count,followers_count', access_token: accessToken },
        timeout: 8_000,
      }
    );
    if (typeof res.data?.fan_count === 'number') {
      fansCount = res.data.fan_count;
      followersCount = res.data.fan_count;
    }
    if (typeof res.data?.followers_count === 'number') followersCount = res.data.followers_count;
  } catch {
    // leave zeros
  }
  return { followersCount, fansCount, followingCount: null };
}

/**
 * Upsert one snapshot for the given date. Uses unique constraint (userId, platform, externalAccountId, metricDate).
 * Only saves non-null metrics; does not overwrite existing valid values with null.
 */
export async function upsertDailyMetricSnapshot(params: {
  userId: string;
  socialAccountId: string;
  platform: Platform;
  externalAccountId: string;
  metricDate: string; // YYYY-MM-DD
  followersCount: number | null;
  followingCount: number | null;
  fansCount: number | null;
  source: SnapshotSource;
}): Promise<void> {
  const { userId, socialAccountId, platform, externalAccountId, metricDate, source } = params;
  const metricTimestamp = new Date(metricDate + 'T12:00:00Z');

  await ensureSnapshotTable();
  try {
    await prisma.accountMetricSnapshot.upsert({
      where: {
        userId_platform_externalAccountId_metricDate: {
          userId,
          platform,
          externalAccountId,
          metricDate,
        },
      },
      update: {
        metricTimestamp,
        // Only update fields we have values for; do not overwrite with null
        ...(params.followersCount != null && { followersCount: params.followersCount }),
        ...(params.followingCount != null && { followingCount: params.followingCount }),
        ...(params.fansCount != null && { fansCount: params.fansCount }),
        source,
      },
      create: {
        userId,
        socialAccountId,
        platform,
        externalAccountId,
        metricDate,
        metricTimestamp,
        followersCount: params.followersCount ?? undefined,
        followingCount: params.followingCount ?? undefined,
        fansCount: params.fansCount ?? undefined,
        source,
      },
    });
  } catch (e) {
    console.warn('[MetricSnapshot] upsertDailyMetricSnapshot skipped:', (e as Error)?.message?.slice(0, 120));
  }
}

/** Per-day metrics from APIs (e.g. impressions, reach, profile_views, page_impressions). Stored in insightsJson so we keep full history beyond Meta 28/90-day window. */
export type InsightsPayload = Record<string, number>;

/**
 * Upsert insights for a single day. Merges payload into existing insightsJson so we accumulate metrics without overwriting.
 * Creates a snapshot row for that day if missing (with null follower counts).
 */
export async function upsertDailyInsightsSnapshot(params: {
  userId: string;
  socialAccountId: string;
  platform: Platform;
  externalAccountId: string;
  metricDate: string; // YYYY-MM-DD
  insightsPayload: InsightsPayload;
}): Promise<void> {
  const { userId, socialAccountId, platform, externalAccountId, metricDate, insightsPayload } = params;
  const metricTimestamp = new Date(metricDate + 'T12:00:00Z');

  await ensureSnapshotTable();
  try {
    const existing = await prisma.accountMetricSnapshot.findUnique({
      where: {
        userId_platform_externalAccountId_metricDate: {
          userId,
          platform,
          externalAccountId,
          metricDate,
        },
      },
      select: { insightsJson: true },
    });

    const merged =
      existing?.insightsJson && typeof existing.insightsJson === 'object' && !Array.isArray(existing.insightsJson)
        ? { ...(existing.insightsJson as Record<string, number>), ...insightsPayload }
        : insightsPayload;

    await prisma.accountMetricSnapshot.upsert({
      where: {
        userId_platform_externalAccountId_metricDate: {
          userId,
          platform,
          externalAccountId,
          metricDate,
        },
      },
      update: { insightsJson: merged, metricTimestamp },
      create: {
        userId,
        socialAccountId,
        platform,
        externalAccountId,
        metricDate,
        metricTimestamp,
        insightsJson: merged,
        source: 'manual_refresh',
      },
    });
  } catch (e) {
    console.warn('[MetricSnapshot] upsertDailyInsightsSnapshot skipped (table missing?):', (e as Error)?.message?.slice(0, 120));
  }
}

/**
 * Persist multiple time series into daily snapshots. For each date present in any series, merges that day's values into insightsJson.
 * Call after fetching insights from the API so we retain history beyond the platform window.
 */
export async function persistInsightsSeries(params: {
  userId: string;
  socialAccountId: string;
  platform: Platform;
  externalAccountId: string;
  seriesByMetric: Record<string, Array<{ date: string; value: number }>>;
}): Promise<void> {
  const { userId, socialAccountId, platform, externalAccountId, seriesByMetric } = params;
  const dates = new Set<string>();
  for (const series of Object.values(seriesByMetric)) {
    for (const p of series) if (p.date) dates.add(p.date);
  }
  const byDate = new Map<string, InsightsPayload>();
  for (const date of dates) {
    const payload: InsightsPayload = {};
    for (const [metric, series] of Object.entries(seriesByMetric)) {
      const point = series.find((p) => p.date === date);
      if (point && typeof point.value === 'number') payload[metric] = point.value;
    }
    if (Object.keys(payload).length > 0) byDate.set(date, payload);
  }
  for (const [metricDate, insightsPayload] of byDate) {
    await upsertDailyInsightsSnapshot({
      userId,
      socialAccountId,
      platform,
      externalAccountId,
      metricDate,
      insightsPayload,
    });
  }
}

/**
 * Get a single metric's time series from stored insightsJson. Returns ascending by date.
 * Use for impressions, reach, profile_views, page_impressions, page_views_total, etc.
 */
export async function getInsightsTimeSeries(params: {
  userId: string;
  platform: Platform;
  externalAccountId: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  metricKey: string; // e.g. "impressions", "reach", "page_impressions", "page_views_total"
}): Promise<Array<{ date: string; value: number }>> {
  const { userId, platform, externalAccountId, since, until, metricKey } = params;

  await ensureSnapshotTable();
  try {
    const snapshots = await prisma.accountMetricSnapshot.findMany({
      where: {
        userId,
        platform,
        externalAccountId,
        metricDate: { gte: since, lte: until },
      },
      orderBy: { metricDate: 'asc' },
      select: { metricDate: true, insightsJson: true },
    });

    const out: Array<{ date: string; value: number }> = [];
    for (const s of snapshots) {
      const json = s.insightsJson as Record<string, unknown> | null | undefined;
      const val = json != null && typeof json[metricKey] === 'number' ? json[metricKey] : null;
      if (val != null) out.push({ date: s.metricDate, value: val });
    }
    return out;
  } catch (e) {
    console.warn('[MetricSnapshot] getInsightsTimeSeries skipped (table missing?):', (e as Error)?.message?.slice(0, 120));
    return [];
  }
}

/**
 * Get snapshot-based time series for an account. Returns ascending by date.
 * Only for Instagram and Facebook; do not call for YouTube.
 */
export async function getAccountHistorySeries(params: {
  userId: string;
  socialAccountId: string;
  platform: Platform;
  externalAccountId: string;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
}): Promise<{
  followersTimeSeries: Array<{ date: string; value: number }>;
  followingTimeSeries: Array<{ date: string; value: number }> | null;
  firstSnapshotAt: string | null;
  snapshotCount: number;
}> {
  const { userId, platform, externalAccountId, since, until } = params;

  await ensureSnapshotTable();
  try {
    const snapshots = await prisma.accountMetricSnapshot.findMany({
      where: {
        userId,
        platform,
        externalAccountId,
        metricDate: { gte: since, lte: until },
      },
      orderBy: { metricDate: 'asc' },
      select: { metricDate: true, followersCount: true, followingCount: true, fansCount: true },
    });

    const followersTimeSeries: Array<{ date: string; value: number }> = [];
    const followingTimeSeries: Array<{ date: string; value: number }> = [];
    let lastF = 0;
    let lastFollowing: number | null = null;

    for (const s of snapshots) {
      const raw = s.followersCount ?? s.fansCount ?? 0;
      const f = (raw === 0 && lastF > 0) ? lastF : raw;
      lastF = f || lastF;
      followersTimeSeries.push({ date: s.metricDate, value: f });
      if (s.followingCount != null) {
        lastFollowing = s.followingCount;
        followingTimeSeries.push({ date: s.metricDate, value: s.followingCount });
      } else if (lastFollowing != null) {
        followingTimeSeries.push({ date: s.metricDate, value: lastFollowing });
      }
    }

    const firstSnapshotAt = snapshots.length > 0 ? snapshots[0].metricDate : null;
    return {
      followersTimeSeries,
      followingTimeSeries: followingTimeSeries.length > 0 ? followingTimeSeries : null,
      firstSnapshotAt,
      snapshotCount: snapshots.length,
    };
  } catch (e) {
    console.warn('[MetricSnapshot] getAccountHistorySeries skipped (table missing?):', (e as Error)?.message?.slice(0, 120));
    return { followersTimeSeries: [], followingTimeSeries: null, firstSnapshotAt: null, snapshotCount: 0 };
  }
}

/**
 * Build a flat bootstrap series from firstConnectedAt through endDate using current values.
 * Used when we have only one (or zero) snapshots so the chart shows a flat line from connection date.
 * Do NOT fabricate pre-connection history.
 */
export function buildBootstrapFlatSeries(params: {
  firstConnectedAt: Date;
  endDate: string; // YYYY-MM-DD
  followersCount: number;
  followingCount: number | null;
  fansCount?: number;
}): {
  followersTimeSeries: Array<{ date: string; value: number }>;
  followingTimeSeries: Array<{ date: string; value: number }> | null;
} {
  const start = new Date(params.firstConnectedAt);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(params.endDate + 'T12:00:00Z');
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  const followers = params.followersCount ?? params.fansCount ?? 0;
  const followersTimeSeries = dates.map((date) => ({ date, value: followers }));
  const followingTimeSeries =
    params.followingCount != null
      ? dates.map((date) => ({ date, value: params.followingCount! }))
      : null;
  return { followersTimeSeries, followingTimeSeries };
}

/**
 * For Instagram/Facebook: ensure we have a snapshot for today (bootstrap on connect or manual refresh).
 * Call after successful connect/reconnect or when user opens analytics and today is missing.
 */
export async function ensureBootstrapSnapshotForToday(account: {
  id: string;
  userId: string;
  platform: Platform;
  platformUserId: string;
  accessToken: string;
}): Promise<void> {
  if (!INSTAGRAM_FACEBOOK.includes(account.platform as (typeof INSTAGRAM_FACEBOOK)[number])) return;

  const today = new Date().toISOString().slice(0, 10);

  if (account.platform === 'INSTAGRAM') {
    const { followersCount, followingCount } = await fetchCurrentInstagramMetrics(
      account.platformUserId,
      account.accessToken
    );
    await upsertDailyMetricSnapshot({
      userId: account.userId,
      socialAccountId: account.id,
      platform: 'INSTAGRAM',
      externalAccountId: account.platformUserId,
      metricDate: today,
      followersCount,
      followingCount,
      fansCount: null,
      source: 'bootstrap',
    });
  } else if (account.platform === 'FACEBOOK') {
    const { followersCount, fansCount } = await fetchCurrentFacebookMetrics(
      account.platformUserId,
      account.accessToken
    );
    await upsertDailyMetricSnapshot({
      userId: account.userId,
      socialAccountId: account.id,
      platform: 'FACEBOOK',
      externalAccountId: account.platformUserId,
      metricDate: today,
      followersCount,
      followingCount: null,
      fansCount,
      source: 'bootstrap',
    });
  }
}

/**
 * Run daily snapshot sync for all connected Instagram and Facebook accounts.
 * Call from a cron route or scheduled job.
 */
export async function runDailyMetricSnapshotSync(): Promise<{ processed: number; errors: string[] }> {
  const accounts = await prisma.socialAccount.findMany({
    where: {
      platform: { in: ['INSTAGRAM', 'FACEBOOK'] },
      status: 'connected',
    },
    select: { id: true, userId: true, platform: true, platformUserId: true, accessToken: true },
  });

  const errors: string[] = [];
  let processed = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const acc of accounts) {
    try {
      if (acc.platform === 'INSTAGRAM') {
        const { followersCount, followingCount } = await fetchCurrentInstagramMetrics(
          acc.platformUserId,
          acc.accessToken
        );
        await upsertDailyMetricSnapshot({
          userId: acc.userId,
          socialAccountId: acc.id,
          platform: 'INSTAGRAM',
          externalAccountId: acc.platformUserId,
          metricDate: today,
          followersCount,
          followingCount,
          fansCount: null,
          source: 'scheduled_sync',
        });
      } else {
        const { followersCount, fansCount } = await fetchCurrentFacebookMetrics(
          acc.platformUserId,
          acc.accessToken
        );
        await upsertDailyMetricSnapshot({
          userId: acc.userId,
          socialAccountId: acc.id,
          platform: 'FACEBOOK',
          externalAccountId: acc.platformUserId,
          metricDate: today,
          followersCount,
          followingCount: null,
          fansCount,
          source: 'scheduled_sync',
        });
      }
      processed++;
    } catch (e) {
      errors.push(`${acc.platform} ${acc.platformUserId}: ${(e as Error).message}`);
    }
  }

  return { processed, errors };
}
