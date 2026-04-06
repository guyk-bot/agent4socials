-- =============================================================================
-- AGENT4SOCIALS DATABASE CLEANUP & SECURITY SCRIPT
-- =============================================================================
-- Run in Supabase Dashboard → SQL Editor
--
-- Skips any table that does not exist yet (so it is safe if migrations are partial).
--
-- 1. Enables RLS + adds a policy on tables that exist
-- 2. Deletes old observability rows (only if those tables exist)
-- 3. Adds indexes
-- 4. Shows row counts for tables that exist
--
-- SAFE TO RUN: Does NOT delete users, SocialAccount, Post, or ImportedPost content.
-- =============================================================================

-- =============================================================================
-- PART 1: RLS + policy (only when the table exists)
-- =============================================================================

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'LinkPage',
    'LinkItem',
    'facebook_pages',
    'facebook_page_insight_daily',
    'facebook_conversations',
    'facebook_reviews',
    'sync_jobs',
    'FacebookMetricDiscovery',
    'FacebookSyncRun'
  ]
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', 'public', tbl);
      EXECUTE format(
        'CREATE POLICY "Service role full access" ON %I.%I FOR ALL USING (true) WITH CHECK (true)',
        'public',
        tbl
      );
    EXCEPTION
      WHEN undefined_table THEN
        NULL; -- table not created yet; skip
      WHEN duplicate_object THEN
        NULL; -- policy already exists; skip
    END;
  END LOOP;
END $$;

-- =============================================================================
-- PART 2: Clean stale rows (only when the table exists)
-- =============================================================================

DO $$
BEGIN
  DELETE FROM "sync_jobs" WHERE "createdAt" < NOW() - INTERVAL '30 days';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  DELETE FROM "FacebookSyncRun" WHERE "startedAt" < NOW() - INTERVAL '30 days';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  DELETE FROM "FacebookMetricDiscovery" WHERE "validatedAt" < NOW() - INTERVAL '30 days';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  DELETE FROM "PendingConnection" WHERE "expiresAt" IS NOT NULL AND "expiresAt" < NOW();
  DELETE FROM "PendingConnection" WHERE "createdAt" < NOW() - INTERVAL '24 hours';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  DELETE FROM verification_codes WHERE expires_at < NOW();
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- =============================================================================
-- PART 3: Indexes (IF NOT EXISTS is safe)
-- =============================================================================

CREATE INDEX IF NOT EXISTS "ImportedPost_platform_publishedAt_idx"
  ON "ImportedPost"("platform", "publishedAt" DESC);

CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_metricDate_idx"
  ON "AccountMetricSnapshot"("metricDate" DESC);

CREATE INDEX IF NOT EXISTS "Post_status_scheduledAt_idx"
  ON "Post"("status", "scheduledAt");

-- =============================================================================
-- PART 4: Summary (core tables only, skips optional tables that may not exist)
-- =============================================================================

SELECT
  'Cleanup finished' AS status,
  (SELECT COUNT(*) FROM "User") AS users,
  (SELECT COUNT(*) FROM "SocialAccount") AS social_accounts,
  (SELECT COUNT(*) FROM "Post") AS posts,
  (SELECT COUNT(*) FROM "ImportedPost") AS imported_posts,
  (SELECT COUNT(*) FROM "AccountMetricSnapshot") AS metric_snapshots;
