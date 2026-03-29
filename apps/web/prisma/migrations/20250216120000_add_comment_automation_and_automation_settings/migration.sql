-- AlterTable
ALTER TABLE "Post" ADD COLUMN "commentAutomation" JSONB;

-- CreateTable
CREATE TABLE "AutomationSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dmWelcomeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dmWelcomeMessage" TEXT,
    "dmNewFollowerEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dmNewFollowerMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AutomationSettings_userId_key" ON "AutomationSettings"("userId");

-- AddForeignKey
ALTER TABLE "AutomationSettings" ADD CONSTRAINT "AutomationSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
