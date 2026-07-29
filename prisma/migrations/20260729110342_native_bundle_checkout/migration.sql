-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "nativeBundleCheckout" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "bundleDiscountId" TEXT;
