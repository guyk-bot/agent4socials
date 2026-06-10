-- CreateTable
CREATE TABLE "funnel_sessions" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "guestUserId" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "connectedPlatform" "Platform",
    "connectedAccountId" TEXT,
    "chatPayload" JSONB,
    "brandContextDraft" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mergedToUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funnel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "funnel_sessions_token_key" ON "funnel_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "funnel_sessions_guestUserId_key" ON "funnel_sessions"("guestUserId");

-- CreateIndex
CREATE INDEX "funnel_sessions_expiresAt_idx" ON "funnel_sessions"("expiresAt");
