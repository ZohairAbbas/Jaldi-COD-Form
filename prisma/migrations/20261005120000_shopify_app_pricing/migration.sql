-- Mantle is gone; the Subscription row now mirrors Shopify directly.
--
-- planId held Mantle plan UUIDs, which mean nothing outside Mantle, so it is
-- replaced by the Shopify App Pricing plan handle rather than renamed. The
-- next sync fills planHandle, shopifySubscriptionId and lastCheckedAt.
-- planName and status are untouched: Merchant360 reads them.

ALTER TABLE "Subscription" DROP COLUMN "mantleCustomerId";
ALTER TABLE "Subscription" DROP COLUMN "usageCharges";
ALTER TABLE "Subscription" DROP COLUMN "planId";

ALTER TABLE "Subscription" ADD COLUMN "planHandle" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "shopifySubscriptionId" TEXT;
ALTER TABLE "Subscription" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
