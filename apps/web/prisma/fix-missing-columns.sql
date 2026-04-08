-- =============================================================================
-- FIX MISSING COLUMNS
-- =============================================================================
-- Run this in Supabase Dashboard → SQL Editor if migrations aren't applying
-- This adds columns that the code expects but the database is missing
-- =============================================================================

-- ImportedPost columns
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "repostsCount" INTEGER DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "sharesCount" INTEGER DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "savesCount" INTEGER DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "platformMetadata" JSONB;

-- SocialAccount sync-tracking columns
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncStatus" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "lastSyncError" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "initialBackfillDone" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "permissionsSnapshot" JSONB;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "firstConnectedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3);

-- Create sync_jobs table if missing (used by sync engine)
CREATE TABLE IF NOT EXISTS "sync_jobs" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "socialAccountId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "syncType" TEXT NOT NULL DEFAULT 'scheduled',
  "status" TEXT NOT NULL DEFAULT 'queued',
  "idempotencyKey" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "errorDetails" TEXT,
  "itemsProcessed" INTEGER,
  "cursorState" JSONB,
  "triggeredBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "sync_jobs_idempotencyKey_key" ON "sync_jobs"("idempotencyKey");

-- Create facebook_page_insight_daily if missing
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "facebook_page_insight_daily_socialAccountId_metricKey_metricDate_key" 
  ON "facebook_page_insight_daily"("socialAccountId", "metricKey", "metricDate");

-- Create facebook_pages (FacebookPageCache) if missing
CREATE TABLE IF NOT EXISTS "facebook_pages" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "socialAccountId" TEXT NOT NULL UNIQUE,
  "pageId" TEXT NOT NULL,
  "profileJson" JSONB,
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

-- Create facebook_conversations if missing
CREATE TABLE IF NOT EXISTS "facebook_conversations" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "socialAccountId" TEXT NOT NULL,
  "platformConversationId" TEXT NOT NULL,
  "link" TEXT,
  "updatedTime" TIMESTAMP(3),
  "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "facebook_conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "facebook_conversations_socialAccountId_platformConversationId_key" 
  ON "facebook_conversations"("socialAccountId", "platformConversationId");

-- Create facebook_reviews if missing
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
);
CREATE UNIQUE INDEX IF NOT EXISTS "facebook_reviews_socialAccountId_contentHash_key" 
  ON "facebook_reviews"("socialAccountId", "contentHash");

-- Verify columns exist
SELECT 
  'Columns added. ImportedPost columns:' as status,
  column_name
FROM information_schema.columns 
WHERE table_name = 'ImportedPost' 
  AND column_name IN ('repostsCount', 'sharesCount', 'platformMetadata');
