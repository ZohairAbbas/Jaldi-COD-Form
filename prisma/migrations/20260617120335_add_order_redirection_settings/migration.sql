-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "redirectMode" TEXT NOT NULL DEFAULT 'shopify',
ADD COLUMN     "redirectUrl" TEXT,
ADD COLUMN     "redirectWhatsappMessage" TEXT,
ADD COLUMN     "redirectWhatsappNumber" TEXT,
ADD COLUMN     "thankYouMessage" TEXT;
