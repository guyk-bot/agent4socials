-- Facebook analytics: metric discovery cache + sync observability + optional ImportedPost.metadata
CREATE TYPE "FacebookMetricProbeStatus" AS ENUM ('VALID', 'INVALID', 'DEPRECATED', 'UNAVAILABLE');

CREATE TABLE "FacebookMetricDiscovery" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "status" "FacebookMetricProbeStatus" NOT NULL,
    "lastError" TEXT,
    "graphVersion" TEXT NOT NULL,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacebookMetricDiscovery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FacebookMetricDiscovery_socialAccountId_scope_metricName_key"
    ON "FacebookMetricDiscovery"("socialAccountId", "scope", "metricName");

CREATE INDEX "FacebookMetricDiscovery_socialAccountId_scope_status_idx"
    ON "FacebookMetricDiscovery"("socialAccountId", "scope", "status");

ALTER TABLE "FacebookMetricDiscovery" ADD CONSTRAINT "FacebookMetricDiscovery_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FacebookSyncRun" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "runKind" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT false,
    "summary" JSONB,
    "errorMessage" TEXT,

    CONSTRAINT "FacebookSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FacebookSyncRun_socialAccountId_startedAt_idx"
    ON "FacebookSyncRun"("socialAccountId", "startedAt");

ALTER TABLE "FacebookSyncRun" ADD CONSTRAINT "FacebookSyncRun_socialAccountId_fkey"
    FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "platformMetadata" JSONB;
