-- Cache YouTube Analytics extended bundle (demographics, traffic sources, growth, extra metrics)
-- per connected account + date range so dashboard loads are fast on repeat visits.

CREATE TABLE "youtube_extended_insights_cache" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "rangeStart" TEXT NOT NULL,
    "rangeEnd" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_extended_insights_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "youtube_extended_insights_cache_socialAccountId_rangeStart_rangeEnd_key" ON "youtube_extended_insights_cache"("socialAccountId", "rangeStart", "rangeEnd");

CREATE INDEX "youtube_extended_insights_cache_socialAccountId_updatedAt_idx" ON "youtube_extended_insights_cache"("socialAccountId", "updatedAt");

ALTER TABLE "youtube_extended_insights_cache" ADD CONSTRAINT "youtube_extended_insights_cache_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
