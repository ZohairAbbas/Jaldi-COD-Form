-- CreateTable
CREATE TABLE "Pixel" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "pixelId" TEXT NOT NULL,
    "accessToken" TEXT,
    "purchaseEvent" TEXT NOT NULL DEFAULT 'Purchase',
    "enableAddToCart" BOOLEAN NOT NULL DEFAULT false,
    "enableAddPaymentInfo" BOOLEAN NOT NULL DEFAULT false,
    "enableInitiateCheckout" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "testEventCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PixelEvent" (
    "id" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responseCode" INTEGER,
    "errorMessage" TEXT,
    "fbclid" TEXT,
    "fbp" TEXT,
    "fbc" TEXT,
    "orderId" TEXT,
    "orderNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PixelEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Pixel_shopId_idx" ON "Pixel"("shopId");

-- CreateIndex
CREATE INDEX "Pixel_shopId_type_enabled_idx" ON "Pixel"("shopId", "type", "enabled");

-- CreateIndex
CREATE INDEX "PixelEvent_pixelId_idx" ON "PixelEvent"("pixelId");

-- CreateIndex
CREATE INDEX "PixelEvent_shopId_idx" ON "PixelEvent"("shopId");

-- CreateIndex
CREATE INDEX "PixelEvent_eventName_idx" ON "PixelEvent"("eventName");

-- CreateIndex
CREATE INDEX "PixelEvent_createdAt_idx" ON "PixelEvent"("createdAt");

-- CreateIndex
CREATE INDEX "PixelEvent_orderId_idx" ON "PixelEvent"("orderId");

-- AddForeignKey
ALTER TABLE "Pixel" ADD CONSTRAINT "Pixel_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PixelEvent" ADD CONSTRAINT "PixelEvent_pixelId_fkey" FOREIGN KEY ("pixelId") REFERENCES "Pixel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
