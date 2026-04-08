-- Idempotent: Viral Trend Radar table (same as prisma migration 20260408180000_niche_trends).
-- Run in Supabase Dashboard → SQL Editor if prisma migrate deploy did not run on production.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NicheVideoType') THEN
    CREATE TYPE "NicheVideoType" AS ENUM ('short', 'long');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "niche_trends" (
    "id" TEXT NOT NULL,
    "niche_name" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thumbnail_url" TEXT NOT NULL,
    "view_count" BIGINT NOT NULL,
    "subscriber_count" BIGINT NOT NULL,
    "performance_ratio" DOUBLE PRECISION NOT NULL,
    "video_type" "NicheVideoType" NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "niche_trends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "niche_trends_video_id_key" ON "niche_trends"("video_id");
CREATE INDEX IF NOT EXISTS "niche_trends_niche_name_idx" ON "niche_trends"("niche_name");
CREATE INDEX IF NOT EXISTS "niche_trends_niche_name_last_updated_idx" ON "niche_trends"("niche_name", "last_updated");
CREATE INDEX IF NOT EXISTS "niche_trends_performance_ratio_idx" ON "niche_trends"("performance_ratio" DESC);
