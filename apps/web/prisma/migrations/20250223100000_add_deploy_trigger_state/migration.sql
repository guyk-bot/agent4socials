-- CreateTable
CREATE TABLE "DeployTriggerState" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lastCommitSha" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeployTriggerState_pkey" PRIMARY KEY ("id")
);
