import { describe, expect, test } from "vitest";
import { abandonmentRow, fraudEventRow, lineOffer, money, numericId, offerRow, orderRow, parseItems, settingValue, settingsRow } from "./growzar-rows";

const facts = { shopCurrency: "PKR", shopTimezone: "Asia/Karachi", shopCountry: "PK", shopCountrySource: "location" };

// Made-up rows only.
const baseOrder = {
  id: "ord_1",
  shopifyOrderId: "gid://shopify/Order/5550001",
  shopifyOrderNumber: "#1001",
  createdAt: new Date("2026-10-01T10:00:00Z"),
  updatedAt: new Date("2026-10-01T10:00:00Z"),
  status: "pending",
  paymentMethod: "cod",
  verificationMethod: "whatsapp_otp_verified",
  riskLevel: "UNKNOWN",
  subtotal: 3075,
  shipping: 200,
  total: 3275,
  discounts: null,
  items: JSON.stringify([{ variantId: "gid://shopify/ProductVariant/880001", productId: "770001", quantity: 3, price: 1025 }]),
  phone: "03001234567",
  city: "Lahore",
  province: "Punjab",
  country: "Pakistan",
  firstName: "Test",
  email: "buyer@example.test",
  address: "1 Test Street",
};

describe("money and ids", () => {
  test("rounds to the currency's minor units and never defaults a currency", () => {
    expect(money(1250.5, "PKR")).toEqual({ amount: "1250.50", currency: "PKR" });
    expect(money(1250.5, "JPY")).toEqual({ amount: "1251", currency: "JPY" });
    expect(money(1.2345, "KWD")).toEqual({ amount: "1.235", currency: "KWD" });
    expect(money(10, null)).toBeNull();
    expect(money(null, "PKR")).toBeNull();
  });

  test("GIDs become numeric strings; anything else is null", () => {
    expect(numericId("gid://shopify/Order/123")).toBe("123");
    expect(numericId("123")).toBe("123");
    expect(numericId(123)).toBe("123");
    expect(numericId("upsell-cm123")).toBeNull();
    expect(numericId(null)).toBeNull();
  });

  test("items stored as an array or as a JSON string both parse", () => {
    expect(parseItems([{ a: 1 }])).toEqual([{ a: 1 }]);
    expect(parseItems('[{"a":1}]')).toEqual([{ a: 1 }]);
    expect(parseItems("not json")).toEqual([]);
    expect(parseItems(null)).toEqual([]);
  });
});

describe("lineOffer", () => {
  test("one-tick upsell carries its upsell id", () => {
    expect(lineOffer({ isOneTickUpsell: true, upsellId: "cm_u1" })).toEqual({ type: "one_tick", offerId: "cm_u1", source: "preventify" });
  });
  test("pre/post-purchase upsell", () => {
    expect(lineOffer({ isUpsell: true })).toEqual({ type: "upsell", offerId: null, source: "preventify" });
  });
  test("Preventify's own bundle widget, with and without a group id", () => {
    expect(lineOffer({ bundleGroupId: "bundle-cm_b1", isVariantMixBundle: true })).toEqual({ type: "bundle", offerId: "cm_b1", source: "preventify" });
    expect(lineOffer({ hasBundleDiscount: true, isVariantMixBundle: false })).toEqual({ type: "bundle", offerId: null, source: "preventify" });
  });
  test("a bundle discount detected from another app", () => {
    expect(lineOffer({ hasBundleDiscount: true, bundleDiscount: 100 })).toEqual({ type: "bundle", offerId: null, source: "third_party" });
  });
  test("a plain line, or an own-widget line at tier 1 with no discount, has no offer", () => {
    expect(lineOffer({ variantId: "1" })).toBeNull();
    expect(lineOffer({ isVariantMixBundle: false })).toBeNull();
  });
});

describe("orderRow", () => {
  test("shape: numeric ids, money, network risk, no buyer text", () => {
    const row = orderRow(baseOrder, facts);
    expect(row).toMatchObject({
      id: "ord_1",
      orderId: "5550001",
      orderName: "#1001",
      riskSource: "network",
      amountBasis: "before_discounts",
      subtotal: { amount: "3075.00", currency: "PKR" },
      total: { amount: "3275.00", currency: "PKR" },
      discountTotal: null,
      phone: "+923001234567",
      phoneRaw: "03001234567",
      city: "Lahore",
    });
    expect(row.lines).toEqual([
      { variantId: "880001", productId: "770001", quantity: 3, unitPrice: { amount: "1025.00", currency: "PKR" }, discount: null, isFreeGift: false, offer: null },
    ]);
    for (const hidden of ["firstName", "lastName", "email", "address", "customFields", "deliveryOutcome", "fulfillmentStatus"]) {
      expect(row).not.toHaveProperty(hidden);
    }
    expect(JSON.stringify(row)).not.toContain("gid://");
  });

  test("discounts recorded since this release make discountTotal exact and expose the downsell", () => {
    const row = orderRow({ ...baseOrder, discounts: { total: 450, bundle: 300, oneTick: 0, recovery: 150, code: 0, downsellId: "cm_d1" } }, facts);
    expect(row.discountTotal).toEqual({ amount: "450.00", currency: "PKR" });
    expect(row.downsell).toEqual({ offerId: "cm_d1", discount: { amount: "150.00", currency: "PKR" } });
  });

  test("card orders copied from Shopify are after discounts", () => {
    expect(orderRow({ ...baseOrder, paymentMethod: "card" }, facts).amountBasis).toBe("after_discounts");
  });

  test("unknown currency gives null money, never USD", () => {
    const row = orderRow(baseOrder, { ...facts, shopCurrency: null });
    expect(row.total).toBeNull();
    expect(row.lines[0].unitPrice).toBeNull();
  });

  test("a null orderId when the order never reached Shopify", () => {
    expect(orderRow({ ...baseOrder, shopifyOrderId: null }, facts).orderId).toBeNull();
  });
});

describe("abandonmentRow", () => {
  test("shape: hasEmail instead of the address, numeric recovered order id, no offers", () => {
    const row = abandonmentRow(
      {
        id: "ab_1",
        sessionId: "sess_1",
        abandonedAt: new Date("2026-10-01T10:15:00Z"),
        totalAmount: 1500,
        cartItems: JSON.stringify([{ variantId: "880002", quantity: 1, price: 1500, isUpsell: true }]),
        customerPhone: "03001234567",
        customerEmail: "buyer@example.test",
        customerFirstName: "Test",
        recovered: true,
        recoveredAt: new Date("2026-10-01T11:00:00Z"),
        recoveredOrderId: "5550002",
        retryCount: 1,
        updatedAt: new Date("2026-10-01T11:00:00Z"),
      },
      facts,
    );
    expect(row).toMatchObject({ hasEmail: true, recoveredOrderId: "5550002", phone: "+923001234567", total: { amount: "1500.00", currency: "PKR" } });
    expect(row.lines[0]).not.toHaveProperty("offer");
    expect(row).not.toHaveProperty("customerEmail");
    expect(row).not.toHaveProperty("customerFirstName");
  });
});

describe("settings", () => {
  test("values from the log come back typed", () => {
    expect(settingValue("true")).toBe(true);
    expect(settingValue("false")).toBe(false);
    expect(settingValue("10")).toBe(10);
    expect(settingValue(null)).toBeNull();
  });

  test("OTP channel follows the switch (WhatsApp is the only channel)", () => {
    const base = { id: "set_1", enableOTP: true, createdAt: new Date("2026-01-01T00:00:00Z") };
    expect(settingsRow(base).otpChannel).toBe("whatsapp");
    expect(settingsRow({ ...base, enableOTP: false }).otpChannel).toBeNull();
    expect(settingsRow(base, new Date("2026-10-08T00:00:00Z")).updatedAt).toBe("2026-10-08T00:00:00.000Z");
  });
});

describe("offers and events", () => {
  const at = new Date("2026-10-09T00:00:00Z");
  const common = { id: "cm_o", name: "Offer", enabled: true, createdAt: at, updatedAt: at, impressions: 10, accepts: 3, declines: 2 };

  test("a one-tick upsell sells at a price; counters are labelled lifetime", () => {
    const row = offerRow("upsell", { ...common, upsellType: "one-tick", discountType: "none", discountValue: 0, upsellPrice: 499 }, facts);
    expect(row).toMatchObject({ type: "one_tick", subtype: "one-tick", price: { amount: "499.00", currency: "PKR" }, lifetimeImpressions: 10, lifetimeAccepts: 3, lifetimeDeclines: 2 });
    expect(row).not.toHaveProperty("acceptButtonBgColor");
  });

  test("pre-purchase upsell and downsell keep their discount", () => {
    expect(offerRow("upsell", { ...common, upsellType: "pre-purchase", discountType: "percentage", discountValue: 10 }, facts)).toMatchObject({ type: "upsell", discountType: "percentage", discountValue: 10, price: null });
    expect(offerRow("downsell", { ...common, discountType: "fixed", discountValue: 50 }, facts)).toMatchObject({ type: "downsell", discountType: "fixed", discountValue: 50 });
  });

  test("bundles: tiered quantity bundles, one discount for a combo, no declines counter", () => {
    expect(offerRow("bundle", { ...common, bundleType: "quantity", status: "published" }, facts)).toMatchObject({ type: "bundle", subtype: "quantity", status: "published", discountType: "tiered", discountValue: null, lifetimeDeclines: null });
    expect(offerRow("bundle", { ...common, bundleType: "combo", status: "inactive", comboDiscountType: "percentage", comboDiscountValue: 15 }, facts)).toMatchObject({ discountType: "percentage", discountValue: 15 });
  });

  test("fraud events: phone normalized on the way out, nothing else about the buyer", () => {
    const row = fraudEventRow({ id: "fe1", kind: "blocked", rule: "phone", channel: null, path: "cod", riskLevel: null, phone: "+923001234567", sessionId: "s1", orderId: null, createdAt: at, updatedAt: at }, facts);
    expect(row).toMatchObject({ kind: "blocked", rule: "phone", path: "cod", phone: "+923001234567", phoneRaw: "+923001234567" });
    expect(Object.keys(row)).not.toContain("dedupeKey");
  });
});
