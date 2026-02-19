-- CreateTable
CREATE TABLE "CommentAutomationReply" (
    "id" TEXT NOT NULL,
    "postTargetId" TEXT NOT NULL,
    "platformCommentId" TEXT NOT NULL,
    "repliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentAutomationReply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommentAutomationReply_postTargetId_platformCommentId_key" ON "CommentAutomationReply"("postTargetId", "platformCommentId");

-- CreateIndex
CREATE INDEX "CommentAutomationReply_postTargetId_idx" ON "CommentAutomationReply"("postTargetId");

-- AddForeignKey
ALTER TABLE "CommentAutomationReply" ADD CONSTRAINT "CommentAutomationReply_postTargetId_fkey" FOREIGN KEY ("postTargetId") REFERENCES "PostTarget"("id") ON DELETE CASCADE ON UPDATE CASCADE;
