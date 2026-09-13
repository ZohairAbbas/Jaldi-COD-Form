import { useEffect, useRef } from 'react';
import ComboWidget from './ComboWidget';

/**
 * The stack of combo cards on a product page.
 *
 * Owns nothing but presentation and impression tracking; selection state lives
 * in App.jsx because accepting a combo rewrites the COD cart.
 *
 * Impressions fire when a card actually enters the viewport rather than on page
 * load — combos render below the buy buttons, so a load-time count would inflate
 * the denominator of every conversion rate the merchant reads.
 */
export default function ComboOffers({
  resolved,
  currencySymbol,
  exchangeRate = null,
  isRTL = false,
  selectedComboId = null,
  addedComboId = null,
  ctaFallbackLabel = 'Order Now - Cash on Delivery',
  onToggle,
  onVariantChange,
  onImpression,
}) {
  const nodeRefs = useRef(new Map());
  const seenRef = useRef(new Set());

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined' || !onImpression) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const comboId = entry.target.dataset.preventifyComboId;
          if (!comboId || seenRef.current.has(comboId)) continue;
          seenRef.current.add(comboId);
          onImpression(comboId);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 },
    );

    for (const node of nodeRefs.current.values()) {
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [resolved, onImpression]);

  if (!resolved?.length) return null;

  return (
    <div>
      {resolved.map(({ combo, components, pricing, disabled, disabledReason }) => (
        <div
          key={combo.id}
          data-preventify-combo-id={combo.id}
          ref={(node) => {
            if (node) nodeRefs.current.set(combo.id, node);
            else nodeRefs.current.delete(combo.id);
          }}
        >
          <ComboWidget
            combo={combo}
            components={components}
            pricing={pricing}
            currencySymbol={currencySymbol}
            exchangeRate={exchangeRate}
            isRTL={isRTL}
            selected={selectedComboId === combo.id}
            added={addedComboId === combo.id}
            disabled={disabled}
            disabledReason={disabledReason}
            ctaLabel={combo.ctaText || ctaFallbackLabel}
            onToggle={() => onToggle?.(combo.id)}
            onVariantChange={(index, variantId) => onVariantChange?.(combo.id, index, variantId)}
          />
        </div>
      ))}
    </div>
  );
}
