-- TikTok Direct Post: store per-account publish settings for scheduled/cron publishes.
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "tiktokPublishByAccountId" JSONB;
