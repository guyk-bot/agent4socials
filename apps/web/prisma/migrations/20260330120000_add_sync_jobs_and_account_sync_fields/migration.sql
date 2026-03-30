-- Add sync-tracking columns to SocialAccount
ALTER TABLE "SocialAccount"
  ADD COLUMN IF NOT EXISTS "lastSuccessfulSyncAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSyncAttemptAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSyncStatus"       TEXT,
  ADD COLUMN IF NOT EXISTS "lastSyncError"        TEXT,
  ADD COLUMN IF NOT EXISTS "initialBackfillDone"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "permissionsSnapshot"  JSONB;

-- Create sync_jobs table
CREATE TABLE IF NOT EXISTS "sync_jobs" (
  "id"               TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"           TEXT        NOT NULL,
  "socialAccountId"  TEXT        NOT NULL,
  "platform"         TEXT        NOT NULL,
  "scope"            TEXT        NOT NULL,
  "syncType"         TEXT        NOT NULL DEFAULT 'scheduled',
  "status"           TEXT        NOT NULL DEFAULT 'queued',
  "idempotencyKey"   TEXT        NOT NULL,
  "startedAt"        TIMESTAMP(3),
  "finishedAt"       TIMESTAMP(3),
  "errorDetails"     TEXT,
  "itemsProcessed"   INTEGER,
  "cursorState"      JSONB,
  "triggeredBy"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- Unique constraint on idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS "sync_jobs_idempotencyKey_key"
  ON "sync_jobs"("idempotencyKey");

-- Indexes
CREATE INDEX IF NOT EXISTS "sync_jobs_userId_status_idx"
  ON "sync_jobs"("userId", "status");

CREATE INDEX IF NOT EXISTS "sync_jobs_socialAccountId_scope_status_idx"
  ON "sync_jobs"("socialAccountId", "scope", "status");

CREATE INDEX IF NOT EXISTS "sync_jobs_socialAccountId_createdAt_idx"
  ON "sync_jobs"("socialAccountId", "createdAt");

-- Foreign keys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_jobs_socialAccountId_fkey'
  ) THEN
    ALTER TABLE "sync_jobs"
      ADD CONSTRAINT "sync_jobs_socialAccountId_fkey"
      FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sync_jobs_userId_fkey'
  ) THEN
    ALTER TABLE "sync_jobs"
      ADD CONSTRAINT "sync_jobs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
