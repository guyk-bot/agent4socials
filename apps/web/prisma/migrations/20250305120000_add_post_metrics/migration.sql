-- Add separate like/comment/share counts to ImportedPost
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "likeCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "commentsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportedPost" ADD COLUMN IF NOT EXISTS "sharesCount" INTEGER NOT NULL DEFAULT 0;
