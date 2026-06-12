-- AlterTable
ALTER TABLE "funnel_sessions" ADD COLUMN IF NOT EXISTS "guestPublishUsedAt" TIMESTAMP(3);
ALTER TABLE "funnel_sessions" ADD COLUMN IF NOT EXISTS "guestAnalyticsUsedAt" TIMESTAMP(3);
