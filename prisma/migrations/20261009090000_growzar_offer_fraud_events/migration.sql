-- CreateTable
CREATE TABLE "OfferEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "offerType" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfferEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FraudEvent" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "rule" TEXT,
    "channel" TEXT,
    "path" TEXT,
    "riskLevel" TEXT,
    "phone" TEXT,
    "sessionId" TEXT,
    "orderId" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OfferEvent_shopId_updatedAt_id_idx" ON "OfferEvent"("shopId", "updatedAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "OfferEvent_offerId_kind_sessionId_key" ON "OfferEvent"("offerId", "kind", "sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "FraudEvent_dedupeKey_key" ON "FraudEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX "FraudEvent_shopId_updatedAt_id_idx" ON "FraudEvent"("shopId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "FraudEvent_shopId_phone_idx" ON "FraudEvent"("shopId", "phone");


-- Tombstones for hard deletes (GDPR customers/redact deletes a buyer's fraud
-- events; shop/redact deletes both tables). Reuses growzar_tombstone() from
-- 20261008150000_growzar_read_api.
CREATE TRIGGER growzar_offer_event_tombstone
  AFTER DELETE ON "OfferEvent"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('offer_event');

CREATE TRIGGER growzar_fraud_event_tombstone
  AFTER DELETE ON "FraudEvent"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('fraud_event');

-- Offers are hard-deleted from the app's Sales Booster screens; /growzar/offers
-- reports them as deletedOfferIds.
CREATE TRIGGER growzar_upsell_tombstone
  AFTER DELETE ON "Upsell"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('offer');

CREATE TRIGGER growzar_downsell_tombstone
  AFTER DELETE ON "Downsell"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('offer');

CREATE TRIGGER growzar_bundle_tombstone
  AFTER DELETE ON "Bundle"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('offer');
