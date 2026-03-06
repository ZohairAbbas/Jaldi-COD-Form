-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "cardDiscountEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cardDiscountType" TEXT NOT NULL DEFAULT 'percentage',
ADD COLUMN     "cardDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
