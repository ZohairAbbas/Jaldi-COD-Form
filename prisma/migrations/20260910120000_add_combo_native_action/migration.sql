-- Native-checkout support for combos: where the customer goes after the combo
-- card adds its products to the Shopify cart.
ALTER TABLE "Bundle" ADD COLUMN "comboNativeAction" TEXT NOT NULL DEFAULT 'stay';
