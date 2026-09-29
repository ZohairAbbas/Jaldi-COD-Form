import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { isCodAllowedForProduct, isNativeBundleMode, mayUseNativeBundleMode } from "./native-bundle";

const SHOP = "whatsapp-check.myshopify.com";
const gid = (id) => `gid://shopify/Product/${id}`;

// The product-page gate index.jsx used before per-product COD, kept verbatim so
// the new helper can be checked against it.
function legacyProductGate(settings, currentProductId) {
  if (settings.disableSpecificProducts) {
    const disabledIds = settings.disabledProductIds || [];
    if (disabledIds.length > 0 && currentProductId) {
      const isBlocked = disabledIds.some((pid) => String(pid).replace(/\D/g, "") === String(currentProductId));
      if (isBlocked) return false;
    }
  }
  if (!settings.enableSpecificProducts) return true;
  const specificIds = settings.specificProductIds || [];
  if (specificIds.length === 0) return false;
  if (!currentProductId) return false;
  return specificIds.some((pid) => String(pid).replace(/\D/g, "") === String(currentProductId));
}

function withCountry(country) {
  const store = {};
  if (country) {
    store[`preventify_real_country_${SHOP}`] = JSON.stringify({ country, timestamp: Date.now() });
  }
  vi.stubGlobal("sessionStorage", { getItem: (k) => store[k] ?? null, setItem: () => {} });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isCodAllowedForProduct", () => {
  test("matches the old product-page gate for every list combination", () => {
    const settingsCases = [
      {},
      { enableSpecificProducts: true, specificProductIds: [] },
      { enableSpecificProducts: true, specificProductIds: [gid(1)] },
      { enableSpecificProducts: true, specificProductIds: ["1", gid(3)] },
      { disableSpecificProducts: true, disabledProductIds: [] },
      { disableSpecificProducts: true, disabledProductIds: [gid(2)] },
      { disableSpecificProducts: false, disabledProductIds: [gid(2)] },
      { enableSpecificProducts: false, specificProductIds: [gid(1)] },
      { enableSpecificProducts: true, specificProductIds: [gid(1)], disableSpecificProducts: true, disabledProductIds: [gid(1)] },
    ];
    for (const settings of settingsCases) {
      for (const id of ["1", "2", "3", "10", undefined, ""]) {
        expect(isCodAllowedForProduct(settings, id), JSON.stringify({ settings, id })).toBe(legacyProductGate(settings, id));
      }
    }
  });

  test("does not match on an id prefix", () => {
    expect(isCodAllowedForProduct({ enableSpecificProducts: true, specificProductIds: [gid(12)] }, "1")).toBe(false);
  });
});

describe("isNativeBundleMode", () => {
  const native = (extra = {}) => ({ settings: { nativeBundleCheckout: true, nativeBundleCountries: [], ...extra } });

  test("is unchanged when no product id is passed", () => {
    const config = native({ enableSpecificProducts: true, specificProductIds: [gid(1)] });
    expect(isNativeBundleMode(config, SHOP)).toBe(true);
    expect(isNativeBundleMode({ settings: { nativeBundleCheckout: false } }, SHOP, null, "1")).toBe(false);
  });

  test("a product in the allow list uses COD; every other product stays native", () => {
    const config = native({ enableSpecificProducts: true, specificProductIds: [gid(1)] });
    expect(isNativeBundleMode(config, SHOP, null, "1")).toBe(false);
    expect(isNativeBundleMode(config, SHOP, null, "2")).toBe(true);
  });

  test("the block list never turns native mode off", () => {
    const config = native({ disableSpecificProducts: true, disabledProductIds: [gid(1)] });
    expect(isNativeBundleMode(config, SHOP, null, "1")).toBe(true);
    expect(isNativeBundleMode(config, SHOP, null, "2")).toBe(true);
  });

  test("without an allow list every product stays native", () => {
    expect(isNativeBundleMode(native(), SHOP, null, "1")).toBe(true);
    expect(isNativeBundleMode(native({ enableSpecificProducts: true, specificProductIds: [] }), SHOP, null, "1")).toBe(true);
  });

  test("an allow-listed product that is also blocked stays native", () => {
    const config = native({
      enableSpecificProducts: true, specificProductIds: [gid(1)],
      disableSpecificProducts: true, disabledProductIds: [gid(1)],
    });
    expect(isNativeBundleMode(config, SHOP, null, "1")).toBe(true);
  });

  test("the country list still applies to unlisted products", () => {
    const config = native({ nativeBundleCountries: ["PAK"], enableSpecificProducts: true, specificProductIds: [gid(1)] });
    expect(isNativeBundleMode(config, SHOP, "PAK", "2")).toBe(true);
    expect(isNativeBundleMode(config, SHOP, "UAE", "2")).toBe(false);
    expect(isNativeBundleMode(config, SHOP, "PAK", "1")).toBe(false);
  });
});

describe("mayUseNativeBundleMode", () => {
  beforeEach(() => withCountry(null));

  test("off when the toggle is off", () => {
    expect(mayUseNativeBundleMode({ settings: { nativeBundleCheckout: false } }, SHOP)).toBe(false);
  });

  test("on when native mode applies everywhere", () => {
    expect(mayUseNativeBundleMode({ settings: { nativeBundleCheckout: true, nativeBundleCountries: [] } }, SHOP)).toBe(true);
  });

  test("with a country list, on while the country is unknown, then follows it", () => {
    const config = { settings: { nativeBundleCheckout: true, nativeBundleCountries: ["PAK"] } };
    expect(mayUseNativeBundleMode(config, SHOP)).toBe(true);
    withCountry("PAK");
    expect(mayUseNativeBundleMode(config, SHOP)).toBe(true);
    withCountry("UAE");
    expect(mayUseNativeBundleMode(config, SHOP)).toBe(false);
  });
});
