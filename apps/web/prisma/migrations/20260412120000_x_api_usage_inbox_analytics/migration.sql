-- X (Twitter) pay-per-use shields + analytics / inbox sync timestamps
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "xApiCallCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "xApiSyncLimit" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "xApiUsageMonthKey" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "xAnalyticsLastSyncedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "xInboxLastManualSyncAt" TIMESTAMP(3);
