/**
 * Resolving a tier's free gift against live Shopify product data.
 *
 * Pure — App.jsx owns fetching `/products/<handle>.js` and the variant state.
 * The saved tier stores only WHICH product is the gift; price, variants and
 * availability always come from Shopify at render time.
 */

import { normalizeTierGift, giftDisplayName, numericId } from '../lib/tier-gift';
import { variantHasStock } from './combo-resolver';

/**
 * @returns the resolved gift, or null when it must be hidden: the product is
 * deleted/unpublished (its .js 404s, so `product` is missing) or no variant can
 * supply the gift quantity. The tier itself keeps working either way.
 */
export function resolveTierGift(gift, product, selectedVariantId, inventoryMap) {
  const g = normalizeTierGift(gift);
  if (!g || !product || !product.variants?.length) return null;

  // Sold-out variants are left out of the dropdown, like combos.
  const selectable = product.variants.filter((v) => variantHasStock(v, g.quantity, inventoryMap));
  if (!selectable.length) return null;

  const selected = selectable.find((v) => String(v.id) === String(selectedVariantId)) || selectable[0];

  return {
    ...g,
    name: giftDisplayName(g, product.title),
    numericProductId: numericId(product.id),
    variantId: String(selected.id),
    variantTitle: selected.title,
    variants: selectable.map((v) => ({ id: String(v.id), title: v.title })),
    image: selected.featured_image?.src || product.featured_image || product.images?.[0] || g.image || null,
    unitPrice: Number(selected.price || 0) / 100,
  };
}

/** Distinct gift product handles across an offer's tiers. */
export function giftProductHandles(bundle) {
  const handles = new Set();
  for (const tier of bundle?.tiers || []) {
    const g = normalizeTierGift(tier.gift);
    if (g) handles.add(g.handle);
  }
  return [...handles];
}
