-- Add repostsCount and sharesCount to ImportedPost for X (Twitter) and other platforms
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "repostsCount" INTEGER DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "sharesCount" INTEGER DEFAULT 0;
