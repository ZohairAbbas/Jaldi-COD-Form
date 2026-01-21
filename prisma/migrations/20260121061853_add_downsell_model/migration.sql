-- CreateTable
CREATE TABLE "Downsell" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'New downsell',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "showCount" INTEGER NOT NULL DEFAULT 1,
    "disableOtherDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "discountType" TEXT NOT NULL DEFAULT 'percentage',
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "title" TEXT NOT NULL DEFAULT 'Wait!',
    "titleColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "titleFontSize" INTEGER NOT NULL DEFAULT 13,
    "subtitle" TEXT NOT NULL DEFAULT 'We have an offer for you!',
    "subtitleColor" TEXT NOT NULL DEFAULT 'rgba(45,45,45,1)',
    "subtitleFontSize" INTEGER NOT NULL DEFAULT 13,
    "plaqueText" TEXT NOT NULL DEFAULT 'GET AN EXTRA DISCOUNT ON YOUR ORDER:',
    "plaqueTextColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "plaqueBackgroundColor" TEXT NOT NULL DEFAULT 'linear-gradient(90deg, #ff6b6b, #ee5a5a)',
    "plaqueDiscountColor" TEXT NOT NULL DEFAULT 'rgba(255,255,255,1)',
    "plaqueSize" INTEGER NOT NULL DEFAULT 50,
    "ctaText" TEXT NOT NULL DEFAULT 'Do you want to complete your order?',
    "ctaTextColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "acceptButtonText" TEXT NOT NULL DEFAULT 'COMPLETE ORDER WITH {discount} OFF',
    "acceptButtonAnimation" TEXT NOT NULL DEFAULT 'none',
    "acceptButtonIcon" TEXT NOT NULL DEFAULT 'none',
    "acceptButtonBgColor" TEXT NOT NULL DEFAULT 'linear-gradient(90deg, #ff6b6b, #ee5a5a)',
    "acceptButtonTextColor" TEXT NOT NULL DEFAULT 'rgba(255,255,255,1)',
    "acceptButtonFontSize" INTEGER NOT NULL DEFAULT 14,
    "acceptButtonRadius" INTEGER NOT NULL DEFAULT 8,
    "acceptButtonBorderWidth" INTEGER NOT NULL DEFAULT 0,
    "acceptButtonBorderColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "acceptButtonShadow" INTEGER NOT NULL DEFAULT 4,
    "declineButtonText" TEXT NOT NULL DEFAULT 'No thank you',
    "declineButtonBgColor" TEXT NOT NULL DEFAULT 'rgba(255,255,255,1)',
    "declineButtonTextColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "declineButtonFontSize" INTEGER NOT NULL DEFAULT 14,
    "declineButtonRadius" INTEGER NOT NULL DEFAULT 25,
    "declineButtonBorderWidth" INTEGER NOT NULL DEFAULT 1,
    "declineButtonBorderColor" TEXT NOT NULL DEFAULT 'rgba(0,0,0,1)',
    "declineButtonShadow" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "accepts" INTEGER NOT NULL DEFAULT 0,
    "declines" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Downsell_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Downsell_shopId_idx" ON "Downsell"("shopId");

-- CreateIndex
CREATE INDEX "Downsell_shopId_enabled_idx" ON "Downsell"("shopId", "enabled");

-- CreateIndex
CREATE INDEX "Downsell_priority_idx" ON "Downsell"("priority");

-- AddForeignKey
ALTER TABLE "Downsell" ADD CONSTRAINT "Downsell_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
