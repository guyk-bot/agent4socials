-- Add likeCount and commentsCount columns to ImportedPost
-- Using IF NOT EXISTS guards so this is safe to re-run.
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "likeCount" INTEGER DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "commentsCount" INTEGER DEFAULT 0;
