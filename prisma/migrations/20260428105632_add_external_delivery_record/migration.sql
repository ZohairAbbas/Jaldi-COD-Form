-- CreateTable
CREATE TABLE "ExternalDeliveryRecord" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "sourceApp" TEXT NOT NULL,
    "sourceShopDomain" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "deliveryOutcome" TEXT NOT NULL,
    "orderValue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalDeliveryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalDeliveryRecord_phone_idx" ON "ExternalDeliveryRecord"("phone");

-- CreateIndex
CREATE INDEX "ExternalDeliveryRecord_phone_deliveryOutcome_idx" ON "ExternalDeliveryRecord"("phone", "deliveryOutcome");

-- CreateIndex
CREATE INDEX "ExternalDeliveryRecord_sourceApp_sourceShopDomain_idx" ON "ExternalDeliveryRecord"("sourceApp", "sourceShopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalDeliveryRecord_sourceApp_externalId_key" ON "ExternalDeliveryRecord"("sourceApp", "externalId");
