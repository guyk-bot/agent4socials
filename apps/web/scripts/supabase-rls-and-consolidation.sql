-- =============================================================================
-- SUPABASE: Remove UNRESTRICTED tags + optional table consolidation
-- =============================================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- SECTION 1 (safe): Enables RLS and adds permissive policies → removes UNRESTRICTED tag
-- SECTION 2 (optional): Consolidates tables → fewer tables. REQUIRES Prisma + app updates.
-- =============================================================================

-- =============================================================================
-- SECTION 1: Enable RLS (removes UNRESTRICTED tag)
-- Safe to run. No schema structure changes. App keeps working.
-- =============================================================================

-- Enable RLS on all app tables
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandContext" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SocialAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ImportedPost" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingFacebookConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingInstagramConnection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PendingTwitterOAuth1" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PostTarget" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaAsset" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CommentAutomationReply" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationFollowerWelcome" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DeployTriggerState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- Add permissive policy so your app (Prisma/server) can access all rows.
-- DROP first so rerunning this script is safe.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'User', 'BrandContext', 'SocialAccount', 'ImportedPost',
    'PendingFacebookConnection', 'PendingInstagramConnection', 'PendingTwitterOAuth1',
    'Post', 'PostTarget', 'MediaAsset', 'CommentAutomationReply',
    'AutomationSettings', 'AutomationFollowerWelcome', 'DeployTriggerState', '_prisma_migrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "allow_app_full_access" ON %I', t);
    EXECUTE format('CREATE POLICY "allow_app_full_access" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;

-- =============================================================================
-- SECTION 2: OPTIONAL TABLE CONSOLIDATION
-- =============================================================================
-- WARNING: This section CHANGES the schema. Your app will BREAK until you:
-- 1. Update prisma/schema.prisma to match
-- 2. Update all code that uses BrandContext, AutomationSettings, Pending*
--
-- This reduces tables by merging:
--   - PendingFacebookConnection + PendingInstagramConnection + PendingTwitterOAuth1 → PendingConnection
--   - BrandContext → User.brandContext (JSONB)
--   - AutomationSettings → User.automationSettings (JSONB)
--
-- Result: 5 fewer tables (from ~15 to ~10).
--
-- DO NOT RUN SECTION 2 unless you are ready to update the Prisma schema and app code.
-- =============================================================================

/*
-- 2a. Create consolidated PendingConnection
CREATE TABLE IF NOT EXISTS "PendingConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PendingConnection_userId_idx" ON "PendingConnection"("userId");
CREATE INDEX "PendingConnection_userId_platform_idx" ON "PendingConnection"("userId", "platform");

-- 2b. Migrate PendingFacebookConnection
INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
SELECT "id", "userId", 'FACEBOOK', jsonb_build_object('accessToken', "accessToken", 'pages', "pages"), "expiresAt", "createdAt"
FROM "PendingFacebookConnection"
ON CONFLICT DO NOTHING;

-- 2c. Migrate PendingInstagramConnection
INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
SELECT "id", "userId", 'INSTAGRAM', jsonb_build_object('accessToken', "accessToken", 'accounts', "accounts"), "expiresAt", "createdAt"
FROM "PendingInstagramConnection"
ON CONFLICT DO NOTHING;

-- 2d. Migrate PendingTwitterOAuth1
INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
SELECT "id", "userId", 'TWITTER', jsonb_build_object('requestToken', "requestToken", 'requestTokenSecret', "requestTokenSecret"), NULL, "createdAt"
FROM "PendingTwitterOAuth1"
ON CONFLICT DO NOTHING;

-- 2e. Add JSONB columns to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandContext" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "automationSettings" JSONB;

-- 2f. Migrate BrandContext → User.brandContext
UPDATE "User" u SET "brandContext" = (
  SELECT to_jsonb(b) - 'id' - 'userId' - 'createdAt' - 'updatedAt'
  FROM "BrandContext" b WHERE b."userId" = u.id LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM "BrandContext" b WHERE b."userId" = u.id);

-- 2g. Migrate AutomationSettings → User.automationSettings
UPDATE "User" u SET "automationSettings" = (
  SELECT jsonb_build_object(
    'dmWelcomeEnabled', s."dmWelcomeEnabled",
    'dmWelcomeMessage', s."dmWelcomeMessage",
    'dmNewFollowerEnabled', s."dmNewFollowerEnabled",
    'dmNewFollowerMessage', s."dmNewFollowerMessage"
  )
  FROM "AutomationSettings" s WHERE s."userId" = u.id LIMIT 1
)
WHERE EXISTS (SELECT 1 FROM "AutomationSettings" s WHERE s."userId" = u.id);

-- 2h. After confirming app works with new schema, drop old tables:
-- DROP TABLE IF EXISTS "PendingFacebookConnection";
-- DROP TABLE IF EXISTS "PendingInstagramConnection";
-- DROP TABLE IF EXISTS "PendingTwitterOAuth1";
-- DROP TABLE IF EXISTS "BrandContext";
-- DROP TABLE IF EXISTS "AutomationSettings";
*/
