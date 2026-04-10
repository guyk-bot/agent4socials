-- Post.tiktokPublishByAccountId: TikTok Direct Post settings per connected account (composer + scheduled publish).
-- Run in Supabase SQL Editor if you see: "The column Post.tiktokPublishByAccountId does not exist"
-- (Usually means prisma migrate deploy did not run on production; fix DATABASE_DIRECT_URL and redeploy.)

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "tiktokPublishByAccountId" JSONB;
