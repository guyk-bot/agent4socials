-- AddColumn: Post.mediaType
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "mediaType" TEXT;
