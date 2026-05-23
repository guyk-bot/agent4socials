-- Run in Supabase SQL Editor if production logs: Post.alsoPostToStory does not exist
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "alsoPostToStory" BOOLEAN NOT NULL DEFAULT false;
