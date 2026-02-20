-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'My Bundle Offer',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "headerText" TEXT NOT NULL DEFAULT 'Buy More Save More',
    "hideHeaderLines" BOOLEAN NOT NULL DEFAULT false,
    "applyOn" TEXT NOT NULL DEFAULT 'all',
    "productIds" JSONB NOT NULL DEFAULT '[]',
    "productTitles" JSONB NOT NULL DEFAULT '[]',
    "collectionIds" JSONB NOT NULL DEFAULT '[]',
    "collectionTitles" JSONB NOT NULL DEFAULT '[]',
    "allowVariantMix" BOOLEAN NOT NULL DEFAULT false,
    "hideThemeVariants" BOOLEAN NOT NULL DEFAULT false,
    "volumeDiscount" BOOLEAN NOT NULL DEFAULT false,
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "styling" JSONB NOT NULL DEFAULT '{}',
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "accepts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bundle_shopId_idx" ON "Bundle"("shopId");

-- CreateIndex
CREATE INDEX "Bundle_shopId_status_idx" ON "Bundle"("shopId", "status");

-- CreateIndex
CREATE INDEX "Bundle_priority_idx" ON "Bundle"("priority");

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
