/*
  Warnings:

  - You are about to drop the `UpsellConfig` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "UpsellConfig" DROP CONSTRAINT "UpsellConfig_shopId_fkey";

-- DropTable
DROP TABLE "UpsellConfig";

-- CreateTable
CREATE TABLE "Upsell" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Upsell',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "upsellType" TEXT NOT NULL DEFAULT 'pre-purchase',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "productId" TEXT,
    "productTitle" TEXT,
    "productImage" TEXT,
    "productPrice" DOUBLE PRECISION,
    "variantId" TEXT,
    "discountType" TEXT NOT NULL DEFAULT 'none',
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "modalTitle" TEXT NOT NULL DEFAULT 'Add {product_name} to your order!',
    "acceptButtonText" TEXT NOT NULL DEFAULT 'Add to my order',
    "declineButtonText" TEXT NOT NULL DEFAULT 'No thank you, complete my order',
    "acceptButtonBgColor" TEXT NOT NULL DEFAULT '#000000',
    "acceptButtonTextColor" TEXT NOT NULL DEFAULT '#ffffff',
    "declineButtonBgColor" TEXT NOT NULL DEFAULT '#ffffff',
    "declineButtonTextColor" TEXT NOT NULL DEFAULT '#000000',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "accepts" INTEGER NOT NULL DEFAULT 0,
    "declines" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Upsell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Upsell_shopId_idx" ON "Upsell"("shopId");

-- CreateIndex
CREATE INDEX "Upsell_shopId_upsellType_enabled_idx" ON "Upsell"("shopId", "upsellType", "enabled");

-- CreateIndex
CREATE INDEX "Upsell_priority_idx" ON "Upsell"("priority");

-- AddForeignKey
ALTER TABLE "Upsell" ADD CONSTRAINT "Upsell_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
