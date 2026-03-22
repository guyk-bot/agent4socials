-- Normalized Facebook cache tables (profile, conversations, reviews). ImportedPost + AccountMetricSnapshot remain facebook_posts / facebook_page_metrics.

CREATE TABLE "facebook_pages" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "profileJson" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_pages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_pages_socialAccountId_key" ON "facebook_pages"("socialAccountId");

CREATE TABLE "facebook_conversations" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "platformConversationId" TEXT NOT NULL,
    "link" TEXT,
    "updatedTime" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_conversations_socialAccountId_platformConversationId_key" ON "facebook_conversations"("socialAccountId", "platformConversationId");
CREATE INDEX "facebook_conversations_socialAccountId_updatedTime_idx" ON "facebook_conversations"("socialAccountId", "updatedTime");

CREATE TABLE "facebook_reviews" (
    "id" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
    "recommendationType" TEXT,
    "reviewText" TEXT,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_reviews_socialAccountId_contentHash_key" ON "facebook_reviews"("socialAccountId", "contentHash");
CREATE INDEX "facebook_reviews_socialAccountId_sourceCreatedAt_idx" ON "facebook_reviews"("socialAccountId", "sourceCreatedAt");

ALTER TABLE "facebook_pages" ADD CONSTRAINT "facebook_pages_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facebook_conversations" ADD CONSTRAINT "facebook_conversations_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facebook_reviews" ADD CONSTRAINT "facebook_reviews_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
