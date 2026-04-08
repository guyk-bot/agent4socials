-- CreateEnum
CREATE TYPE "NicheVideoType" AS ENUM ('short', 'long');

-- CreateTable
CREATE TABLE "niche_trends" (
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

-- CreateIndex
CREATE UNIQUE INDEX "niche_trends_video_id_key" ON "niche_trends"("video_id");

-- CreateIndex
CREATE INDEX "niche_trends_niche_name_idx" ON "niche_trends"("niche_name");

-- CreateIndex
CREATE INDEX "niche_trends_niche_name_last_updated_idx" ON "niche_trends"("niche_name", "last_updated");

-- CreateIndex
CREATE INDEX "niche_trends_performance_ratio_idx" ON "niche_trends"("performance_ratio" DESC);
