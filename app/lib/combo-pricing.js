/**
 * Combo bundle pricing — shared by the admin editor preview, the storefront
 * widget, and the cart-item builder in App.jsx.
 *
 * Isomorphic on purpose: no server imports, no DOM. All three callers MUST use
 * this so the price a customer sees on the widget is the price the draft order
 * is built from.
 *
 * The one invariant that matters: the advertised bundle total is always the SUM
 * OF THE LINES, never computed separately from it. Discounts are applied
 * per line and the total is derived, so a rounded cent can never disagree with
 * what Shopify ends up charging.
 */

export const COMBO_MIN_PRODUCTS = 2;
export const COMBO_MAX_PRODUCTS = 3;

export const COMBO_DISCOUNT_TYPES = [
  { value: "none", label: "No discount" },
  { value: "percentage", label: "% discount (e.g. 25% off)" },
  { value: "flat", label: "Flat discount off the bundle (e.g. 500 off)" },
  { value: "perUnitFlat", label: "Flat discount on each unit (e.g. 10 off each)" },
];

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/**
 * Split a single flat "off the whole bundle" amount across the lines.
 *
 * Proportional by line value, with the flooring remainder handed to the
 * highest-value lines first and every line capped at its own value — so a cheap
 * component can never be discounted below zero, and the parts always sum to
 * exactly the amount taken off.
 *
 * Highest-value (rather than last) keeps the split stable when the merchant
 * drags the products into a different order.
 */
function splitFlatDiscount(lines, amount) {
  const fullTotal = round2(lines.reduce((s, l) => s + l.fullPrice, 0));
  const target = Math.min(Math.max(0, round2(amount)), fullTotal);
  if (target <= 0 || fullTotal <= 0) return lines.map(() => 0);

  // Floor each share to the cent so the running sum can never overshoot.
  const out = lines.map((l) =>
    Math.min(l.fullPrice, Math.floor(((target * l.fullPrice) / fullTotal) * 100) / 100),
  );

  let remainder = round2(target - out.reduce((s, d) => s + d, 0));
  const byValueDesc = lines.map((_, i) => i).sort((a, b) => lines[b].fullPrice - lines[a].fullPrice);
  for (const i of byValueDesc) {
    if (remainder <= 0) break;
    const headroom = round2(lines[i].fullPrice - out[i]);
    const take = Math.min(headroom, remainder);
    out[i] = round2(out[i] + take);
    remainder = round2(remainder - take);
  }
  return out;
}

/**
 * Price a combo.
 *
 * @param lines [{ unitPrice, quantity, compareAtPrice? }] — one entry per
 *        component product, in the merchant's display order.
 * @param discountType  none | percentage | flat | perUnitFlat
 * @param discountValue
 * @returns {{
 *   lines: Array<{ quantity, unitPrice, fullPrice, discount, discountedPrice, compareAtTotal }>,
 *   total, fullTotal, compareAtTotal, totalDiscount, hasDiscount, showCompareAt
 * }}
 */
export function calculateComboPricing(lines, discountType, discountValue) {
  const value = Number(discountValue) || 0;

  const priced = (lines || []).map((l) => {
    const quantity = Math.max(1, Math.floor(Number(l.quantity) || 1));
    const unitPrice = Math.max(0, Number(l.unitPrice) || 0);
    // No compare_at on this product? Fall back to its own regular price, so a
    // catalogue where only some products are marked down still shows a
    // strikethrough for the ones that are — and never invents a fake saving,
    // because the total is only shown when it beats the bundle price.
    const compareUnit =
      l.compareAtPrice != null && Number(l.compareAtPrice) > unitPrice
        ? Number(l.compareAtPrice)
        : unitPrice;
    return {
      ...l,
      quantity,
      unitPrice,
      fullPrice: round2(unitPrice * quantity),
      compareAtTotal: round2(compareUnit * quantity),
    };
  });

  let rawDiscounts;
  switch (discountType) {
    case "percentage": {
      const pct = Math.min(100, Math.max(0, value));
      rawDiscounts = priced.map((l) => round2((l.fullPrice * pct) / 100));
      break;
    }
    case "perUnitFlat":
      // Off EVERY unit: a line of qty 2 gets twice the amount taken off.
      rawDiscounts = priced.map((l) => round2(value * l.quantity));
      break;
    case "flat":
      rawDiscounts = splitFlatDiscount(priced, value);
      break;
    case "none":
    default:
      rawDiscounts = priced.map(() => 0);
  }

  const resultLines = priced.map((l, i) => {
    const discount = Math.min(l.fullPrice, Math.max(0, round2(rawDiscounts[i] || 0)));
    return { ...l, discount, discountedPrice: round2(l.fullPrice - discount) };
  });

  const total = round2(resultLines.reduce((s, l) => s + l.discountedPrice, 0));
  const fullTotal = round2(resultLines.reduce((s, l) => s + l.fullPrice, 0));
  const compareAtTotal = round2(resultLines.reduce((s, l) => s + l.compareAtTotal, 0));

  return {
    lines: resultLines,
    total,
    fullTotal,
    compareAtTotal,
    totalDiscount: round2(fullTotal - total),
    hasDiscount: total < fullTotal,
    showCompareAt: compareAtTotal > total,
  };
}

/**
 * Validate a combo before save. Returns an array of human-readable problems;
 * empty means it is publishable. Used by the editor (inline errors) and by the
 * route action (so a crafted request can't persist an unpublishable offer).
 */
export function validateCombo(bundle) {
  const errors = [];
  const items = Array.isArray(bundle?.comboItems) ? bundle.comboItems : [];
  const targets = Array.isArray(bundle?.comboTargetProductIds) ? bundle.comboTargetProductIds : [];

  if (items.length < COMBO_MIN_PRODUCTS) {
    errors.push(`Select at least ${COMBO_MIN_PRODUCTS} products.`);
  }
  if (items.length > COMBO_MAX_PRODUCTS) {
    errors.push(`A combo can have at most ${COMBO_MAX_PRODUCTS} products.`);
  }

  const ids = items.map((i) => i.productId);
  if (new Set(ids).size !== ids.length) {
    errors.push("The same product can only be added once.");
  }
  if (items.some((i) => !i.productId || !i.handle)) {
    errors.push("Every product must be picked from the product picker.");
  }
  if (items.some((i) => !Number.isFinite(Number(i.quantity)) || Number(i.quantity) < 1)) {
    errors.push("Every product needs a quantity of 1 or more.");
  }

  if (items.length >= COMBO_MIN_PRODUCTS) {
    const validTargets = targets.filter((t) => ids.includes(t));
    if (validTargets.length === 0) {
      errors.push("Choose at least one product page to show the combo on.");
    }
  }

  const type = bundle?.comboDiscountType;
  const value = Number(bundle?.comboDiscountValue);
  if (type !== "none") {
    if (!Number.isFinite(value) || value <= 0) {
      errors.push("Enter a discount value greater than 0.");
    } else if (type === "percentage" && value > 100) {
      errors.push("A percentage discount cannot be more than 100%.");
    }
  }

  return errors;
}

/**
 * Build the storefront cart items for an accepted combo.
 *
 * Emits ONE item per component product carrying its own `bundleDiscount`
 * (via price/originalPrice), which is the shape CODForm + proxy.draft-order
 * already understand for bundle lines — no order-level discount, so the Shopify
 * order reconciles line by line with what the widget advertised.
 *
 * When the combo IS discounted, `price` / `originalPrice` are LINE TOTALS,
 * matching the existing variant-mix bundle items (CODForm reads a flagged
 * bundle line as a total and divides by quantity for the per-unit price).
 *
 * When it is NOT discounted there is no bundle line to flag, so `price` must be
 * the PER-UNIT price instead — CODForm multiplies unflagged lines by quantity,
 * and passing a total there would bill the customer quantity-squared.
 */
export function buildComboCartItems(combo, resolved, pricing, currencyMeta = {}) {
  const { exchangeRate = null, currencySymbol = null, currencyCode = null } = currencyMeta;

  return pricing.lines.map((line, i) => {
    const component = resolved[i];
    const item = {
      variantId: `gid://shopify/ProductVariant/${component.variantId}`,
      productId: String(component.numericProductId),
      title: component.title,
      variant: component.variantTitle && component.variantTitle !== "Default Title"
        ? component.variantTitle
        : null,
      quantity: line.quantity,
      price: pricing.hasDiscount ? line.discountedPrice : line.unitPrice,
      originalPrice: pricing.hasDiscount ? line.fullPrice : undefined,
      hasBundleDiscount: pricing.hasDiscount,
      // Groups the lines so selecting another offer can clear this one wholesale,
      // and so CODForm can tell combo lines from ordinary cart lines.
      bundleGroupId: `combo-${combo.id}`,
      comboId: combo.id,
      comboName: combo.name,
      image: component.image || null,
    };

    if (exchangeRate) {
      item.displayPrice = round2(item.price * exchangeRate);
      if (pricing.hasDiscount) {
        item.displayOriginalPrice = round2(line.fullPrice * exchangeRate);
      }
      item.displayCurrencySymbol = currencySymbol;
      item.displayCurrencyCode = currencyCode;
      item.displayExchangeRate = exchangeRate;
    }

    return item;
  });
}
