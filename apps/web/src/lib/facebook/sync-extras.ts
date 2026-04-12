import axios from 'axios';
import { prisma } from '@/lib/db';
import { fbRestBaseUrl } from './constants';
import { fetchPageProfile, reviewContentHash } from './fetchers';

let _fbTablesEnsured = false;
/** Coalesce concurrent DDL attempts (many parallel /insights calls on cold pool). */
let _fbEnsureInFlight: Promise<void> | null = null;

async function facebookCoreTablesAlreadyExist(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'facebook_pages'
      ) AS "exists"`
    );
    return Boolean(rows?.[0]?.exists);
  } catch {
    return false;
  }
}

async function runFacebookTableMigrations(): Promise<void> {
  await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "facebook_pages" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "socialAccountId" TEXT NOT NULL,
        "pageId" TEXT NOT NULL,
        "profileJson" JSONB,
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "facebook_pages_socialAccountId_key" ON "facebook_pages"("socialAccountId")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_pages_socialAccountId_fkey') THEN
          ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_socialAccountId_fkey"
            FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "facebook_conversations" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "socialAccountId" TEXT NOT NULL,
        "platformConversationId" TEXT NOT NULL,
        "link" TEXT,
        "updatedTime" TIMESTAMP(3),
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "facebook_conversations_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "facebook_conversations_socialAccountId_platformConversationId_key" ON "facebook_conversations"("socialAccountId", "platformConversationId")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "facebook_conversations_socialAccountId_updatedTime_idx" ON "facebook_conversations"("socialAccountId", "updatedTime")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_conversations_socialAccountId_fkey') THEN
          ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_socialAccountId_fkey"
            FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "facebook_reviews" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "socialAccountId" TEXT NOT NULL,
        "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
        "recommendationType" TEXT,
        "reviewText" TEXT,
        "contentHash" TEXT NOT NULL,
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "facebook_reviews_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "facebook_reviews_socialAccountId_contentHash_key" ON "facebook_reviews"("socialAccountId", "contentHash")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "facebook_reviews_socialAccountId_sourceCreatedAt_idx" ON "facebook_reviews"("socialAccountId", "sourceCreatedAt")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_reviews_socialAccountId_fkey') THEN
          ALTER TABLE "facebook_reviews" ADD CONSTRAINT "facebook_reviews_socialAccountId_fkey"
            FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "facebook_page_insight_daily" (
        "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "socialAccountId" TEXT NOT NULL,
        "pageId" TEXT NOT NULL,
        "metricDate" TEXT NOT NULL,
        "metricKey" TEXT NOT NULL,
        "value" DOUBLE PRECISION NOT NULL,
        "source" TEXT NOT NULL DEFAULT 'insights_api',
        "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "facebook_page_insight_daily_pkey" PRIMARY KEY ("id")
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "facebook_page_insight_daily_socialAccountId_metricKey_metricDate_key" ON "facebook_page_insight_daily"("socialAccountId", "metricKey", "metricDate")`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "facebook_page_insight_daily_userId_pageId_metricDate_idx" ON "facebook_page_insight_daily"("userId", "pageId", "metricDate")`);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facebook_page_insight_daily_socialAccountId_fkey') THEN
          ALTER TABLE "facebook_page_insight_daily" ADD CONSTRAINT "facebook_page_insight_daily_socialAccountId_fkey"
            FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$
    `);
}

/** Create Facebook cache + insight tables if they were skipped by a failed migration. Safe to call many times.
 * Races with a 2s deadline so pool contention never blocks the actual request. */
export async function ensureFacebookTables(): Promise<void> {
  if (_fbTablesEnsured || process.env.SKIP_TABLE_ENSURE === '1') { _fbTablesEnsured = true; return; }
  if (_fbEnsureInFlight) { await _fbEnsureInFlight; return; }
  const deadline = new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 2000));
  const run = (async (): Promise<'done'> => {
    try {
      if (await facebookCoreTablesAlreadyExist()) { _fbTablesEnsured = true; return 'done'; }
      await runFacebookTableMigrations();
      _fbTablesEnsured = true;
      console.log('[Facebook] Cache + insight tables ensured.');
    } catch (e) {
      console.warn('[Facebook] ensureFacebookTables failed (non-fatal):', (e as Error)?.message?.slice(0, 200));
    }
    return 'done';
  })();
  _fbEnsureInFlight = run.then(() => {});
  try { await Promise.race([run, deadline]); } finally { if (_fbEnsureInFlight) _fbEnsureInFlight = null; }
}

export type FacebookAuxSyncReport = {
  pageProfileCached: boolean;
  conversationsPages: number;
  conversationsUpserted: number;
  reviewsPages: number;
  reviewsUpserted: number;
  errors: string[];
};

/**
 * Persists Page profile, paginated conversations, and ratings into normalized cache tables.
 * Does not call `/{page-id}/notifications` (not a valid Page field per live Graph).
 */
export async function syncFacebookAuxiliaryIngest(params: {
  socialAccountId: string;
  pageId: string;
  accessToken: string;
}): Promise<FacebookAuxSyncReport> {
  const { socialAccountId, pageId, accessToken } = params;
  const errors: string[] = [];
  let pageProfileCached = false;

  await ensureFacebookTables();

  try {
    const prof = await fetchPageProfile(pageId, accessToken);
    if (prof.status === 200 && prof.data?.id) {
      await prisma.facebookPageCache.upsert({
        where: { socialAccountId },
        create: { socialAccountId, pageId, profileJson: prof.data as object },
        update: { pageId, profileJson: prof.data as object, fetchedAt: new Date() },
      });
      pageProfileCached = true;
    } else {
      errors.push('page_profile_failed');
    }
  } catch {
    errors.push('page_profile_exception');
  }

  let conversationsPages = 0;
  let conversationsUpserted = 0;
  try {
    let after: string | undefined;
    while (conversationsPages < 12) {
      conversationsPages += 1;
      const p: Record<string, string> = {
        platform: 'MESSENGER',
        access_token: accessToken,
        limit: '50',
        fields: 'id,link,updated_time',
      };
      if (after) p.after = after;
      const res = await axios.get(`${fbRestBaseUrl}/${pageId}/conversations`, {
        params: p,
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (res.status !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message;
        if (err) errors.push(`conversations:${err}`);
        break;
      }
      const rows = (res.data as { data?: Array<{ id?: string; link?: string; updated_time?: string }> }).data ?? [];
      for (const r of rows) {
        if (!r.id) continue;
        await prisma.facebookConversationCache.upsert({
          where: {
            socialAccountId_platformConversationId: { socialAccountId, platformConversationId: r.id },
          },
          create: {
            socialAccountId,
            platformConversationId: r.id,
            link: r.link ?? null,
            updatedTime: r.updated_time ? new Date(r.updated_time) : null,
          },
          update: {
            link: r.link ?? null,
            updatedTime: r.updated_time ? new Date(r.updated_time) : null,
            fetchedAt: new Date(),
          },
        });
        conversationsUpserted += 1;
      }
      const nextAfter = (res.data as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after;
      if (!nextAfter || rows.length === 0) break;
      after = nextAfter;
    }
  } catch {
    errors.push('conversations_exception');
  }

  let reviewsPages = 0;
  let reviewsUpserted = 0;
  try {
    const fields = 'created_time,recommendation_type,review_text,rating';
    let after: string | undefined;
    while (reviewsPages < 12) {
      reviewsPages += 1;
      const p: Record<string, string> = { fields, access_token: accessToken, limit: '50' };
      if (after) p.after = after;
      const res = await axios.get(`${fbRestBaseUrl}/${pageId}/ratings`, {
        params: p,
        timeout: 15_000,
        validateStatus: () => true,
      });
      if (res.status !== 200) {
        const err = (res.data as { error?: { message?: string } })?.error?.message;
        if (err) errors.push(`ratings:${err}`);
        break;
      }
      const rows = (res.data as {
        data?: Array<{ created_time?: string; recommendation_type?: string; review_text?: string }>;
      }).data ?? [];
      for (const r of rows) {
        const created = r.created_time ? new Date(r.created_time) : new Date();
        const hash = reviewContentHash(r.created_time ?? null, r.review_text ?? null);
        await prisma.facebookReviewCache.upsert({
          where: { socialAccountId_contentHash: { socialAccountId, contentHash: hash } },
          create: {
            socialAccountId,
            sourceCreatedAt: created,
            recommendationType: r.recommendation_type ?? null,
            reviewText: r.review_text ?? null,
            contentHash: hash,
          },
          update: {
            recommendationType: r.recommendation_type ?? null,
            reviewText: r.review_text ?? null,
            fetchedAt: new Date(),
          },
        });
        reviewsUpserted += 1;
      }
      const nextAfter = (res.data as { paging?: { cursors?: { after?: string } } }).paging?.cursors?.after;
      if (!nextAfter || rows.length === 0) break;
      after = nextAfter;
    }
  } catch {
    errors.push('reviews_exception');
  }

  return {
    pageProfileCached,
    conversationsPages,
    conversationsUpserted,
    reviewsPages,
    reviewsUpserted,
    errors,
  };
}
