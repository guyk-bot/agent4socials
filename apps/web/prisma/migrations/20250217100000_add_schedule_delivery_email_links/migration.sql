-- AlterTable
ALTER TABLE "Post" ADD COLUMN "scheduleDelivery" TEXT,
ADD COLUMN "scheduleEmailSentAt" TIMESTAMP(3),
ADD COLUMN "emailOpenToken" TEXT,
ADD COLUMN "emailOpenTokenExpiresAt" TIMESTAMP(3);
