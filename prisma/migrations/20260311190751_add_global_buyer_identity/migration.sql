-- CreateTable
CREATE TABLE "GlobalBuyer" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "whatsappVerified" BOOLEAN NOT NULL DEFAULT false,
    "totalOrdersGlobal" INTEGER NOT NULL DEFAULT 0,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalBuyer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuyerAddress" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Home',
    "address" TEXT NOT NULL,
    "address2" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'Pakistan',
    "countryCode" TEXT NOT NULL DEFAULT 'PAK',
    "isDefault" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuyerAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopBuyerProfile" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "completedOrders" INTEGER NOT NULL DEFAULT 0,
    "rtoOrders" INTEGER NOT NULL DEFAULT 0,
    "rtoRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskScore" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
    "firstOrderAt" TIMESTAMP(3),
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopBuyerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GlobalBuyer_phone_key" ON "GlobalBuyer"("phone");

-- CreateIndex
CREATE INDEX "GlobalBuyer_phone_idx" ON "GlobalBuyer"("phone");

-- CreateIndex
CREATE INDEX "BuyerAddress_buyerId_idx" ON "BuyerAddress"("buyerId");

-- CreateIndex
CREATE INDEX "BuyerAddress_buyerId_lastUsedAt_idx" ON "BuyerAddress"("buyerId", "lastUsedAt");

-- CreateIndex
CREATE INDEX "ShopBuyerProfile_shopId_idx" ON "ShopBuyerProfile"("shopId");

-- CreateIndex
CREATE INDEX "ShopBuyerProfile_buyerId_idx" ON "ShopBuyerProfile"("buyerId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopBuyerProfile_shopId_buyerId_key" ON "ShopBuyerProfile"("shopId", "buyerId");

-- AddForeignKey
ALTER TABLE "BuyerAddress" ADD CONSTRAINT "BuyerAddress_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "GlobalBuyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopBuyerProfile" ADD CONSTRAINT "ShopBuyerProfile_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "GlobalBuyer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
