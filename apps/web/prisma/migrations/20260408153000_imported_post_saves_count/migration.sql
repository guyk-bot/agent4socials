-- TikTok video saves (favorites_count from API when available)
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "savesCount" INTEGER DEFAULT 0;
