-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "freeShippingNudgeAmountText" TEXT NOT NULL DEFAULT '🚚 Add {{amount}} more to get free delivery',
ADD COLUMN     "freeShippingNudgeEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "freeShippingNudgeQtyText" TEXT NOT NULL DEFAULT '🚚 Add {{count}} more item(s) to get free delivery',
ADD COLUMN     "freeShippingNudgeSuccessText" TEXT NOT NULL DEFAULT '🎉 You''ve unlocked free delivery!';
