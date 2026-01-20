/*
  Warnings:

  - You are about to drop the column `buttonPosition` on the `Settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "buttonPosition";

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "country" TEXT NOT NULL DEFAULT 'PAK';
