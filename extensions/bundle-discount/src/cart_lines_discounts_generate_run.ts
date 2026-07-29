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

interface Configuration {
  bundles?: BundleConfig[];
}

type CartLine = CartInput['cart']['lines'][number];

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
  if (!config?.bundles?.length) {
    return EMPTY;
  }

  const candidates: ProductDiscountCandidate[] = [];

  for (const bundle of config.bundles) {
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

    for (const [, lines] of byProduct) {
      const totalQty = lines.reduce((sum, l) => sum + l.quantity, 0);

      // Match the tier whose quantity equals the total (exact match, v1).
      const tier = bundle.tiers.find((t) => t.quantity === totalQty);
      if (!tier || tier.discountType === 'none') continue;

      // Full price across the group (each line uses its own variant unit price
      // so mixed-price variants are handled correctly).
      const groupFull = lines.reduce(
        (sum, l) => sum + unitPrice(l) * l.quantity,
        0,
      );
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
        const lineFull = unitPrice(line) * line.quantity;
        const share = isLast
          ? round2(totalDiscount - allocated)
          : round2((lineFull / groupFull) * totalDiscount);
        allocated += share;
        if (share <= 0) return;
        candidates.push({
          message: 'Bundle discount',
          targets: [{cartLine: {id: line.id}}],
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
