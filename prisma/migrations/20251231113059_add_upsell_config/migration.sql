-- CreateTable
CREATE TABLE "UpsellConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
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

    CONSTRAINT "UpsellConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UpsellConfig_shopId_key" ON "UpsellConfig"("shopId");

-- AddForeignKey
ALTER TABLE "UpsellConfig" ADD CONSTRAINT "UpsellConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
