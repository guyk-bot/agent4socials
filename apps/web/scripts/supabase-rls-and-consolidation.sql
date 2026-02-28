-- =============================================================================
-- SUPABASE: Remove UNRESTRICTED tags + consolidate tables (one script)
-- Run in: Supabase Dashboard → SQL Editor
--
-- After running: Update prisma/schema.prisma and app code to use new structure.
-- =============================================================================

-- PART 1: Enable RLS (removes UNRESTRICTED tag)
-- Only applies to tables that exist, so script won't fail if some tables are missing
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
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS "allow_app_full_access" ON %I', t);
      EXECUTE format('CREATE POLICY "allow_app_full_access" ON %I FOR ALL USING (true) WITH CHECK (true)', t);
    END IF;
  END LOOP;
END $$;

-- PART 2: Consolidate tables (fewer tables)
CREATE TABLE IF NOT EXISTS "PendingConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PendingConnection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PendingConnection_userId_idx" ON "PendingConnection"("userId");
CREATE INDEX IF NOT EXISTS "PendingConnection_userId_platform_idx" ON "PendingConnection"("userId", "platform");

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PendingFacebookConnection') THEN
    INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
    SELECT "id", "userId", 'FACEBOOK', jsonb_build_object('accessToken', "accessToken", 'pages', "pages"), "expiresAt", "createdAt"
    FROM "PendingFacebookConnection" ON CONFLICT (id) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PendingInstagramConnection') THEN
    INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
    SELECT "id", "userId", 'INSTAGRAM', jsonb_build_object('accessToken', "accessToken", 'accounts', "accounts"), "expiresAt", "createdAt"
    FROM "PendingInstagramConnection" ON CONFLICT (id) DO NOTHING;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'PendingTwitterOAuth1') THEN
    INSERT INTO "PendingConnection" ("id", "userId", "platform", "payload", "expiresAt", "createdAt")
    SELECT "id", "userId", 'TWITTER', jsonb_build_object('requestToken', "requestToken", 'requestTokenSecret', "requestTokenSecret"), NULL, "createdAt"
    FROM "PendingTwitterOAuth1" ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandContext" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "automationSettings" JSONB;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'BrandContext') THEN
    UPDATE "User" u SET "brandContext" = (SELECT to_jsonb(b) - 'id' - 'userId' - 'createdAt' - 'updatedAt' FROM "BrandContext" b WHERE b."userId" = u.id LIMIT 1)
    WHERE EXISTS (SELECT 1 FROM "BrandContext" b WHERE b."userId" = u.id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'AutomationSettings') THEN
    UPDATE "User" u SET "automationSettings" = (
      SELECT jsonb_build_object('dmWelcomeEnabled', s."dmWelcomeEnabled", 'dmWelcomeMessage', s."dmWelcomeMessage", 'dmNewFollowerEnabled', s."dmNewFollowerEnabled", 'dmNewFollowerMessage', s."dmNewFollowerMessage")
      FROM "AutomationSettings" s WHERE s."userId" = u.id LIMIT 1
    )
    WHERE EXISTS (SELECT 1 FROM "AutomationSettings" s WHERE s."userId" = u.id);
  END IF;
END $$;

DROP TABLE IF EXISTS "PendingFacebookConnection";
DROP TABLE IF EXISTS "PendingInstagramConnection";
DROP TABLE IF EXISTS "PendingTwitterOAuth1";
DROP TABLE IF EXISTS "BrandContext";
DROP TABLE IF EXISTS "AutomationSettings";

ALTER TABLE "PendingConnection" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_app_full_access" ON "PendingConnection";
CREATE POLICY "allow_app_full_access" ON "PendingConnection" FOR ALL USING (true) WITH CHECK (true);
