-- Run in Supabase SQL Editor if production logs: Post.threadsShareToInstagram does not exist
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "threadsShareToInstagram" BOOLEAN NOT NULL DEFAULT false;
