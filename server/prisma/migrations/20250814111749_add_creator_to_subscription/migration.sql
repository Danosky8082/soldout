/*
  Warnings:

  - You are about to drop the column `subscriberCount` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,creatorId]` on the table `Subscription` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `Subscription` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_creatorId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_userId_fkey";

-- DropForeignKey
ALTER TABLE "Subscription" DROP CONSTRAINT "Subscription_videoId_fkey";

-- DropIndex
DROP INDEX "Subscription_userId_videoId_key";

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "videoId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "subscriberCount";

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_creatorId_key" ON "Subscription"("userId", "creatorId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
