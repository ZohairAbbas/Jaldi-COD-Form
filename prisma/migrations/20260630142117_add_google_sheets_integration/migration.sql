-- CreateTable
CREATE TABLE "GoogleSheetsIntegration" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "googleEmail" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "spreadsheetId" TEXT,
    "spreadsheetName" TEXT,
    "ordersSheetName" TEXT DEFAULT 'ALL',
    "abandonedSheetName" TEXT,
    "importAbandonedSeparate" BOOLEAN NOT NULL DEFAULT false,
    "orderTypeFilter" TEXT NOT NULL DEFAULT 'normal',
    "oneProductPerLine" BOOLEAN NOT NULL DEFAULT false,
    "columnMapping" JSONB NOT NULL DEFAULT '[]',
    "lastSyncedOrderAt" TIMESTAMP(3),
    "lastSyncedAbandonedAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleSheetsIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleSheetsIntegration_shopId_key" ON "GoogleSheetsIntegration"("shopId");

-- AddForeignKey
ALTER TABLE "GoogleSheetsIntegration" ADD CONSTRAINT "GoogleSheetsIntegration_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
