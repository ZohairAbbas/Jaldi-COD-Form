import { describe, test, expect } from "vitest";
import { buildBundleFunctionConfig } from "./bundle-function.server";

/**
 * What reaches the native-checkout Discount Function.
 *
 * Quantity breaks and combos share the Bundle table, so the danger here is
 * cross-contamination: a combo leaking in as a tier-less quantity bundle, or a
 * combo's component products being read as quantity-break targets.
 */
describe("buildBundleFunctionConfig", () => {
  const quantityBundle = {
    bundleType: "quantity",
    applyOn: "specific",
    productIds: ["gid://shopify/Product/1"],
    tiers: [{ quantity: 3, discountType: "percentage", discountValue: 30 }],
  };

  const comboOffer = {
    id: "combo-1",
    name: "Winter Combo",
    bundleType: "combo",
    applyOn: "specific",
    // Component products are mirrored into productIds by the combo save action;
    // they must NOT be read as quantity-break targets.
    productIds: ["gid://shopify/Product/A", "gid://shopify/Product/B"],
    tiers: [],
    comboItems: [
      { productId: "gid://shopify/Product/A", handle: "a", title: "A", quantity: 2 },
      { productId: "gid://shopify/Product/B", handle: "b", title: "B", quantity: 1 },
    ],
    comboDiscountType: "percentage",
    comboDiscountValue: 15,
  };

  test("splits the shared table into tiers and combos", () => {
    const config = buildBundleFunctionConfig({ bundles: [quantityBundle, comboOffer] });

    expect(config.bundles).toHaveLength(1);
    expect(config.bundles[0].tiers[0].quantity).toBe(3);

    expect(config.combos).toEqual([
      {
        id: "combo-1",
        name: "Winter Combo",
        items: [
          { productId: "gid://shopify/Product/A", quantity: 2 },
          { productId: "gid://shopify/Product/B", quantity: 1 },
        ],
        discountType: "percentage",
        discountValue: 15,
      },
    ]);
  });

  test("a combo never appears among the quantity bundles", () => {
    const config = buildBundleFunctionConfig({ bundles: [comboOffer] });
    expect(config.bundles).toEqual([]);
    expect(config.combos).toHaveLength(1);
  });

  test("rows with no bundleType are treated as quantity breaks", () => {
    // Every row written before combos existed predates the column.
    const legacy = { ...quantityBundle };
    delete legacy.bundleType;
    const config = buildBundleFunctionConfig({ bundles: [legacy] });
    expect(config.bundles).toHaveLength(1);
    expect(config.combos).toEqual([]);
  });

  test("JSON columns that arrive as strings are parsed", () => {
    const config = buildBundleFunctionConfig({
      bundles: [{ ...comboOffer, comboItems: JSON.stringify(comboOffer.comboItems) }],
    });
    expect(config.combos[0].items).toHaveLength(2);
  });

  test("a malformed comboItems column drops the offer instead of throwing", () => {
    const config = buildBundleFunctionConfig({
      bundles: [{ ...comboOffer, comboItems: "{ not json" }],
    });
    expect(config.combos).toEqual([]);
  });

  test("a combo with fewer than two components is dropped", () => {
    const config = buildBundleFunctionConfig({
      bundles: [{ ...comboOffer, comboItems: [comboOffer.comboItems[0]] }],
    });
    expect(config.combos).toEqual([]);
  });

  test("component quantities are coerced to a sane minimum", () => {
    const config = buildBundleFunctionConfig({
      bundles: [
        {
          ...comboOffer,
          comboItems: [
            { productId: "gid://shopify/Product/A", quantity: 0 },
            { productId: "gid://shopify/Product/B", quantity: "2" },
          ],
        },
      ],
    });
    expect(config.combos[0].items).toEqual([
      { productId: "gid://shopify/Product/A", quantity: 1 },
      { productId: "gid://shopify/Product/B", quantity: 2 },
    ]);
  });

  test("an empty shop produces an empty config rather than undefined arrays", () => {
    expect(buildBundleFunctionConfig({})).toEqual({ bundles: [], combos: [] });
  });
});
