-- CreateTable
CREATE TABLE "user_product_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_product_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_product_events_userId_createdAt_idx" ON "user_product_events"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "user_product_events_userId_event_idx" ON "user_product_events"("userId", "event");

-- AddForeignKey
ALTER TABLE "user_product_events" ADD CONSTRAINT "user_product_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
