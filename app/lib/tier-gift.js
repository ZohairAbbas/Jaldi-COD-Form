/**
 * Free gifts on quantity-offer tiers — rules shared by the admin editor, the
 * storefront (widget, COD cart, native cart cleanup) and the order builders.
 *
 * Isomorphic on purpose: no server imports, no DOM.
 *
 * A tier's gift lives inside the tier object in `Bundle.tiers`:
 *   tier.gift = { productId, handle, title, name, image, quantity, showOriginalPrice }
 * The merchant picks a PRODUCT; the customer picks the variant on the widget.
 *
 * The native-checkout Discount Function (extensions/bundle-discount) re-implements
 * `planGiftCartCleanup`'s winner selection in TypeScript. Keep the two in step:
 * the gift the cart keeps must be the gift the function makes free.
 */

// Hidden line-item property the widget puts on a gift it adds to the native
// cart. Its value is the bundle id. Only lines carrying it can be made free,
// so a customer who buys the gift product on purpose is never given one unit.
export const GIFT_LINE_PROPERTY = "_preventify_gift";

// Visible property / discount title on COD orders, so fulfilment staff can see
// which line was the gift from the Shopify order alone.
export const GIFT_ORDER_LABEL = "Free gift";

export const GIFT_MAX_QUANTITY = 99;

export function numericId(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/** A tier's gift in canonical form, or null when the tier has none. */
export function normalizeTierGift(gift) {
  if (!gift || typeof gift !== "object" || !gift.productId || !gift.handle) return null;
  const quantity = Math.floor(Number(gift.quantity));
  return {
    productId: String(gift.productId),
    handle: String(gift.handle),
    title: gift.title ? String(gift.title) : "",
    name: gift.name ? String(gift.name) : "",
    image: gift.image || null,
    quantity: Number.isFinite(quantity) ? Math.min(GIFT_MAX_QUANTITY, Math.max(1, quantity)) : 1,
    showOriginalPrice: gift.showOriginalPrice !== false,
  };
}

/** The name shown to customers: the merchant's rename, else the product title. */
export function giftDisplayName(gift, productTitle = "") {
  return (gift?.name || "").trim() || productTitle || gift?.title || "";
}

/**
 * Problems that must block a save. Used by the editor and by the route action,
 * so a crafted request can't persist a gift the rules forbid.
 */
export function validateTierGifts(bundle) {
  const errors = [];
  const tiers = Array.isArray(bundle?.tiers) ? bundle.tiers : [];
  const offerProducts = new Set(
    bundle?.applyOn === "specific" ? (bundle.productIds || []).map(numericId) : [],
  );

  tiers.forEach((tier, idx) => {
    if (!tier?.gift) return;
    const gift = normalizeTierGift(tier.gift);
    if (!gift) {
      errors.push(`Tier ${idx + 1}: pick the gift product again from the product picker.`);
      return;
    }
    // "All products" and collection offers can't avoid overlapping every
    // product, so the rule only bites when the offer names its products.
    if (offerProducts.has(numericId(gift.productId))) {
      errors.push(`Tier ${idx + 1}: the gift must be a different product from the ones in this offer.`);
    }
  });

  return errors;
}

/** Tiers are stored as JSON; strip every gift down to its canonical shape. */
export function sanitizeTierGifts(tiers) {
  return (Array.isArray(tiers) ? tiers : []).map((tier) => {
    const gift = normalizeTierGift(tier?.gift);
    const rest = { ...(tier || {}) };
    delete rest.gift;
    return gift ? { ...rest, gift } : rest;
  });
}

/**
 * Build the COD-form cart line for a gift resolved against live product data
 * (see storefront/gift-resolver.js).
 *
 * Shaped like a discounted bundle line: `price` / `originalPrice` are LINE
 * TOTALS and `hasBundleDiscount` is set, so the existing submit path turns it
 * into a full-price line with a 100% line discount — inventory is decremented
 * and the order shows the gift's real value. That flag also means the shop's
 * "allow discount codes on bundles" setting applies, as agreed.
 */
export function buildGiftCartItem(resolved, meta = {}, currencyMeta = {}) {
  const { bundleId = null, tierId = null, tierTitle = "" } = meta;
  const { exchangeRate = null, currencySymbol = null, currencyCode = null } = currencyMeta;
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  const originalTotal = round2((Number(resolved.unitPrice) || 0) * resolved.quantity);

  const item = {
    variantId: `gid://shopify/ProductVariant/${resolved.variantId}`,
    productId: String(resolved.numericProductId),
    title: resolved.name,
    variant: resolved.variantTitle && resolved.variantTitle !== "Default Title" ? resolved.variantTitle : null,
    quantity: resolved.quantity,
    price: 0,
    originalPrice: originalTotal,
    hasBundleDiscount: originalTotal > 0,
    isFreeGift: true,
    giftBundleId: bundleId,
    giftTierId: tierId,
    giftLabel: tierTitle || "",
    image: resolved.image || null,
  };

  if (exchangeRate) {
    item.displayPrice = 0;
    item.displayOriginalPrice = round2(originalTotal * exchangeRate);
    item.displayCurrencySymbol = currencySymbol;
    item.displayCurrencyCode = currencyCode;
    item.displayExchangeRate = exchangeRate;
  }

  return item;
}

// ---------------------------------------------------------------------------
// Native cart: which gift (if any) the cart has earned
// ---------------------------------------------------------------------------

/** Order digit strings numerically without BigInt (ids exceed 2^53). */
function compareNumericIds(a, b) {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

function offerCoversProduct(bundle, productId) {
  const applyOn = bundle.applyOn || "all";
  if (applyOn === "all") return true;
  if (applyOn === "specific") {
    return (bundle.productIds || []).some((pid) => numericId(pid) === productId);
  }
  // Collection scoping isn't supported by the Discount Function yet, so a
  // collection offer never earns anything at native checkout.
  return false;
}

/**
 * The one gift a cart has earned, mirroring the Discount Function:
 *   - gift lines never count toward a tier;
 *   - combos claim their units first (they take precedence over tiers);
 *   - a tier needs an EXACT unit match;
 *   - offers are checked in priority order and the first one to qualify wins
 *     (one gift per order). Within one offer, the lowest product id wins so
 *     both implementations agree without depending on line order.
 *
 * @param qtyByProduct Map<numericProductId, units> of NON-gift lines
 * @returns {{ bundleId, productId, quantity } | null}
 */
export function findEarnedGift(qtyByProduct, bundles, combos = []) {
  const remaining = new Map(qtyByProduct);

  for (const combo of combos || []) {
    const items = combo.items || [];
    if (items.length < 2 || !combo.discountType || combo.discountType === "none") continue;
    let sets = Infinity;
    for (const item of items) {
      const required = Math.max(1, Math.floor(item.quantity || 1));
      sets = Math.min(sets, Math.floor((remaining.get(numericId(item.productId)) || 0) / required));
    }
    if (!Number.isFinite(sets) || sets < 1) continue;
    for (const item of items) {
      const pid = numericId(item.productId);
      remaining.set(pid, (remaining.get(pid) || 0) - Math.max(1, Math.floor(item.quantity || 1)) * sets);
    }
  }

  const products = [...remaining.keys()].sort(compareNumericIds);

  for (const bundle of bundles || []) {
    const tiers = bundle.tiers || [];
    if (!tiers.some((t) => t?.gift)) continue;
    for (const pid of products) {
      const units = remaining.get(pid) || 0;
      if (units <= 0 || !offerCoversProduct(bundle, pid)) continue;
      const tier = tiers.find((t) => Number(t.quantity) === units);
      const gift = normalizeTierGift(tier?.gift);
      if (gift) {
        return { bundleId: bundle.id, productId: numericId(gift.productId), quantity: gift.quantity };
      }
    }
  }
  return null;
}

/**
 * Plan the /cart/change.js calls that bring a native cart's gift lines back in
 * line with what the cart has earned. Gift lines that no longer qualify are
 * removed, and an earned gift above its quantity is trimmed.
 *
 * @param cartItems `/cart.js` items: { key, product_id, quantity, properties }
 * @returns {Array<{ key, quantity }>} target quantities, empty when nothing to do
 */
export function planGiftCartCleanup(cartItems, bundles, combos = []) {
  const items = Array.isArray(cartItems) ? cartItems : [];
  const isGift = (item) => !!item?.properties?.[GIFT_LINE_PROPERTY];
  const giftLines = items.filter(isGift);
  if (!giftLines.length) return [];

  const qtyByProduct = new Map();
  for (const item of items) {
    if (isGift(item)) continue;
    const pid = numericId(item.product_id);
    qtyByProduct.set(pid, (qtyByProduct.get(pid) || 0) + (Number(item.quantity) || 0));
  }

  const earned = findEarnedGift(qtyByProduct, bundles, combos);
  let allowance = earned ? earned.quantity : 0;
  const changes = [];

  for (const line of giftLines) {
    const matches = earned
      && String(line.properties[GIFT_LINE_PROPERTY]) === String(earned.bundleId)
      && numericId(line.product_id) === earned.productId;
    const keep = matches ? Math.min(allowance, Number(line.quantity) || 0) : 0;
    if (matches) allowance -= keep;
    if (keep !== Number(line.quantity)) changes.push({ key: line.key, quantity: keep });
  }
  return changes;
}
