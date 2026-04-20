-- AlterTable
ALTER TABLE "OTPSession" ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'whatsapp';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "verificationMethod" TEXT;
