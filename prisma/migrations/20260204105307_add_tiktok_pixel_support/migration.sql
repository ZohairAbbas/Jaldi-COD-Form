-- AlterTable
ALTER TABLE "Pixel" ADD COLUMN     "enableCompletePayment" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enablePlaceAnOrder" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableTikTokInitiateCheckout" BOOLEAN NOT NULL DEFAULT true;
