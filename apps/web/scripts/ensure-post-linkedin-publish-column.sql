-- Post.linkedInPublishByAccountId: per-account visibility (PUBLIC / CONNECTIONS) for LinkedIn publish.
-- Run in Supabase SQL Editor if you see: "The column Post.linkedInPublishByAccountId does not exist"

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkedInPublishByAccountId" JSONB;
