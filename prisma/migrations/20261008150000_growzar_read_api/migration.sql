-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discounts" JSONB;

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "growzarSeenAt" TIMESTAMP(3),
ADD COLUMN     "growzarStoppedAt" TIMESTAMP(3),
ADD COLUMN     "shopCurrency" TEXT,
ADD COLUMN     "shopCountryCode" TEXT,
ADD COLUMN     "shopFactsSyncedAt" TIMESTAMP(3),
ADD COLUMN     "shopTimezone" TEXT;

-- CreateTable
CREATE TABLE "SettingsChange" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "from" TEXT,
    "to" TEXT,
    "source" TEXT NOT NULL DEFAULT 'trigger',
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SettingsChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowzarTombstone" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowzarTombstone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SettingsChange_shopId_changedAt_id_idx" ON "SettingsChange"("shopId", "changedAt", "id");

-- CreateIndex
CREATE INDEX "GrowzarTombstone_shopId_entity_deletedAt_idx" ON "GrowzarTombstone"("shopId", "entity", "deletedAt");

-- CreateIndex
CREATE INDEX "AbandonedCart_shopId_updatedAt_id_idx" ON "AbandonedCart"("shopId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Order_shopId_updatedAt_id_idx" ON "Order"("shopId", "updatedAt", "id");


-- ---------------------------------------------------------------------------
-- Growzar read API (growzar-kb phase-g5/preventify.md). Everything below is
-- additive: triggers and their functions, plus a one-off baseline insert.
-- ---------------------------------------------------------------------------

-- 1. Keep "updatedAt" still when nothing a feed returns has changed.
--
-- The fulfillment sync writes "fulfillmentSyncedAt" (and the outcome, which no
-- feed returns) on every checked order every 3 hours; the draft-order retry
-- cron rewrites "lastError" on abandoned carts. Prisma's @updatedAt moves the
-- timestamp on all of those, which would make the feeds re-send every row. A
-- trigger covers every writer, including future ones, without touching each.
-- A deliberate touch (moving "updatedAt" on purpose, e.g. a backfill) runs with
-- the transaction-local setting growzar.touch = 'on', which skips the guard.
CREATE OR REPLACE FUNCTION growzar_order_keep_updated_at() RETURNS trigger AS $$
BEGIN
  IF current_setting('growzar.touch', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW."shopId", NEW."shopifyOrderId", NEW."shopifyOrderNumber", NEW."createdAt",
      NEW."status", NEW."paymentMethod", NEW."verificationMethod", NEW."riskLevel",
      NEW."subtotal", NEW."shipping", NEW."total", NEW."items", NEW."discounts",
      NEW."phone", NEW."city", NEW."province", NEW."country")
     IS NOT DISTINCT FROM
     (OLD."shopId", OLD."shopifyOrderId", OLD."shopifyOrderNumber", OLD."createdAt",
      OLD."status", OLD."paymentMethod", OLD."verificationMethod", OLD."riskLevel",
      OLD."subtotal", OLD."shipping", OLD."total", OLD."items", OLD."discounts",
      OLD."phone", OLD."city", OLD."province", OLD."country") THEN
    NEW."updatedAt" := OLD."updatedAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER growzar_order_keep_updated_at
  BEFORE UPDATE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION growzar_order_keep_updated_at();

CREATE OR REPLACE FUNCTION growzar_abandoned_cart_keep_updated_at() RETURNS trigger AS $$
BEGIN
  IF current_setting('growzar.touch', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF (NEW."shopId", NEW."sessionId", NEW."abandonedAt", NEW."totalAmount", NEW."cartItems",
      NEW."customerPhone", COALESCE(NEW."customerEmail", '') = '',
      NEW."recovered", NEW."recoveredAt", NEW."recoveredOrderId", NEW."retryCount")
     IS NOT DISTINCT FROM
     (OLD."shopId", OLD."sessionId", OLD."abandonedAt", OLD."totalAmount", OLD."cartItems",
      OLD."customerPhone", COALESCE(OLD."customerEmail", '') = '',
      OLD."recovered", OLD."recoveredAt", OLD."recoveredOrderId", OLD."retryCount") THEN
    NEW."updatedAt" := OLD."updatedAt";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER growzar_abandoned_cart_keep_updated_at
  BEFORE UPDATE ON "AbandonedCart"
  FOR EACH ROW EXECUTE FUNCTION growzar_abandoned_cart_keep_updated_at();

-- 2. Tombstones for hard deletes (GDPR customers/redact, shop/redact).
CREATE OR REPLACE FUNCTION growzar_tombstone() RETURNS trigger AS $$
BEGIN
  INSERT INTO "GrowzarTombstone" ("id", "shopId", "entity", "entityId", "deletedAt")
  VALUES (gen_random_uuid()::text, OLD."shopId", TG_ARGV[0], OLD."id", clock_timestamp());
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER growzar_order_tombstone
  AFTER DELETE ON "Order"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('order');

CREATE TRIGGER growzar_abandoned_cart_tombstone
  AFTER DELETE ON "AbandonedCart"
  FOR EACH ROW EXECUTE FUNCTION growzar_tombstone('abandoned_cart');

-- 3. Verification-settings history. The field names are the feed's names, not
-- the column names. Every value is stored as text ('true', '10', ...).
CREATE OR REPLACE FUNCTION growzar_settings_history() RETURNS trigger AS $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT * FROM (VALUES
      ('otpEnabled',               CASE WHEN TG_OP = 'UPDATE' THEN OLD."enableOTP"::text END,                NEW."enableOTP"::text),
      ('userBlockingEnabled',      CASE WHEN TG_OP = 'UPDATE' THEN OLD."enableUserBlocking"::text END,       NEW."enableUserBlocking"::text),
      ('blockHighQuantityEnabled', CASE WHEN TG_OP = 'UPDATE' THEN OLD."blockHighQuantityEnabled"::text END, NEW."blockHighQuantityEnabled"::text),
      ('maxQuantityPerOrder',      CASE WHEN TG_OP = 'UPDATE' THEN OLD."maxQuantityPerOrder"::text END,      NEW."maxQuantityPerOrder"::text),
      ('limitOrdersEnabled',       CASE WHEN TG_OP = 'UPDATE' THEN OLD."limitOrdersEnabled"::text END,       NEW."limitOrdersEnabled"::text),
      ('limitOrdersWindowMinutes', CASE WHEN TG_OP = 'UPDATE' THEN OLD."limitOrdersWindowMinutes"::text END, NEW."limitOrdersWindowMinutes"::text),
      ('riskTagsEnabled',          CASE WHEN TG_OP = 'UPDATE' THEN OLD."enableRiskTags"::text END,           NEW."enableRiskTags"::text),
      ('verificationTagsEnabled',  CASE WHEN TG_OP = 'UPDATE' THEN OLD."enableVerificationTags"::text END,   NEW."enableVerificationTags"::text)
    ) AS t(field, old_value, new_value)
  LOOP
    IF TG_OP = 'INSERT' OR f.old_value IS DISTINCT FROM f.new_value THEN
      INSERT INTO "SettingsChange" ("id", "shopId", "field", "from", "to", "source", "changedAt")
      VALUES (gen_random_uuid()::text, NEW."shopId", f.field, f.old_value, f.new_value,
              CASE WHEN TG_OP = 'INSERT' THEN 'baseline' ELSE 'trigger' END, clock_timestamp());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER growzar_settings_history
  AFTER INSERT OR UPDATE ON "Settings"
  FOR EACH ROW EXECUTE FUNCTION growzar_settings_history();

-- 4. Baseline: one row per field for every existing shop, so history starts
-- at deploy with the values in force then.
INSERT INTO "SettingsChange" ("id", "shopId", "field", "from", "to", "source", "changedAt")
SELECT gen_random_uuid()::text, s."shopId", t.field, NULL, t.value, 'baseline', clock_timestamp()
FROM "Settings" s
CROSS JOIN LATERAL (VALUES
  ('otpEnabled',               s."enableOTP"::text),
  ('userBlockingEnabled',      s."enableUserBlocking"::text),
  ('blockHighQuantityEnabled', s."blockHighQuantityEnabled"::text),
  ('maxQuantityPerOrder',      s."maxQuantityPerOrder"::text),
  ('limitOrdersEnabled',       s."limitOrdersEnabled"::text),
  ('limitOrdersWindowMinutes', s."limitOrdersWindowMinutes"::text),
  ('riskTagsEnabled',          s."enableRiskTags"::text),
  ('verificationTagsEnabled',  s."enableVerificationTags"::text)
) AS t(field, value);
