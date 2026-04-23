-- AlterTable
ALTER TABLE "GlobalBuyer" ADD COLUMN     "cancelledOrdersGlobal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveredOrdersGlobal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastRiskCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "riskScoreGlobal" TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "rtoOrdersGlobal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rtoRateGlobal" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deliveryOutcome" TEXT,
ADD COLUMN     "fulfillmentStatus" TEXT,
ADD COLUMN     "fulfillmentSyncedAt" TIMESTAMP(3),
ADD COLUMN     "riskLevel" TEXT;

-- CreateTable
CREATE TABLE "FulfillmentSyncCursor" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FulfillmentSyncCursor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FulfillmentSyncCursor_shopId_key" ON "FulfillmentSyncCursor"("shopId");

-- CreateIndex
CREATE INDEX "Order_deliveryOutcome_idx" ON "Order"("deliveryOutcome");

-- CreateIndex
CREATE INDEX "Order_phone_idx" ON "Order"("phone");
