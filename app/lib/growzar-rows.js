import { phoneFields } from "./growzar-phone";

/**
 * Feed rows for Growzar (pack phase-g5/preventify.md). Pure functions: the
 * routes load rows and shop facts, these decide what leaves the app.
 *
 * Never returned: buyer names, email, street address, customFields, and
 * anything cross-merchant (GlobalBuyer, ExternalDeliveryRecord, …; Q11).
 */

// ---------------------------------------------------------------------------
// Money (contract §4) and ids (§3)
// ---------------------------------------------------------------------------

const minorUnitsCache = new Map();

function minorUnits(currency) {
  if (!minorUnitsCache.has(currency)) {
    let digits = 2;
    try {
      digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits;
    } catch {
      // Unknown code: keep 2, the common case. The currency itself is passed through.
    }
    minorUnitsCache.set(currency, digits);
  }
  return minorUnitsCache.get(currency);
}

/**
 * `{ amount: "1250.00", currency }`, rounded to the currency's minor units at
 * the edge (money is stored as Float). Null when the currency is unknown —
 * never a default currency — or the value is missing.
 */
export function money(value, currency) {
  if (!currency || value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const digits = minorUnits(currency);
  const factor = 10 ** digits;
  return { amount: (Math.round((number + Number.EPSILON) * factor) / factor).toFixed(digits), currency };
}

/** "gid://shopify/Order/123" or "123" → "123"; anything else → null. */
export function numericId(value) {
  if (value == null) return null;
  const text = String(value).trim();
  const match = text.match(/^(?:gid:\/\/shopify\/[A-Za-z]+\/)?(\d+)(?:\?.*)?$/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Lines and offers
// ---------------------------------------------------------------------------

/** Order.items is Json holding either an array or a JSON string of one; carts store a string. */
export function parseItems(value) {
  let items = value;
  if (typeof items === "string") {
    try {
      items = JSON.parse(items);
    } catch {
      return [];
    }
  }
  return Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
}

/**
 * Which offer put this line in the order, from the markers the storefront
 * leaves on the item:
 *   one_tick  isOneTickUpsell (+ upsellId)
 *   upsell    isUpsell (pre/post-purchase upsell; no id is stored on the line)
 *   bundle    bundleGroupId "bundle-<id>" (combo / variant mix), or a bundle
 *             discount on the line. `source` is "preventify" when Preventify's
 *             own Bundle widget built the line (it always writes
 *             isVariantMixBundle), "third_party" when the discount came from a
 *             detected bundle app (Pumper, Bundler, Quantity Breaks).
 * Downsells are order-level (a recovery discount), see orderRow().
 */
export function lineOffer(item) {
  if (item.isOneTickUpsell) {
    return { type: "one_tick", offerId: item.upsellId ? String(item.upsellId) : null, source: "preventify" };
  }
  if (item.isUpsell) return { type: "upsell", offerId: null, source: "preventify" };

  const groupId = typeof item.bundleGroupId === "string" ? item.bundleGroupId.replace(/^(bundle|combo)-/, "") : null;
  const ownWidget = Boolean(groupId) || Object.prototype.hasOwnProperty.call(item, "isVariantMixBundle");
  if (groupId || item.hasBundleDiscount || item.isVariantMixBundle === true || Number(item.bundleDiscount) > 0) {
    return { type: "bundle", offerId: groupId || null, source: ownWidget ? "preventify" : "third_party" };
  }
  return null;
}

/** The discount this line carried, when it is recorded on the line itself. */
function lineDiscount(item) {
  if (Number(item.bundleDiscount) > 0) return Number(item.bundleDiscount);
  if (item.isOneTickUpsell && item.productPrice != null && item.price != null) {
    const perUnit = Number(item.productPrice) - Number(item.price);
    if (perUnit > 0) return perUnit * (Number(item.quantity) || 1);
  }
  return null;
}

export function lineRow(item, currency, { withOffer = true } = {}) {
  const row = {
    variantId: numericId(item.variantId),
    productId: numericId(item.productId ?? item.id),
    quantity: Number.parseInt(item.quantity, 10) || 0,
    unitPrice: money(item.price, currency),
    discount: money(lineDiscount(item), currency),
    isFreeGift: item.isFreeGift === true,
  };
  if (withOffer) row.offer = lineOffer(item);
  return row;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

const iso = (date) => (date ? new Date(date).toISOString() : null);

/**
 * /growzar/form-orders. Which figure the money fields are depends on the path
 * that wrote the order, so each row says so in `amountBasis`:
 *   "before_discounts"  COD form and PayFast: subtotal = Σ unit price × qty
 *                       (bundle lines at their full per-unit price), total =
 *                       subtotal + shipping. Discounts are NOT taken off.
 *   "after_discounts"   Pay-with-card orders, copied from Shopify's
 *                       orders/create payload: Shopify's own subtotal/total.
 * `discountTotal` is exact for orders written since this release (Order.discounts)
 * and null before it.
 */
export function orderRow(order, facts) {
  const currency = facts.shopCurrency;
  const discounts = order.discounts && typeof order.discounts === "object" ? order.discounts : null;
  const items = parseItems(order.items);

  return {
    id: order.id,
    orderId: numericId(order.shopifyOrderId),
    orderName: order.shopifyOrderNumber || null,
    createdAt: iso(order.createdAt),
    updatedAt: iso(order.updatedAt),
    status: order.status,
    paymentMethod: order.paymentMethod,
    verificationMethod: order.verificationMethod ?? null,
    riskLevel: order.riskLevel ?? null,
    riskSource: "network",
    amountBasis: order.paymentMethod === "card" ? "after_discounts" : "before_discounts",
    subtotal: money(order.subtotal, currency),
    shipping: money(order.shipping, currency),
    total: money(order.total, currency),
    discountTotal: discounts ? money(discounts.total ?? 0, currency) : null,
    downsell:
      discounts?.downsellId && Number(discounts.recovery) > 0
        ? { offerId: String(discounts.downsellId), discount: money(discounts.recovery, currency) }
        : null,
    lines: items.map((item) => lineRow(item, currency)),
    ...phoneFields(order.phone, facts.shopCountry),
    city: order.city || null,
    province: order.province || null,
    country: order.country || null,
  };
}

/**
 * /growzar/abandonments. `abandonedAt` is when the 5-minute cron noticed the
 * form session had been idle for 10 minutes, i.e. 10–15 minutes after the
 * buyer's last keystroke. `recovered` means "this form session later became
 * an order" (same session, or the recovery draft order was paid), not that a
 * message recovered it.
 */
export function abandonmentRow(cart, facts) {
  const currency = facts.shopCurrency;
  return {
    id: cart.id,
    sessionId: cart.sessionId,
    abandonedAt: iso(cart.abandonedAt),
    total: money(cart.totalAmount, currency),
    lines: parseItems(cart.cartItems).map((item) => lineRow(item, currency, { withOffer: false })),
    ...phoneFields(cart.customerPhone, facts.shopCountry),
    hasEmail: Boolean(cart.customerEmail && String(cart.customerEmail).trim()),
    recovered: cart.recovered,
    recoveredAt: iso(cart.recoveredAt),
    recoveredOrderId: numericId(cart.recoveredOrderId),
    retryCount: cart.retryCount,
    updatedAt: iso(cart.updatedAt),
  };
}

/** Text from the SettingsChange log back to the type the settings row uses. */
export function settingValue(text) {
  if (text == null) return null;
  if (text === "true") return true;
  if (text === "false") return false;
  return /^-?\d+$/.test(text) ? Number(text) : text;
}

/**
 * /growzar/settings: one row for the shop. OTP is WhatsApp-only today (the SMS
 * sender was retired; sms.server.js), so the channel follows the switch.
 * There is no per-risk or prepaid-forcing rule in Preventify; risk only tags.
 * `updatedAt` is the latest SettingsChange, so it moves only when one of these
 * fields does, not on every styling save.
 */
export function settingsRow(settings, lastChangedAt) {
  return {
    id: settings.id,
    otpEnabled: settings.enableOTP,
    otpChannel: settings.enableOTP ? "whatsapp" : null,
    userBlockingEnabled: settings.enableUserBlocking,
    blockHighQuantityEnabled: settings.blockHighQuantityEnabled,
    maxQuantityPerOrder: settings.maxQuantityPerOrder,
    limitOrdersEnabled: settings.limitOrdersEnabled,
    limitOrdersWindowMinutes: settings.limitOrdersWindowMinutes,
    riskTagsEnabled: settings.enableRiskTags,
    verificationTagsEnabled: settings.enableVerificationTags,
    updatedAt: iso(lastChangedAt ?? settings.createdAt),
  };
}

export function settingsChangeRow(change) {
  return {
    id: change.id,
    field: change.field,
    from: settingValue(change.from),
    to: settingValue(change.to),
    source: change.source,
    changedAt: iso(change.changedAt),
    updatedAt: iso(change.changedAt),
  };
}
