-- Add connection history fields to SocialAccount for reconnect preservation and tracking start.
-- firstConnectedAt: set once on first ever connect for this external account; never cleared on disconnect.
-- connectedAt: set on each connect/reconnect.
-- disconnectedAt: set on disconnect; cleared on reconnect. Enables soft disconnect without losing history.
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "firstConnectedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "connectedAt" TIMESTAMP(3);
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "disconnectedAt" TIMESTAMP(3);

-- Backfill: existing rows are currently connected; treat createdAt as first/connected at.
UPDATE "SocialAccount" SET "firstConnectedAt" = "createdAt", "connectedAt" = "createdAt" WHERE "firstConnectedAt" IS NULL;

-- CreateTable: AccountMetricSnapshot for persistent follower/following/fans history (Instagram & Facebook only).
CREATE TABLE IF NOT EXISTS "AccountMetricSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "externalAccountId" TEXT NOT NULL,
    "metricDate" TEXT NOT NULL,
    "metricTimestamp" TIMESTAMP(3) NOT NULL,
    "followersCount" INTEGER,
    "followingCount" INTEGER,
    "fansCount" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'bootstrap',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountMetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- One snapshot per account per calendar day (upsert key).
CREATE UNIQUE INDEX IF NOT EXISTS "AccountMetricSnapshot_userId_platform_externalAccountId_metricDate_key"
  ON "AccountMetricSnapshot"("userId", "platform", "externalAccountId", "metricDate");

CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_userId_platform_externalAccountId_metricTimestamp_idx"
  ON "AccountMetricSnapshot"("userId", "platform", "externalAccountId", "metricTimestamp");

CREATE INDEX IF NOT EXISTS "AccountMetricSnapshot_socialAccountId_metricDate_idx"
  ON "AccountMetricSnapshot"("socialAccountId", "metricDate");

ALTER TABLE "AccountMetricSnapshot" ADD CONSTRAINT "AccountMetricSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AccountMetricSnapshot" ADD CONSTRAINT "AccountMetricSnapshot_socialAccountId_fkey"
  FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
