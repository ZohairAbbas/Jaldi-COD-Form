import React from 'react';

/**
 * Calculate tier price based on discount type
 */
export function calculateTierPrice(productPrice, tier) {
  const fullPrice = productPrice * tier.quantity;
  let discounted;
  switch (tier.discountType) {
    case 'percentage':
      discounted = fullPrice * (1 - tier.discountValue / 100);
      break;
    case 'flat':
      discounted = Math.max(0, fullPrice - tier.discountValue);
      break;
    case 'specific':
      discounted = tier.discountValue;
      break;
    case 'bogo':
      discounted = productPrice * (tier.quantity - 1);
      break;
    case 'none':
    default:
      discounted = fullPrice;
  }
  if (tier.priceRounding) {
    discounted = Math.floor(discounted) + (tier.priceRoundingValue || 0.99);
  }
  return { fullPrice, discountedPrice: discounted, hasDiscount: discounted < fullPrice };
}

export default function BundleWidget({
  bundleConfig,
  productPrice,
  compareAtPrice = null,
  currencySymbol,
  onTierSelect,
  selectedTierId,
  isRTL,
  exchangeRate = null,
  inventoryQuantity = null,
  productVariants = null,
  variantMixSelections = null,
  onVariantMixChange = null,
  variantMixOosError = false,
  inventoryMap = null,
}) {
  const styling = bundleConfig.styling || {};
  const colors = styling.colors || {};
  const tiers = bundleConfig.tiers || [];
  const isHorizontal = styling.layout === 'horizontal';
  const radius = styling.cornerRoundness || 12;
  const space = styling.breathingSpace || 12;

  // Use preselected tier as fallback if nothing is manually selected
  const preselectedTier = tiers.find(t => t.preselectTier);
  const effectiveSelectedId = selectedTierId != null ? selectedTierId : (preselectedTier ? preselectedTier.id : null);

  if (!tiers.length) return null;

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        direction: isRTL ? 'rtl' : 'ltr',
        marginBottom: '16px',
      }}
    >
      {/* Header */}
      {bundleConfig.headerText && (
        <div
          style={{
            textAlign: 'center',
            marginBottom: `${space}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            width: '100%',
          }}
        >
          {!bundleConfig.hideHeaderLines && (
            <div style={{ flex: 1, height: '1px', backgroundColor: '#a2a5a9' }}>&nbsp;</div>
          )}
          <span
            style={{
              color: colors.headerText?.color || '#000',
              fontSize: `${colors.headerText?.fontSize || 16}px`,
              fontWeight: '600',
              whiteSpace: 'nowrap',
            }}
          >
            {bundleConfig.headerText}
          </span>
          {!bundleConfig.hideHeaderLines && (
            <div style={{ flex: 1, height: '1px', backgroundColor: '#a2a5a9' }}>&nbsp;</div>
          )}
        </div>
      )}

      {/* Tiers */}
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          gap: `${space}px`,
          marginTop: isHorizontal && tiers.some(t => t.showMostPopular) ? '35px' : '0',
        }}
      >
        {tiers.map((tier) => {
          const isSelected = effectiveSelectedId === tier.id;
          const tierColors = isSelected ? colors.selectedTier : colors.unselectedTier;
          const { fullPrice, discountedPrice, hasDiscount } = calculateTierPrice(productPrice, tier);

          // When compare_at_price exists, use it for strikethrough instead of original price
          const strikethroughPrice = compareAtPrice ? compareAtPrice * tier.quantity : fullPrice;
          const showStrikethrough = compareAtPrice ? discountedPrice < strikethroughPrice : hasDiscount;

          // Convert prices for display if exchange rate is available
          const displayDiscountedPrice = exchangeRate ? discountedPrice * exchangeRate : discountedPrice;
          const displayFullPrice = exchangeRate ? strikethroughPrice * exchangeRate : strikethroughPrice;

          // Check if this tier exceeds available stock (gated by showStockWarning setting)
          // inventoryQuantity is null for untracked variants (no warning needed)
          const isLowStock = inventoryQuantity != null && tier.quantity > inventoryQuantity;
          const stockMessage = isLowStock && bundleConfig.showStockWarning !== false
            ? (inventoryQuantity <= 0 ? 'Out of stock!' : `Only ${inventoryQuantity} item${inventoryQuantity !== 1 ? 's' : ''} left in stock!`)
            : null;

          return (
            <div
              key={tier.id}
              onClick={() => onTierSelect(tier)}
              style={{
                flex: isHorizontal ? 1 : 'none',
                border: `2px solid ${tierColors?.borderColor || '#e0e0e0'}`,
                borderRadius: `${radius}px`,
                backgroundColor: tierColors?.bgColor || '#fff',
                padding: `${space}px`,
                paddingTop: isHorizontal && tier.showMostPopular ? `${space + 14}px` : `${space}px`,
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s',
                boxSizing: 'border-box',
              }}
            >
              {/* Most Popular Tag */}
              {tier.showMostPopular && (
                <div
                  style={{
                    position: 'absolute',
                    ...(isHorizontal
                      ? {
                          top: '-1px',
                          left: '50%',
                          transform: 'translate(-50%, -100%)',
                          borderRadius: `${Math.min(radius, 8)}px ${Math.min(radius, 8)}px 0 0`,
                          padding: '4px 14px',
                        }
                      : {
                          top: '-10px',
                          right: isRTL ? 'auto' : '10px',
                          left: isRTL ? '10px' : 'auto',
                          borderRadius: '4px',
                          padding: '2px 8px',
                        }),
                    backgroundColor: colors.mostPopularTag?.bgColor || '#ff0000',
                    color: colors.mostPopularTag?.textColor || '#fff',
                    fontSize: `${colors.mostPopularTag?.fontSize || 11}px`,
                    fontWeight: '600',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Most Popular
                </div>
              )}

              {isHorizontal ? (
                /* Horizontal layout: vertically stacked card content */
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '8px',
                    textAlign: 'center',
                  }}
                >
                  {/* Radio circle */}
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? (colors.selectedTier?.borderColor || '#000') : '#ccc'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          display: 'block',
                          width: '10px',
                          height: '10px',
                          minWidth: '10px',
                          minHeight: '10px',
                          borderRadius: '50%',
                          backgroundColor: colors.selectedTier?.borderColor || '#000',
                        }}
                      />
                    )}
                  </div>

                  {/* Title */}
                  <span
                    style={{
                      color: colors.tierTitle?.color || '#000',
                      fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                      fontWeight: '600',
                    }}
                  >
                    {tier.titleText}
                  </span>

                  {/* Badge */}
                  {tier.showBadge && tier.badgeText && (
                    <span
                      style={{
                        backgroundColor: colors.badge?.bgColor || '#000',
                        color: colors.badge?.textColor || '#fff',
                        fontSize: `${colors.badge?.fontSize || 12}px`,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontWeight: '500',
                      }}
                    >
                      {tier.badgeText}
                    </span>
                  )}

                  {/* Subtitle */}
                  {tier.showSubtitle && tier.subtitle && (
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      {tier.subtitle}
                    </div>
                  )}

                  {/* Price */}
                  <div>
                    <div
                      style={{
                        color: colors.price?.color || '#000',
                        fontSize: `${colors.price?.fontSize || 16}px`,
                        fontWeight: '700',
                      }}
                    >
                      {currencySymbol}{displayDiscountedPrice.toFixed(2)}
                    </div>
                    {showStrikethrough && (
                      <div
                        style={{
                          color: colors.strikethroughPrice?.color || '#999',
                          fontSize: `${colors.strikethroughPrice?.fontSize || 14}px`,
                          textDecoration: 'line-through',
                        }}
                      >
                        {currencySymbol}{displayFullPrice.toFixed(2)}
                      </div>
                    )}
                  </div>

                  {/* Low stock warning */}
                  {stockMessage && (
                    <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>
                      {stockMessage}
                    </div>
                  )}
                </div>
              ) : (
                /* Vertical layout: horizontal row content */
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}
                >
                  {/* Radio circle */}
                  <div
                    style={{
                      width: '20px',
                      height: '20px',
                      minWidth: '20px',
                      minHeight: '20px',
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? (colors.selectedTier?.borderColor || '#000') : '#ccc'}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      position: 'relative',
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          display: 'block',
                          width: '10px',
                          height: '10px',
                          minWidth: '10px',
                          minHeight: '10px',
                          borderRadius: '50%',
                          backgroundColor: colors.selectedTier?.borderColor || '#000',
                        }}
                      />
                    )}
                  </div>

                  {/* Tier content */}
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span
                        style={{
                          color: colors.tierTitle?.color || '#000',
                          fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                          fontWeight: '600',
                        }}
                      >
                        {tier.titleText}
                      </span>

                      {tier.showBadge && tier.badgeText && (
                        <span
                          style={{
                            backgroundColor: colors.badge?.bgColor || '#000',
                            color: colors.badge?.textColor || '#fff',
                            fontSize: `${colors.badge?.fontSize || 12}px`,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: '500',
                          }}
                        >
                          {tier.badgeText}
                        </span>
                      )}
                    </div>

                    {tier.showSubtitle && tier.subtitle && (
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                        {tier.subtitle}
                      </div>
                    )}

                    {/* Low stock warning - hidden when variant mix handles per-slot warnings */}
                    {stockMessage && !(bundleConfig.allowVariantMix && variantMixSelections) && (
                      <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500', marginTop: '2px' }}>
                        {stockMessage}
                      </div>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ textAlign: isRTL ? 'left' : 'right', flexShrink: 0 }}>
                    <div
                      style={{
                        color: colors.price?.color || '#000',
                        fontSize: `${colors.price?.fontSize || 16}px`,
                        fontWeight: '700',
                      }}
                    >
                      {currencySymbol}{displayDiscountedPrice.toFixed(2)}
                    </div>
                    {showStrikethrough && (
                      <div
                        style={{
                          color: colors.strikethroughPrice?.color || '#999',
                          fontSize: `${colors.strikethroughPrice?.fontSize || 14}px`,
                          textDecoration: 'line-through',
                        }}
                      >
                        {currencySymbol}{displayFullPrice.toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Variant Mix Selectors - shown below selected tier in vertical layout */}
              {isSelected && !isHorizontal && bundleConfig.allowVariantMix && variantMixSelections && productVariants && (
                <div style={{
                  marginTop: `${space}px`,
                  borderTop: '1px solid #e5e7eb',
                  paddingTop: `${space}px`,
                }}>
                  {productVariants.options && productVariants.options.length > 0 && (
                    <div style={{ fontSize: '13px', fontWeight: '600', color: '#374151', marginBottom: '8px' }}>
                      {productVariants.options.map(o => o.name).join(' / ')}
                    </div>
                  )}
                  {(() => {
                    // Pre-compute which slots are "excess" by processing top-to-bottom.
                    // First N slots within stock are valid; only slots beyond available stock are flagged.
                    const usedCounts = {};
                    const slotErrors = variantMixSelections.map((vid) => {
                      const variantData = productVariants.variants.find(v => v.id === parseInt(vid));
                      if (variantData && !variantData.available) return true;
                      const inv = inventoryMap?.[vid];
                      // Skip inventory enforcement for untracked variants (stale data)
                      if (!inv || !inv.tracked) return false;
                      usedCounts[vid] = (usedCounts[vid] || 0) + 1;
                      const clampedQty = Math.max(0, inv.quantity);
                      if (inv.policy !== 'continue' && usedCounts[vid] > clampedQty) return true;
                      return false;
                    });
                    return (<>
                      {variantMixSelections.map((selectedVid, slotIndex) => {
                        const hasSlotError = slotErrors[slotIndex];
                        return (
                          <div key={slotIndex} style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            marginBottom: slotIndex < variantMixSelections.length - 1 ? '8px' : 0,
                          }}>
                            <span style={{
                              fontSize: '13px',
                              fontWeight: '500',
                              color: hasSlotError ? '#DC2626' : '#6B7280',
                              minWidth: '20px',
                            }}>
                              {slotIndex + 1}.
                            </span>
                            <select
                              value={selectedVid}
                              onChange={(e) => {
                                e.stopPropagation();
                                onVariantMixChange(slotIndex, e.target.value);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: `1.5px solid ${hasSlotError ? '#EF4444' : '#D1D5DB'}`,
                                backgroundColor: hasSlotError ? '#FEF2F2' : '#fff',
                                fontSize: '13px',
                                color: '#111827',
                                outline: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              {productVariants.variants.map(v => {
                                const vInv = inventoryMap?.[String(v.id)];
                                // Only enforce inventory for tracked variants; untracked have stale data
                                const vOos = !v.available || (vInv && vInv.tracked && vInv.policy !== 'continue' && vInv.quantity <= 0);
                                return (
                                  <option key={v.id} value={String(v.id)} disabled={vOos}>
                                    {v.title}{vOos ? ' (Sold Out)' : ''}
                                  </option>
                                );
                              })}
                            </select>
                          </div>
                        );
                      })}
                      {variantMixOosError && (
                        <div style={{
                          marginTop: '8px',
                          color: '#DC2626',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}>
                          Highlighted item(s) are out of stock!
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
