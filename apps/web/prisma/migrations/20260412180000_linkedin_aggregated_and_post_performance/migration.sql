-- LinkedIn aggregated columns on AccountMetricSnapshot (were in schema but never migrated).
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "linkedinAggregatedImpressions"     INTEGER;
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "linkedinAggregatedClicks"          INTEGER;
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "linkedinAggregatedComments"        INTEGER;
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "linkedinAggregatedShares"          INTEGER;
ALTER TABLE "AccountMetricSnapshot" ADD COLUMN IF NOT EXISTS "linkedinAggregatedVideoWatchTimeMs" INTEGER;

-- PostPerformance table (LinkedIn-first engagement per post; also used for X/Twitter metrics).
CREATE TABLE IF NOT EXISTS "PostPerformance" (
  "id"              TEXT        NOT NULL,
  "userId"          TEXT        NOT NULL,
  "socialAccountId" TEXT        NOT NULL,
  "platform"        "Platform"  NOT NULL DEFAULT 'LINKEDIN',
  "platformPostId"  TEXT        NOT NULL,
  "impressions"     INTEGER     NOT NULL DEFAULT 0,
  "clicks"          INTEGER     NOT NULL DEFAULT 0,
  "comments"        INTEGER     NOT NULL DEFAULT 0,
  "shares"          INTEGER     NOT NULL DEFAULT 0,
  "videoWatchTimeMs" INTEGER,
  "metricsRaw"      JSONB,
  "fetchedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostPerformance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostPerformance_socialAccountId_platformPostId_key"
  ON "PostPerformance"("socialAccountId", "platformPostId");

CREATE INDEX IF NOT EXISTS "PostPerformance_userId_platform_fetchedAt_idx"
  ON "PostPerformance"("userId", "platform", "fetchedAt");

ALTER TABLE "PostPerformance"
  DROP CONSTRAINT IF EXISTS "PostPerformance_socialAccountId_fkey";

ALTER TABLE "PostPerformance"
  ADD CONSTRAINT "PostPerformance_socialAccountId_fkey"
  FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
