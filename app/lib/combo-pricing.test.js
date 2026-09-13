import { describe, test, expect } from "vitest";
import {
  calculateComboPricing,
  buildComboCartItems,
  validateCombo,
  round2,
} from "./combo-pricing";
import { resolveCombo, matchCombosForProduct, variantHasStock } from "../storefront/combo-resolver";

const sum = (nums) => round2(nums.reduce((a, b) => a + b, 0));

describe("calculateComboPricing", () => {
  test("no discount leaves every line at full price", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 100, quantity: 2 }, { unitPrice: 50, quantity: 1 }],
      "none",
      0,
    );
    expect(r.total).toBe(250);
    expect(r.hasDiscount).toBe(false);
  });

  test("per-unit flat takes the amount off EVERY unit", () => {
    // The reference behaviour, verified against Pumper Bundles:
    // 1x699.95 + 1x729.95 at 10 off each unit = 689.95 + 719.95
    const single = calculateComboPricing(
      [{ unitPrice: 699.95, quantity: 1 }, { unitPrice: 729.95, quantity: 1 }],
      "perUnitFlat",
      10,
    );
    expect(single.lines.map((l) => l.discountedPrice)).toEqual([689.95, 719.95]);
    expect(single.total).toBe(1409.9);

    // Raising the first line to quantity 2 doubles its discount: 1399.90 - 20.
    const double = calculateComboPricing(
      [{ unitPrice: 699.95, quantity: 2 }, { unitPrice: 729.95, quantity: 1 }],
      "perUnitFlat",
      10,
    );
    expect(double.lines.map((l) => l.discountedPrice)).toEqual([1379.9, 719.95]);
    expect(double.total).toBe(2099.85);
  });

  test("percentage discounts each line independently and the total is their sum", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 729.95, quantity: 1 }, { unitPrice: 629.95, quantity: 1 }],
      "percentage",
      10,
    );
    expect(r.total).toBe(sum(r.lines.map((l) => l.discountedPrice)));
    expect(r.totalDiscount).toBe(round2(r.fullTotal - r.total));
  });

  test("a flat bundle discount splits proportionally and sums back exactly", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 19.99, quantity: 3 }, { unitPrice: 5.01, quantity: 2 }],
      "flat",
      7.77,
    );
    expect(sum(r.lines.map((l) => l.discount))).toBe(7.77);
    expect(r.total).toBe(round2(r.fullTotal - 7.77));
  });

  test("a flat discount never pushes a cheap line below zero", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 10, quantity: 1 }, { unitPrice: 990, quantity: 1 }],
      "flat",
      100,
    );
    expect(r.lines.every((l) => l.discountedPrice >= 0)).toBe(true);
    expect(sum(r.lines.map((l) => l.discount))).toBe(100);
  });

  test("a flat discount larger than the bundle clamps at free rather than going negative", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 10, quantity: 1 }, { unitPrice: 20, quantity: 1 }],
      "flat",
      1000,
    );
    expect(r.total).toBe(0);
    expect(r.lines.every((l) => l.discountedPrice === 0)).toBe(true);
  });

  test("the flat split is stable when the merchant reorders the products", () => {
    const a = calculateComboPricing(
      [{ unitPrice: 100, quantity: 1 }, { unitPrice: 33.33, quantity: 1 }],
      "flat",
      50,
    );
    const b = calculateComboPricing(
      [{ unitPrice: 33.33, quantity: 1 }, { unitPrice: 100, quantity: 1 }],
      "flat",
      50,
    );
    expect(a.total).toBe(b.total);
    expect(a.lines[0].discount).toBe(b.lines[1].discount);
  });

  test("compare-at falls back per line and is only shown when it beats the price", () => {
    const mixed = calculateComboPricing(
      [{ unitPrice: 100, quantity: 1, compareAtPrice: 150 }, { unitPrice: 50, quantity: 1 }],
      "percentage",
      10,
    );
    // 150 (marked down) + 50 (its own price, no compare-at set)
    expect(mixed.compareAtTotal).toBe(200);
    expect(mixed.showCompareAt).toBe(true);

    const noSaving = calculateComboPricing(
      [{ unitPrice: 100, quantity: 1 }, { unitPrice: 50, quantity: 1 }],
      "none",
      0,
    );
    expect(noSaving.showCompareAt).toBe(false);
  });

  test("a compare-at below the selling price is ignored rather than inverting the saving", () => {
    const r = calculateComboPricing(
      [{ unitPrice: 100, quantity: 1, compareAtPrice: 80 }],
      "none",
      0,
    );
    expect(r.compareAtTotal).toBe(100);
    expect(r.showCompareAt).toBe(false);
  });
});

describe("buildComboCartItems", () => {
  const combo = { id: "c1", name: "Winter Combo" };
  const resolved = [
    { productId: "gid://shopify/Product/1", numericProductId: "1", variantId: 11, title: "A", variantTitle: "Red", image: null },
    { productId: "gid://shopify/Product/2", numericProductId: "2", variantId: 22, title: "B", variantTitle: "Default Title", image: null },
  ];

  test("discounted lines carry line TOTALS and the bundle flag", () => {
    const pricing = calculateComboPricing(
      [{ unitPrice: 100, quantity: 2 }, { unitPrice: 50, quantity: 1 }],
      "percentage",
      10,
    );
    const items = buildComboCartItems(combo, resolved, pricing);

    expect(items[0].price).toBe(180); // 2 x 100, less 10%
    expect(items[0].originalPrice).toBe(200);
    expect(items[0].hasBundleDiscount).toBe(true);
    expect(items[0].bundleGroupId).toBe("combo-c1");
    expect(items[0].comboName).toBe("Winter Combo");
    // A real variant name is kept; Shopify's placeholder is dropped.
    expect(items[0].variant).toBe("Red");
    expect(items[1].variant).toBeNull();
  });

  test("an undiscounted combo carries PER-UNIT prices so the form can multiply", () => {
    const pricing = calculateComboPricing(
      [{ unitPrice: 100, quantity: 2 }, { unitPrice: 50, quantity: 1 }],
      "none",
      0,
    );
    const items = buildComboCartItems(combo, resolved, pricing);

    // Not flagged as a bundle line, so CODForm does price x quantity — passing
    // the 200 line total here would bill 400.
    expect(items[0].hasBundleDiscount).toBe(false);
    expect(items[0].price).toBe(100);
    expect(items[0].originalPrice).toBeUndefined();
  });

  test("currency conversion is applied to the display prices only", () => {
    const pricing = calculateComboPricing([{ unitPrice: 100, quantity: 1 }, { unitPrice: 50, quantity: 1 }], "percentage", 10);
    const items = buildComboCartItems(combo, resolved, pricing, {
      exchangeRate: 2,
      currencySymbol: "$",
      currencyCode: "USD",
    });
    expect(items[0].price).toBe(90);
    expect(items[0].displayPrice).toBe(180);
    expect(items[0].displayCurrencyCode).toBe("USD");
  });
});

describe("validateCombo", () => {
  const valid = {
    comboItems: [
      { productId: "gid://shopify/Product/1", handle: "a", title: "A", quantity: 1 },
      { productId: "gid://shopify/Product/2", handle: "b", title: "B", quantity: 2 },
    ],
    comboTargetProductIds: ["gid://shopify/Product/1"],
    comboDiscountType: "percentage",
    comboDiscountValue: 10,
  };

  test("accepts a well-formed combo", () => {
    expect(validateCombo(valid)).toEqual([]);
  });

  test("requires at least two products", () => {
    expect(validateCombo({ ...valid, comboItems: [valid.comboItems[0]] })).toContain(
      "Select at least 2 products.",
    );
  });

  test("rejects more than three products", () => {
    const four = Array.from({ length: 4 }, (_, i) => ({
      productId: `gid://shopify/Product/${i}`, handle: `h${i}`, title: `P${i}`, quantity: 1,
    }));
    expect(validateCombo({ ...valid, comboItems: four })).toContain(
      "A combo can have at most 3 products.",
    );
  });

  test("rejects the same product twice", () => {
    expect(validateCombo({ ...valid, comboItems: [valid.comboItems[0], valid.comboItems[0]] }))
      .toContain("The same product can only be added once.");
  });

  test("requires a target product page still in the combo", () => {
    expect(validateCombo({ ...valid, comboTargetProductIds: ["gid://shopify/Product/999"] }))
      .toContain("Choose at least one product page to show the combo on.");
  });

  test("requires a usable discount value unless the type is none", () => {
    expect(validateCombo({ ...valid, comboDiscountValue: 0 })).toContain(
      "Enter a discount value greater than 0.",
    );
    expect(validateCombo({ ...valid, comboDiscountType: "percentage", comboDiscountValue: 120 }))
      .toContain("A percentage discount cannot be more than 100%.");
    expect(validateCombo({ ...valid, comboDiscountType: "none", comboDiscountValue: 0 })).toEqual([]);
  });
});

describe("combo matching and stock", () => {
  const combo = (id, targets) => ({
    id,
    items: [
      { productId: "gid://shopify/Product/1", handle: "a", quantity: 1 },
      { productId: "gid://shopify/Product/2", handle: "b", quantity: 1 },
    ],
    targetProductIds: targets,
    discountType: "percentage",
    discountValue: 10,
  });

  test("matches on the product page the merchant ticked, comparing across id shapes", () => {
    const combos = [combo("c1", ["gid://shopify/Product/1"]), combo("c2", ["gid://shopify/Product/2"])];
    expect(matchCombosForProduct(combos, "1").map((c) => c.id)).toEqual(["c1"]);
    expect(matchCombosForProduct(combos, "2").map((c) => c.id)).toEqual(["c2"]);
    expect(matchCombosForProduct(combos, "3")).toEqual([]);
  });

  test("falls back to every component product when no targets are stored", () => {
    expect(matchCombosForProduct([combo("c1", [])], "2").map((c) => c.id)).toEqual(["c1"]);
  });

  test("caps how many combos stack on one page", () => {
    const many = ["c1", "c2", "c3", "c4"].map((id) => combo(id, ["gid://shopify/Product/1"]));
    expect(matchCombosForProduct(many, "1")).toHaveLength(3);
  });

  test("inventory is enforced only for tracked variants", () => {
    const variant = { id: 1, available: true };
    // Untracked: the snapshot is stale, so a working offer must not be blocked.
    expect(variantHasStock(variant, 5, { 1: { tracked: false, quantity: 0 } })).toBe(true);
    // Tracked and short.
    expect(variantHasStock(variant, 5, { 1: { tracked: true, quantity: 2, policy: "deny" } })).toBe(false);
    expect(variantHasStock(variant, 2, { 1: { tracked: true, quantity: 2, policy: "deny" } })).toBe(true);
    // Overselling allowed.
    expect(variantHasStock(variant, 99, { 1: { tracked: true, quantity: 0, policy: "continue" } })).toBe(true);
    // Unavailable beats everything.
    expect(variantHasStock({ id: 1, available: false }, 1, null)).toBe(false);
  });
});

describe("resolveCombo", () => {
  const products = {
    a: {
      id: "gid://shopify/Product/1",
      title: "Product A",
      featured_image: "a.png",
      variants: [
        { id: 11, title: "Small", price: 10000, compare_at_price: 15000, available: true },
        { id: 12, title: "Large", price: 12000, compare_at_price: null, available: true },
      ],
    },
    b: {
      id: "gid://shopify/Product/2",
      title: "Product B",
      featured_image: "b.png",
      variants: [{ id: 21, title: "Default Title", price: 5000, compare_at_price: null, available: true }],
    },
  };

  const combo = {
    id: "c1",
    items: [
      { productId: "gid://shopify/Product/1", handle: "a", quantity: 1, title: "Product A" },
      { productId: "gid://shopify/Product/2", handle: "b", quantity: 1, title: "Product B" },
    ],
    discountType: "percentage",
    discountValue: 10,
  };

  test("prices from the live variant, in currency units not cents", () => {
    const r = resolveCombo(combo, products, null, null);
    expect(r.components[0].unitPrice).toBe(100);
    expect(r.components[0].compareAtPrice).toBe(150);
    expect(r.pricing.total).toBe(135);
    expect(r.disabled).toBe(false);
  });

  test("honours the customer's variant choice", () => {
    const r = resolveCombo(combo, products, { "gid://shopify/Product/1": "12" }, null);
    expect(r.components[0].variantId).toBe(12);
    expect(r.components[0].unitPrice).toBe(120);
  });

  test("withholds the whole offer when a component no longer resolves", () => {
    // A dropped line would quietly become "one product at 10% off".
    expect(resolveCombo(combo, { a: products.a }, null, null)).toBeNull();
  });

  test("out-of-stock variants leave the dropdown and disable the offer", () => {
    const oos = {
      ...products,
      a: { ...products.a, variants: products.a.variants.map((v) => ({ ...v, available: false })) },
    };
    const r = resolveCombo(combo, oos, null, null);
    expect(r.disabled).toBe(true);
    expect(r.components[0].variants).toEqual([]);
    expect(r.disabledReason).toContain("Product A");
    // Still priced and titled, so the customer can see what is unavailable.
    expect(r.components[0].unitPrice).toBe(100);
  });

  test("a partly out-of-stock product keeps only its sellable variants", () => {
    const partial = {
      ...products,
      a: {
        ...products.a,
        variants: [{ ...products.a.variants[0], available: false }, products.a.variants[1]],
      },
    };
    const r = resolveCombo(combo, partial, null, null);
    expect(r.disabled).toBe(false);
    expect(r.components[0].variants.map((v) => v.id)).toEqual(["12"]);
    expect(r.components[0].variantId).toBe(12);
  });
});
