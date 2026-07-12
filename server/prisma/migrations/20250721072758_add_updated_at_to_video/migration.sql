/*
  Warnings:

  - The values [VIDEO,COMMENT,REPLY] on the enum `LikeType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `replies` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,videoId,type]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,commentId,type]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,replyId,type]` on the table `Like` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,videoId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "LikeType_new" AS ENUM ('LIKE', 'DISLIKE');
ALTER TABLE "Like" ALTER COLUMN "type" TYPE "LikeType_new" USING ("type"::text::"LikeType_new");
ALTER TYPE "LikeType" RENAME TO "LikeType_old";
ALTER TYPE "LikeType_new" RENAME TO "LikeType";
DROP TYPE "LikeType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_commentId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_replyId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_userId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_videoId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_videoId_fkey";

-- DropForeignKey
ALTER TABLE "replies" DROP CONSTRAINT "replies_commentId_fkey";

-- DropForeignKey
ALTER TABLE "replies" DROP CONSTRAINT "replies_userId_fkey";

-- DropForeignKey
ALTER TABLE "replies" DROP CONSTRAINT "replies_videoId_fkey";

-- DropTable
DROP TABLE "replies";

-- CreateTable
CREATE TABLE "Reply" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "commentId" INTEGER NOT NULL,
    "videoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" SERIAL NOT NULL,
    "value" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "videoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trivia" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "videoId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trivia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reply_userId_idx" ON "Reply"("userId");

-- CreateIndex
CREATE INDEX "Reply_commentId_idx" ON "Reply"("commentId");

-- CreateIndex
CREATE INDEX "Reply_videoId_idx" ON "Reply"("videoId");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_userId_videoId_key" ON "Rating"("userId", "videoId");

-- CreateIndex
CREATE INDEX "Trivia_videoId_idx" ON "Trivia"("videoId");

-- CreateIndex
CREATE INDEX "Trivia_userId_idx" ON "Trivia"("userId");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_videoId_idx" ON "Comment"("videoId");

-- CreateIndex
CREATE INDEX "Like_videoId_idx" ON "Like"("videoId");

-- CreateIndex
CREATE INDEX "Like_commentId_idx" ON "Like"("commentId");

-- CreateIndex
CREATE INDEX "Like_replyId_idx" ON "Like"("replyId");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_videoId_type_key" ON "Like"("userId", "videoId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_commentId_type_key" ON "Like"("userId", "commentId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Like_userId_replyId_type_key" ON "Like"("userId", "replyId", "type");

-- CreateIndex
CREATE INDEX "Subscription_videoId_idx" ON "Subscription"("videoId");

-- CreateIndex
CREATE INDEX "Subscription_userId_idx" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_videoId_key" ON "Subscription"("userId", "videoId");

-- CreateIndex
CREATE INDEX "Video_userId_idx" ON "Video"("userId");

-- CreateIndex
CREATE INDEX "Video_genre_idx" ON "Video"("genre");

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "Reply"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trivia" ADD CONSTRAINT "Trivia_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trivia" ADD CONSTRAINT "Trivia_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
