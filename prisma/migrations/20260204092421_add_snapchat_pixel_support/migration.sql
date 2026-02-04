-- AlterTable
ALTER TABLE "Pixel" ADD COLUMN     "enablePurchase" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableStartCheckout" BOOLEAN NOT NULL DEFAULT true;
