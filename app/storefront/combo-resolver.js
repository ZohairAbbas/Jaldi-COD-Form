/**
 * Resolving combo offers against live Shopify product data.
 *
 * Pure functions only — App.jsx owns the fetching and the state, this owns the
 * rules about which combos show, which variant is picked, and when a combo is
 * blocked. Keeping them here makes the stock rules testable without a DOM.
 */

import { calculateComboPricing } from '../lib/combo-pricing';

/** Shopify GIDs and Liquid product ids need comparing across both shapes. */
export function numericId(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * Combos that should render on the product page currently being viewed.
 *
 * Ordered by the server (priority ascending) and capped, because more than a
 * few stacked combo cards buries the rest of the product page on mobile.
 */
export function matchCombosForProduct(combos, currentProductId, limit = 3) {
  if (!combos?.length || !currentProductId) return [];
  const current = numericId(currentProductId);

  return combos
    .filter((combo) => {
      const items = combo.items || [];
      if (items.length < 2) return false;
      const targets = combo.targetProductIds?.length
        ? combo.targetProductIds
        : items.map((i) => i.productId);
      return targets.some((id) => numericId(id) === current);
    })
    .slice(0, limit);
}

/**
 * Can this variant supply `requiredQty` units?
 *
 * Inventory is only enforced for TRACKED variants: the inventory map is a
 * point-in-time snapshot, and untracked variants report stale counts that would
 * disable working offers. Mirrors the quantity-break widget's behaviour.
 */
export function variantHasStock(variant, requiredQty, inventoryMap) {
  if (!variant || !variant.available) return false;

  const inv = inventoryMap?.[variant.id] ?? inventoryMap?.[String(variant.id)];
  if (!inv || !inv.tracked) return true;
  if (inv.policy === 'continue') return true;
  return Math.max(0, inv.quantity) >= requiredQty;
}

function pickImage(variant, product) {
  return (
    variant?.featured_image?.src
    || product?.featured_image
    || product?.images?.[0]
    || null
  );
}

/**
 * Resolve one combo against fetched product data.
 *
 * Returns null when a component product no longer resolves (deleted,
 * unpublished, or handle changed). The WHOLE offer is withheld in that case —
 * never render a partial combo, which would silently turn "2 products at 15%
 * off" into one product at 15% off.
 *
 * A combo whose components exist but are out of stock still renders, with
 * `disabled` set, so the customer can see why they can't buy it.
 */
export function resolveCombo(combo, productsByHandle, selections, inventoryMap) {
  const items = combo.items || [];
  if (items.length < 2) return null;

  const components = [];

  for (const item of items) {
    const product = productsByHandle?.[item.handle];
    if (!product || !product.variants?.length) return null;

    const quantity = Math.max(1, Number(item.quantity) || 1);

    // Out-of-stock variants are filtered out of the dropdown entirely rather
    // than greyed: a flattened "Colour / Size" list with half the rows dead is
    // noise, not a choice.
    const selectableVariants = product.variants.filter((v) => variantHasStock(v, quantity, inventoryMap));

    const requestedId = selections?.[item.productId];
    const selected =
      selectableVariants.find((v) => String(v.id) === String(requestedId))
      || selectableVariants[0]
      || null;

    // Nothing sellable: fall back to the first variant purely so the card can
    // still show a title, image and price next to the out-of-stock notice.
    const display = selected || product.variants[0];

    components.push({
      productId: item.productId,
      handle: item.handle,
      numericProductId: numericId(product.id),
      title: product.title || item.title,
      image: pickImage(display, product),
      quantity,
      unitPrice: Number(display.price || 0) / 100,
      compareAtPrice: display.compare_at_price ? Number(display.compare_at_price) / 100 : null,
      variantId: display.id,
      variantTitle: display.title,
      selectedVariantId: selected ? String(selected.id) : '',
      variants: selectableVariants.map((v) => ({ id: String(v.id), title: v.title })),
      outOfStock: !selected,
    });
  }

  const outOfStockComponents = components.filter((c) => c.outOfStock);

  const pricing = calculateComboPricing(
    components.map((c) => ({
      unitPrice: c.unitPrice,
      quantity: c.quantity,
      compareAtPrice: c.compareAtPrice,
    })),
    combo.discountType,
    combo.discountValue,
  );

  return {
    combo,
    components,
    pricing,
    disabled: outOfStockComponents.length > 0,
    disabledReason:
      outOfStockComponents.length && combo.showStockWarning !== false
        ? `${outOfStockComponents.map((c) => c.title).join(', ')} ${outOfStockComponents.length > 1 ? 'are' : 'is'} out of stock`
        : null,
  };
}

/** Every distinct product handle the given combos need fetched. */
export function comboProductHandles(combos) {
  const handles = new Set();
  for (const combo of combos || []) {
    for (const item of combo.items || []) {
      if (item.handle) handles.add(item.handle);
    }
  }
  return [...handles];
}
