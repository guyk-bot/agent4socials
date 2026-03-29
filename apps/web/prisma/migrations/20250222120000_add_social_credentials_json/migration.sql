-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN IF NOT EXISTS "credentialsJson" JSONB;

-- CreateTable (Twitter OAuth 1.0a flow: store request token secret between redirects)
CREATE TABLE IF NOT EXISTS "PendingTwitterOAuth1" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requestToken" TEXT NOT NULL,
    "requestTokenSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PendingTwitterOAuth1_pkey" PRIMARY KEY ("id")
);
