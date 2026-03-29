-- CreateTable
CREATE TABLE "BrandContext" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetAudience" TEXT,
    "toneOfVoice" TEXT,
    "toneExamples" TEXT,
    "productDescription" TEXT,
    "additionalContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BrandContext_userId_key" ON "BrandContext"("userId");

-- AddForeignKey
ALTER TABLE "BrandContext" ADD CONSTRAINT "BrandContext_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
