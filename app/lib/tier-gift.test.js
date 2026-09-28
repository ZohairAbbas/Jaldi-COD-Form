import { describe, test, expect } from "vitest";
import {
  GIFT_LINE_PROPERTY,
  normalizeTierGift,
  validateTierGifts,
  sanitizeTierGifts,
  buildGiftCartItem,
  findEarnedGift,
  planGiftCartCleanup,
} from "./tier-gift";
import { resolveTierGift } from "../storefront/gift-resolver";
import { buildBundleFunctionConfig } from "./bundle-function.server";

const GIFT = { productId: "gid://shopify/Product/20", handle: "socks", title: "Socks", quantity: 1 };

describe("normalizeTierGift", () => {
  test("a tier without a picked product has no gift", () => {
    expect(normalizeTierGift(null)).toBeNull();
    expect(normalizeTierGift({ productId: "gid://shopify/Product/20" })).toBeNull();
  });

  test("quantity is coerced into range and original price defaults on", () => {
    expect(normalizeTierGift({ ...GIFT, quantity: 0 }).quantity).toBe(1);
    expect(normalizeTierGift({ ...GIFT, quantity: "3" }).quantity).toBe(3);
    expect(normalizeTierGift({ ...GIFT, quantity: 1000 }).quantity).toBe(99);
    expect(normalizeTierGift(GIFT).showOriginalPrice).toBe(true);
    expect(normalizeTierGift({ ...GIFT, showOriginalPrice: false }).showOriginalPrice).toBe(false);
  });
});

describe("validateTierGifts", () => {
  test("rejects a gift that is one of the offer's own products", () => {
    const errors = validateTierGifts({
      applyOn: "specific",
      productIds: ["gid://shopify/Product/20"],
      tiers: [{ quantity: 1 }, { quantity: 2, gift: GIFT }],
    });
    expect(errors).toEqual(["Tier 2: the gift must be a different product from the ones in this offer."]);
  });

  test("allows any gift on an all-products or collection offer", () => {
    for (const applyOn of ["all", "collections"]) {
      expect(validateTierGifts({ applyOn, productIds: ["gid://shopify/Product/20"], tiers: [{ gift: GIFT }] })).toEqual([]);
    }
  });
});

test("sanitizeTierGifts drops broken gifts and keeps the rest of the tier", () => {
  const out = sanitizeTierGifts([{ id: "t1", gift: { productId: "x" } }, { id: "t2", gift: { ...GIFT, extra: 1 } }]);
  expect(out[0]).toEqual({ id: "t1" });
  expect(out[1].gift).toEqual(normalizeTierGift(GIFT));
});

describe("resolveTierGift", () => {
  const product = {
    id: 20,
    title: "Cosy Socks",
    featured_image: "img.jpg",
    variants: [
      { id: 1, title: "Red", price: 4000, available: false },
      { id: 2, title: "Blue", price: 4500, available: true },
      { id: 3, title: "Green", price: 5000, available: true },
    ],
  };

  test("deleted/unpublished product → hidden", () => {
    expect(resolveTierGift(GIFT, undefined, null, {})).toBeNull();
  });

  test("every variant sold out → hidden", () => {
    const soldOut = { ...product, variants: product.variants.map((v) => ({ ...v, available: false })) };
    expect(resolveTierGift(GIFT, soldOut, null, {})).toBeNull();
  });

  test("sold-out variants are left out and the first sellable one preselected", () => {
    const r = resolveTierGift(GIFT, product, null, {});
    expect(r.variants.map((v) => v.id)).toEqual(["2", "3"]);
    expect(r.variantId).toBe("2");
    expect(r.unitPrice).toBe(45);
    expect(r.name).toBe("Cosy Socks");
  });

  test("the merchant's rename wins over the product title", () => {
    expect(resolveTierGift({ ...GIFT, name: "Mystery gift" }, product, "3", {}).name).toBe("Mystery gift");
  });

  test("tracked stock below the gift quantity hides that variant", () => {
    const inv = { 2: { tracked: true, quantity: 1, policy: "deny" } };
    const r = resolveTierGift({ ...GIFT, quantity: 2 }, product, "2", inv);
    expect(r.variants.map((v) => v.id)).toEqual(["3"]);
  });
});

test("buildGiftCartItem is a free line whose original value becomes a 100% line discount", () => {
  const item = buildGiftCartItem(
    { name: "Socks", numericProductId: "20", variantId: "2", variantTitle: "Blue", quantity: 2, unitPrice: 45, image: "i" },
    { bundleId: "b1", tierId: "t1", tierTitle: "Buy 3" },
  );
  expect(item).toMatchObject({
    variantId: "gid://shopify/ProductVariant/2",
    price: 0,
    originalPrice: 90,
    hasBundleDiscount: true,
    isFreeGift: true,
    giftBundleId: "b1",
    giftLabel: "Buy 3",
  });
});

describe("findEarnedGift / planGiftCartCleanup (native cart)", () => {
  const offer = (id, tiers, extra = {}) => ({ id, applyOn: "specific", productIds: ["gid://shopify/Product/10"], tiers, ...extra });
  const tier = (quantity, gift = GIFT) => ({ quantity, gift });
  const paid = (key, product_id, quantity) => ({ key, product_id, quantity, properties: {} });
  const gift = (key, bundleId, quantity = 1, product_id = 20) => ({
    key, product_id, quantity, properties: { [GIFT_LINE_PROPERTY]: bundleId },
  });

  test("exact match earns the gift", () => {
    expect(findEarnedGift(new Map([["10", 3]]), [offer("b1", [tier(3)])])).toEqual({ bundleId: "b1", productId: "20", quantity: 1 });
    expect(findEarnedGift(new Map([["10", 4]]), [offer("b1", [tier(3)])])).toBeNull();
  });

  test("a collection offer never earns a native gift (not supported by the function)", () => {
    expect(findEarnedGift(new Map([["10", 3]]), [offer("b1", [tier(3)], { applyOn: "collections" })])).toBeNull();
  });

  test("nothing to do when the cart still earns its gift", () => {
    expect(planGiftCartCleanup([paid("a", 10, 3), gift("g", "b1")], [offer("b1", [tier(3)])])).toEqual([]);
  });

  test("the gift is removed when the tier quantity changes", () => {
    expect(planGiftCartCleanup([paid("a", 10, 2), gift("g", "b1")], [offer("b1", [tier(3)])])).toEqual([{ key: "g", quantity: 0 }]);
  });

  test("the gift is removed when the offer product is removed", () => {
    expect(planGiftCartCleanup([gift("g", "b1")], [offer("b1", [tier(3)])])).toEqual([{ key: "g", quantity: 0 }]);
  });

  test("a second gift line is removed (one gift per order) and extra units trimmed", () => {
    const changes = planGiftCartCleanup(
      [paid("a", 10, 3), gift("g1", "b1", 3), gift("g2", "b1", 1)],
      [offer("b1", [tier(3, { ...GIFT, quantity: 2 })])],
    );
    expect(changes).toEqual([{ key: "g1", quantity: 2 }, { key: "g2", quantity: 0 }]);
  });

  test("the higher-priority offer's gift is kept, the other removed", () => {
    const changes = planGiftCartCleanup(
      [paid("a", 10, 3), paid("b", 11, 2), gift("g1", "low"), gift("g2", "high")],
      [offer("high", [tier(2)], { productIds: ["gid://shopify/Product/11"] }), offer("low", [tier(3)])],
    );
    expect(changes).toEqual([{ key: "g1", quantity: 0 }]);
  });

  test("gift units don't count toward the tier on an all-products offer", () => {
    const allOffer = { id: "b1", applyOn: "all", tiers: [tier(2, { ...GIFT, productId: "gid://shopify/Product/10" })] };
    expect(planGiftCartCleanup([paid("a", 10, 1), gift("g", "b1", 1, 10)], [allOffer])).toEqual([{ key: "g", quantity: 0 }]);
  });

  test("combo units are claimed before the tier is matched", () => {
    const combos = [{ items: [{ productId: "gid://shopify/Product/10", quantity: 1 }, { productId: "gid://shopify/Product/30", quantity: 1 }], discountType: "percentage" }];
    expect(
      planGiftCartCleanup([paid("a", 10, 3), paid("c", 30, 1), gift("g", "b1")], [offer("b1", [tier(3)])], combos),
    ).toEqual([{ key: "g", quantity: 0 }]);
  });
});

test("the function config carries each offer's id and its tiers' gifts", () => {
  const config = buildBundleFunctionConfig({
    bundles: [{
      id: "b1",
      bundleType: "quantity",
      applyOn: "all",
      productIds: [],
      tiers: [{ quantity: 1 }, { quantity: 2, gift: { ...GIFT, quantity: 2, name: "x" } }],
    }],
  });
  expect(config.bundles[0].id).toBe("b1");
  expect(config.bundles[0].tiers[0].gift).toBeUndefined();
  expect(config.bundles[0].tiers[1].gift).toEqual({ productId: GIFT.productId, quantity: 2 });
});
