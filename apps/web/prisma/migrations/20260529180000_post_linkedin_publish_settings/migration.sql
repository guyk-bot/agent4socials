-- AlterTable
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "linkedInPublishByAccountId" JSONB;
