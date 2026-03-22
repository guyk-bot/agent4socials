-- Idempotent repair: Facebook metric discovery cache + sync runs + ImportedPost.platformMetadata
-- Use when Vercel skipped `prisma migrate deploy` and you see:
--   The table `public.FacebookMetricDiscovery` does not exist
--
-- Run in Supabase SQL Editor (or any Postgres client), then redeploy or wait up to 60s for serverless caches.

DO $$ BEGIN
  CREATE TYPE "FacebookMetricProbeStatus" AS ENUM ('VALID', 'INVALID', 'DEPRECATED', 'UNAVAILABLE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FacebookMetricDiscovery" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "status" "FacebookMetricProbeStatus" NOT NULL,
    "lastError" TEXT,
    "graphVersion" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FacebookMetricDiscovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FacebookMetricDiscovery_socialAccountId_scope_metricName_key"
    ON "FacebookMetricDiscovery"("socialAccountId", "scope", "metricName");

CREATE INDEX IF NOT EXISTS "FacebookMetricDiscovery_socialAccountId_scope_status_idx"
    ON "FacebookMetricDiscovery"("socialAccountId", "scope", "status");

DO $$ BEGIN
  ALTER TABLE "FacebookMetricDiscovery"
    ADD CONSTRAINT "FacebookMetricDiscovery_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "FacebookSyncRun" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "runKind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "errorMessage" TEXT,
    CONSTRAINT "FacebookSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "FacebookSyncRun_socialAccountId_startedAt_idx"
    ON "FacebookSyncRun"("socialAccountId", "startedAt");

DO $$ BEGIN
  ALTER TABLE "FacebookSyncRun"
    ADD CONSTRAINT "FacebookSyncRun_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "platformMetadata" JSONB;
