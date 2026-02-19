-- CreateTable
CREATE TABLE "AutomationFollowerWelcome" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "welcomedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutomationFollowerWelcome_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationFollowerWelcome_userId_platform_platformUserId_key" ON "AutomationFollowerWelcome"("userId", "platform", "platformUserId");

-- CreateIndex
CREATE INDEX "AutomationFollowerWelcome_userId_platform_idx" ON "AutomationFollowerWelcome"("userId", "platform");

-- AddForeignKey
ALTER TABLE "AutomationFollowerWelcome" ADD CONSTRAINT "AutomationFollowerWelcome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
