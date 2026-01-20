-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "hideAddToCartButton" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideBuyNowButton" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hideCheckoutButton" BOOLEAN NOT NULL DEFAULT false;
