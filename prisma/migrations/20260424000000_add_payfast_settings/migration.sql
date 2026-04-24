-- AlterTable: Add PayFast payment gateway configuration fields to Settings
ALTER TABLE "Settings"
  ADD COLUMN "payfastEnabled"         BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "payfastMerchantId"      TEXT,
  ADD COLUMN "payfastSecuredKey"      TEXT,
  ADD COLUMN "payfastButtonText"      TEXT NOT NULL DEFAULT 'PAY WITH PAYFAST',
  ADD COLUMN "payfastButtonBgColor"   TEXT NOT NULL DEFAULT '#00B140',
  ADD COLUMN "payfastButtonTextColor" TEXT NOT NULL DEFAULT '#FFFFFF',
  ADD COLUMN "payfastButtonFontSize"  INTEGER NOT NULL DEFAULT 14;
