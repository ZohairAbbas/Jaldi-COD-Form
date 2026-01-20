/*
  Warnings:

  - You are about to drop the column `enableEmbedded` on the `Settings` table. All the data in the column will be lost.
  - You are about to drop the column `enablePopup` on the `Settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "enableEmbedded",
DROP COLUMN "enablePopup",
ALTER COLUMN "buttonPageVisibility" SET DEFAULT 'both';
