import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
  ProductDiscountCandidate,
} from '../generated/api';

// ---------------------------------------------------------------------------
// Config shape (written to the `$app:bundle-discount/config` metafield by the
// Preventify admin on bundle publish). Mirrors the tier fields in the bundle
// editor (app/routes/app.sales-booster.bundle.$id.jsx).
// ---------------------------------------------------------------------------
type TierDiscountType = 'percentage' | 'flat' | 'specific' | 'bogo' | 'none';

interface Tier {
  quantity: number;
  discountType: TierDiscountType;
  discountValue?: number;
  bogoBuyX?: number;
  priceRounding?: boolean;
  priceRoundingValue?: number;
}

interface BundleConfig {
  // 'all' applies to every product; 'specific' restricts to productIds.
  applyOn?: 'all' | 'specific' | 'collections';
  productIds?: string[]; // Shopify product GIDs
  tiers?: Tier[];
}

// ---------------------------------------------------------------------------
// Combo (multi-product) offers. 2-3 DIFFERENT products bought together at a
// discount. Unlike a quantity break, matching is "does the cart contain every
// component in at least the required quantity" — and it can match more than
// once if the cart holds several complete sets.
//
// Discount maths is ported from app/lib/combo-pricing.js, which is the source
// of truth shared by the storefront widget and the COD form. Keep the two in
// step: a customer who sees a price on the product page must be charged it.
// ---------------------------------------------------------------------------
type ComboDiscountType = 'none' | 'percentage' | 'flat' | 'perUnitFlat';

interface ComboItem {
  productId: string; // Shopify product GID
  quantity: number; // units of this product per combo set
}

interface ComboConfig {
  id?: string;
  name?: string;
  items?: ComboItem[];
  discountType?: ComboDiscountType;
  discountValue?: number;
}

interface Configuration {
  bundles?: BundleConfig[];
  combos?: ComboConfig[];
}

type CartLine = CartInput['cart']['lines'][number];

/** One line, and how many of its units a combo set has claimed. */
interface Allocation {
  line: CartLine;
  quantity: number;
}

const EMPTY: CartLinesDiscountsGenerateRunResult = {operations: []};

/**
 * Compute the discounted TOTAL price for `quantity` units at `unitPrice` under a
 * tier. Ported verbatim from calculateTierPrice in the bundle editor so the
 * native-checkout discount matches what the COD form / widget shows.
 */
function calculateTierPrice(
  unitPrice: number,
  quantity: number,
  tier: Tier,
): number {
  const fullPrice = unitPrice * quantity;
  let discounted: number;
  switch (tier.discountType) {
    case 'percentage':
      discounted = fullPrice * (1 - (tier.discountValue ?? 0) / 100);
      break;
    case 'flat':
      discounted = Math.max(0, fullPrice - (tier.discountValue ?? 0));
      break;
    case 'specific':
      discounted = tier.discountValue ?? fullPrice;
      break;
    case 'bogo':
      discounted = unitPrice * (tier.bogoBuyX || Math.max(1, quantity - 1));
      break;
    case 'none':
    default:
      discounted = fullPrice;
  }
  if (tier.priceRounding) {
    discounted = Math.floor(discounted) + (tier.priceRoundingValue ?? 0.99);
  }
  return discounted;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function unitPrice(line: CartLine): number {
  return Number(line.cost.amountPerQuantity.amount);
}

/**
 * Split `total` across parts in proportion to their weight.
 *
 * Floors each share to the cent so the running sum can never overshoot, then
 * hands the remainder to the highest-weight parts (capped by each part's own
 * weight). Mirrors splitFlatDiscount in app/lib/combo-pricing.js — including
 * "highest first", so the split does not change when the merchant reorders the
 * products in the editor.
 */
function splitProportional(weights: number[], total: number): number[] {
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const target = Math.min(Math.max(0, round2(total)), weightSum);
  if (target <= 0 || weightSum <= 0) return weights.map(() => 0);

  const out = weights.map((w) =>
    Math.min(w, Math.floor(((target * w) / weightSum) * 100) / 100),
  );

  let remainder = round2(target - out.reduce((s, d) => s + d, 0));
  const byWeightDesc = weights.map((_, i) => i).sort((a, b) => weights[b] - weights[a]);
  for (const i of byWeightDesc) {
    if (remainder <= 0) break;
    const headroom = round2(weights[i] - out[i]);
    const take = Math.min(headroom, remainder);
    out[i] = round2(out[i] + take);
    remainder = round2(remainder - take);
  }
  return out;
}

/**
 * Claim `wanted` units for one combo component, taking from its cart lines in
 * cart order and never exceeding what each line still has unclaimed.
 */
function allocate(
  lines: CartLine[],
  wanted: number,
  remaining: Map<string, number>,
): Allocation[] {
  const out: Allocation[] = [];
  let left = wanted;
  for (const line of lines) {
    if (left <= 0) break;
    const available = remaining.get(line.id) ?? 0;
    if (available <= 0) continue;
    const take = Math.min(available, left);
    out.push({line, quantity: take});
    left -= take;
  }
  return out;
}

function allocationFull(allocations: Allocation[]): number {
  return allocations.reduce((sum, a) => sum + unitPrice(a.line) * a.quantity, 0);
}

/**
 * Build discount candidates for every complete set of a combo the cart holds,
 * marking the units it consumes so the quantity-break pass cannot discount them
 * a second time.
 *
 * Returns nothing when the cart is missing a component — a partial combo must
 * never be discounted, or "two products at 30% off" silently becomes one
 * product at 30% off.
 */
function combosForCart(
  combo: ComboConfig,
  linesByProduct: Map<string, CartLine[]>,
  remaining: Map<string, number>,
): ProductDiscountCandidate[] {
  const items = combo.items ?? [];
  if (items.length < 2 || combo.discountType === 'none' || !combo.discountType) return [];

  // How many complete sets the cart can supply, limited by the scarcest
  // component. Every complete set is discounted.
  let sets = Infinity;
  for (const item of items) {
    const required = Math.max(1, Math.floor(item.quantity || 1));
    const lines = linesByProduct.get(item.productId) ?? [];
    const available = lines.reduce((sum, l) => sum + (remaining.get(l.id) ?? 0), 0);
    sets = Math.min(sets, Math.floor(available / required));
    if (sets < 1) return [];
  }
  if (!Number.isFinite(sets) || sets < 1) return [];

  // Claim the units each component contributes to those sets.
  const perComponent = items.map((item) => {
    const required = Math.max(1, Math.floor(item.quantity || 1)) * sets;
    const lines = linesByProduct.get(item.productId) ?? [];
    const allocations = allocate(lines, required, remaining);
    return {allocations, units: required, full: round2(allocationFull(allocations))};
  });

  const value = Number(combo.discountValue) || 0;
  let componentDiscounts: number[];

  switch (combo.discountType) {
    case 'percentage': {
      const pct = Math.min(100, Math.max(0, value));
      componentDiscounts = perComponent.map((c) => round2((c.full * pct) / 100));
      break;
    }
    case 'perUnitFlat':
      // Off EVERY unit, so a component with quantity 2 (or 2 sets) scales.
      componentDiscounts = perComponent.map((c) => Math.min(c.full, round2(value * c.units)));
      break;
    case 'flat':
      // Off the bundle, once per complete set.
      componentDiscounts = splitProportional(
        perComponent.map((c) => c.full),
        round2(value * sets),
      );
      break;
    default:
      return [];
  }

  const candidates: ProductDiscountCandidate[] = [];

  perComponent.forEach((component, index) => {
    const componentDiscount = Math.min(component.full, Math.max(0, componentDiscounts[index] ?? 0));

    // A component can span several cart lines (different variants of the same
    // product), so split its share again across those lines.
    const lineShares = splitProportional(
      component.allocations.map((a) => round2(unitPrice(a.line) * a.quantity)),
      componentDiscount,
    );

    component.allocations.forEach((allocation, lineIndex) => {
      // Mark the units as spent whether or not they earned a discount, so the
      // quantity-break pass treats them as already sold in a combo.
      remaining.set(
        allocation.line.id,
        (remaining.get(allocation.line.id) ?? 0) - allocation.quantity,
      );

      const share = lineShares[lineIndex] ?? 0;
      if (share <= 0) return;

      candidates.push({
        message: combo.name || 'Combo discount',
        targets: [{cartLine: {id: allocation.line.id, quantity: allocation.quantity}}],
        value: {fixedAmount: {amount: share.toFixed(2)}},
      });
    });
  });

  return candidates;
}

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  if (!input.cart.lines.length) {
    return EMPTY;
  }

  // Only act when a Product discount class is present (per-line product discount).
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return EMPTY;
  }

  const config = input.discount.metafield?.jsonValue as Configuration | undefined;
  if (!config?.bundles?.length && !config?.combos?.length) {
    return EMPTY;
  }

  const candidates: ProductDiscountCandidate[] = [];

  // Units of each line not yet claimed by an offer. Combos run first and spend
  // from this, so a product bought as part of a combo cannot also be discounted
  // by a quantity break — both would otherwise apply to the same units and the
  // customer would be double-discounted.
  const remaining = new Map<string, number>();
  for (const line of input.cart.lines) {
    remaining.set(line.id, line.quantity);
  }

  // Every ProductVariant line, grouped by product, for combo matching.
  const cartByProduct = new Map<string, CartLine[]>();
  for (const line of input.cart.lines) {
    if (line.merchandise.__typename !== 'ProductVariant') continue;
    const pid = line.merchandise.product.id;
    const arr = cartByProduct.get(pid) ?? [];
    arr.push(line);
    cartByProduct.set(pid, arr);
  }

  // ---- Combo pass (first: combos take precedence) ----
  for (const combo of config.combos ?? []) {
    candidates.push(...combosForCart(combo, cartByProduct, remaining));
  }

  // ---- Quantity-break pass (on whatever units the combos left) ----
  for (const bundle of config.bundles ?? []) {
    if (!bundle.tiers?.length) continue;

    // Collect this bundle's entitled cart lines: ProductVariant lines whose
    // product matches (applyOn 'all' matches everything; 'specific' matches
    // productIds). Collection scoping is a follow-up (see design doc).
    const entitledLines = input.cart.lines.filter((line): boolean => {
      if (line.merchandise.__typename !== 'ProductVariant') return false;
      if (bundle.applyOn === 'specific') {
        return (bundle.productIds ?? []).includes(line.merchandise.product.id);
      }
      // 'all' (and unknown) → every product participates
      return bundle.applyOn === 'all' || bundle.applyOn === undefined;
    });

    if (!entitledLines.length) continue;

    // Group entitled lines by product so a variant-mix (multiple lines of the
    // same product) is treated as ONE bundle unit — mirrors Pumper.
    const byProduct = new Map<string, CartLine[]>();
    for (const line of entitledLines) {
      if (line.merchandise.__typename !== 'ProductVariant') continue;
      const pid = line.merchandise.product.id;
      const arr = byProduct.get(pid) ?? [];
      arr.push(line);
      byProduct.set(pid, arr);
    }

    for (const [, productLines] of byProduct) {
      // Only units a combo did not already claim count toward a tier.
      const lines = productLines.filter((l) => (remaining.get(l.id) ?? 0) > 0);
      if (!lines.length) continue;

      const qtyOf = (l: CartLine) => remaining.get(l.id) ?? 0;
      const totalQty = lines.reduce((sum, l) => sum + qtyOf(l), 0);

      // Match the tier whose quantity equals the total (exact match, v1).
      const tier = bundle.tiers.find((t) => t.quantity === totalQty);
      if (!tier || tier.discountType === 'none') continue;

      // Full price across the group (each line uses its own variant unit price
      // so mixed-price variants are handled correctly).
      const groupFull = lines.reduce((sum, l) => sum + unitPrice(l) * qtyOf(l), 0);
      // Reference unit price for the tier math = first line's unit price
      // (the editor's calculateTierPrice is single-price; parity kept).
      const discountedPrice = calculateTierPrice(
        unitPrice(lines[0]),
        totalQty,
        tier,
      );
      const totalDiscount = round2(groupFull - discountedPrice);
      if (totalDiscount <= 0) continue;

      // Distribute the total discount across lines proportional to each line's
      // full price (matches Shopify's "across" allocation & Pumper's split).
      // The last line absorbs the rounding remainder so the shares sum exactly.
      let allocated = 0;
      lines.forEach((line, idx) => {
        const isLast = idx === lines.length - 1;
        const lineFull = unitPrice(line) * qtyOf(line);
        const share = isLast
          ? round2(totalDiscount - allocated)
          : round2((lineFull / groupFull) * totalDiscount);
        allocated += share;
        if (share <= 0) return;
        // Target only the unclaimed units. Omitted entirely when the whole line
        // is available, which is the pre-combo behaviour.
        const partial = qtyOf(line) < line.quantity;
        candidates.push({
          message: 'Bundle discount',
          targets: [
            {cartLine: partial ? {id: line.id, quantity: qtyOf(line)} : {id: line.id}},
          ],
          value: {fixedAmount: {amount: share.toFixed(2)}},
        });
      });
    }
  }

  if (!candidates.length) return EMPTY;

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
