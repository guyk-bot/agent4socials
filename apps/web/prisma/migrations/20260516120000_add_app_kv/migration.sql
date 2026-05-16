-- CreateTable
CREATE TABLE "app_kv" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_kv_pkey" PRIMARY KEY ("key")
);
