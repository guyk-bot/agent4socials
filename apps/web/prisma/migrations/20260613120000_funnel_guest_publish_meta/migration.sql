-- AlterTable
ALTER TABLE "funnel_sessions" ADD COLUMN IF NOT EXISTS "guestPublishMeta" JSONB;
