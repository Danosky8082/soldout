/*
  Warnings:

  - Made the column `description` on table `Video` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "description" SET NOT NULL;
