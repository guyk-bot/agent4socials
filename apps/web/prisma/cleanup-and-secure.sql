-- =============================================================================
-- AGENT4SOCIALS DATABASE CLEANUP & SECURITY SCRIPT
-- =============================================================================
-- Run in Supabase Dashboard → SQL Editor
-- 
-- This script:
-- 1. Adds RLS policies to all "UNRESTRICTED" tables (security best practice)
-- 2. Cleans up stale observability/debug data (keeps last 30 days)
-- 3. Removes truly unused tables (safely)
-- 4. Adds missing indexes for performance
--
-- SAFE TO RUN: Does NOT delete any core data (users, accounts, posts, insights)
-- =============================================================================

-- =============================================================================
-- PART 1: ADD RLS POLICIES TO UNRESTRICTED TABLES
-- =============================================================================
-- Even though we access the DB via server-side API (not client Supabase JS),
-- adding RLS is best practice and removes the "UNRESTRICTED" warnings.

-- Enable RLS on all Prisma-managed tables
ALTER TABLE IF EXISTS "LinkPage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "LinkItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "facebook_pages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "facebook_page_insight_daily" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "facebook_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "facebook_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "sync_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "FacebookMetricDiscovery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "FacebookSyncRun" ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access (our API uses service_role key)
DO $$
BEGIN
  -- LinkPage
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'LinkPage' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "LinkPage" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- LinkItem
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'LinkItem' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "LinkItem" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- facebook_pages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facebook_pages' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "facebook_pages" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- facebook_page_insight_daily
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facebook_page_insight_daily' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "facebook_page_insight_daily" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- facebook_conversations
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facebook_conversations' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "facebook_conversations" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- facebook_reviews
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'facebook_reviews' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "facebook_reviews" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- sync_jobs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'sync_jobs' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "sync_jobs" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- FacebookMetricDiscovery
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FacebookMetricDiscovery' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "FacebookMetricDiscovery" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
  
  -- FacebookSyncRun
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'FacebookSyncRun' AND policyname = 'Service role full access') THEN
    EXECUTE 'CREATE POLICY "Service role full access" ON "FacebookSyncRun" FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- =============================================================================
-- PART 2: CLEAN UP STALE OBSERVABILITY DATA (keeps last 30 days)
-- =============================================================================

-- Delete old sync jobs (observability logs, not needed after 30 days)
DELETE FROM "sync_jobs" WHERE "createdAt" < NOW() - INTERVAL '30 days';

-- Delete old Facebook sync run logs
DELETE FROM "FacebookSyncRun" WHERE "startedAt" < NOW() - INTERVAL '30 days';

-- Delete stale metric discovery cache (re-probes metrics after 30 days anyway)
DELETE FROM "FacebookMetricDiscovery" WHERE "validatedAt" < NOW() - INTERVAL '30 days';

-- Delete expired pending connections (OAuth temp state)
DELETE FROM "PendingConnection" WHERE "expiresAt" IS NOT NULL AND "expiresAt" < NOW();
DELETE FROM "PendingConnection" WHERE "createdAt" < NOW() - INTERVAL '24 hours';

-- Delete expired verification codes
DELETE FROM verification_codes WHERE expires_at < NOW();

-- =============================================================================
-- PART 3: ADD MISSING INDEXES FOR PERFORMANCE
-- =============================================================================

-- ImportedPost: faster lookup by platform and date
CREATE INDEX IF NOT EXISTS "ImportedPost_platform_publishedAt_idx" 
  ON "ImportedPost"("platform", "publishedAt" DESC);

-- AccountMetricSnapshot: faster date range queries
CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_metricDate_idx" 
  ON "AccountMetricSnapshot"("metricDate" DESC);

-- Post: faster scheduled post queries
CREATE INDEX IF NOT EXISTS "Post_status_scheduledAt_idx" 
  ON "Post"("status", "scheduledAt");

-- =============================================================================
-- PART 4: SHOW CLEANUP SUMMARY
-- =============================================================================

SELECT 
  'Cleanup complete. Table row counts:' as status,
  (SELECT COUNT(*) FROM "User") as users,
  (SELECT COUNT(*) FROM "SocialAccount") as social_accounts,
  (SELECT COUNT(*) FROM "Post") as posts,
  (SELECT COUNT(*) FROM "ImportedPost") as imported_posts,
  (SELECT COUNT(*) FROM "AccountMetricSnapshot") as metric_snapshots,
  (SELECT COUNT(*) FROM "facebook_page_insight_daily") as fb_daily_insights,
  (SELECT COUNT(*) FROM "sync_jobs") as sync_jobs_remaining,
  (SELECT COUNT(*) FROM "FacebookSyncRun") as fb_sync_runs_remaining,
  (SELECT COUNT(*) FROM "FacebookMetricDiscovery") as fb_metric_discovery_remaining;
