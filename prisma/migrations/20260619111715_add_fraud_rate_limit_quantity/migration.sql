-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "blockHighQuantityEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limitOrdersEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "limitOrdersWindowMinutes" INTEGER NOT NULL DEFAULT 1440,
ADD COLUMN     "maxQuantityPerOrder" INTEGER NOT NULL DEFAULT 10;
