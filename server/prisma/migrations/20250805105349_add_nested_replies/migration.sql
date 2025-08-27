-- AlterTable
ALTER TABLE "Reply" ADD COLUMN     "parentReplyId" INTEGER;

-- CreateIndex
CREATE INDEX "Reply_parentReplyId_idx" ON "Reply"("parentReplyId");

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_parentReplyId_fkey" FOREIGN KEY ("parentReplyId") REFERENCES "Reply"("id") ON DELETE SET NULL ON UPDATE CASCADE;
