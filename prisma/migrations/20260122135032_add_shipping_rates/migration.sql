-- CreateTable
CREATE TABLE "ShippingRate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Standard Shipping',
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "shopifyShippingRateId" TEXT,
    "isShopifyImported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShippingRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShippingRate_shopId_idx" ON "ShippingRate"("shopId");

-- CreateIndex
CREATE INDEX "ShippingRate_shopId_enabled_idx" ON "ShippingRate"("shopId", "enabled");

-- CreateIndex
CREATE INDEX "ShippingRate_priority_idx" ON "ShippingRate"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "ShippingRate_shopId_shopifyShippingRateId_key" ON "ShippingRate"("shopId", "shopifyShippingRateId");

-- AddForeignKey
ALTER TABLE "ShippingRate" ADD CONSTRAINT "ShippingRate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
