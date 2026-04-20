-- Post.mediaType: composer media-type choice ('photo' | 'video' | 'reel' | 'carousel' | 'story').
-- Run in Supabase SQL Editor if you see: "The column Post.mediaType does not exist"
-- (Usually means prisma migrate deploy did not run on production; fix DATABASE_DIRECT_URL and redeploy.)

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "mediaType" TEXT;
