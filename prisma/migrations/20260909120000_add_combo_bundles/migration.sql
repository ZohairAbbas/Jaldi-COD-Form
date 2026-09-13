-- Combo bundles: 2-3 different products sold together at a discount.
-- Shares the Bundle table with quantity breaks, discriminated by "bundleType".
-- Existing rows are all quantity breaks, which the column default covers.
ALTER TABLE "Bundle" ADD COLUMN "bundleType" TEXT NOT NULL DEFAULT 'quantity';
ALTER TABLE "Bundle" ADD COLUMN "comboItems" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Bundle" ADD COLUMN "comboTargetProductIds" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "Bundle" ADD COLUMN "comboDiscountType" TEXT NOT NULL DEFAULT 'percentage';
ALTER TABLE "Bundle" ADD COLUMN "comboDiscountValue" DOUBLE PRECISION NOT NULL DEFAULT 10;
ALTER TABLE "Bundle" ADD COLUMN "comboHighlightTag" TEXT NOT NULL DEFAULT 'Combo';
ALTER TABLE "Bundle" ADD COLUMN "showComboHighlightTag" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Bundle" ADD COLUMN "comboFooterText" TEXT NOT NULL DEFAULT 'Buy all at:';
ALTER TABLE "Bundle" ADD COLUMN "comboCtaText" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Bundle" ADD COLUMN "showComboCompareAt" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Bundle_shopId_bundleType_status_idx" ON "Bundle"("shopId", "bundleType", "status");
