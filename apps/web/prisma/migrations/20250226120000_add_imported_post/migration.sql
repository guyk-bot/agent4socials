-- CreateTable
CREATE TABLE "ImportedPost" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "content" TEXT,
    "thumbnailUrl" TEXT,
    "permalinkUrl" TEXT,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "mediaType" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportedPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportedPost_socialAccountId_platformPostId_key" ON "ImportedPost"("socialAccountId", "platformPostId");

-- AddForeignKey
ALTER TABLE "ImportedPost" ADD CONSTRAINT "ImportedPost_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
