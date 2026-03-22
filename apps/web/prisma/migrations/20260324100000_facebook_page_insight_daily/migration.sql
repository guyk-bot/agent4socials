CREATE TABLE "facebook_page_insight_daily" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "metricDate" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'insights_api',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_page_insight_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_page_insight_daily_socialAccountId_metricKey_metricDate_key" ON "facebook_page_insight_daily"("socialAccountId", "metricKey", "metricDate");
CREATE INDEX "facebook_page_insight_daily_userId_pageId_metricDate_idx" ON "facebook_page_insight_daily"("userId", "pageId", "metricDate");

ALTER TABLE "facebook_page_insight_daily" ADD CONSTRAINT "facebook_page_insight_daily_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
