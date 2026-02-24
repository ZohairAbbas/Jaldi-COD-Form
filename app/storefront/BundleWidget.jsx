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
  currencySymbol,
  onTierSelect,
  selectedTierId,
  isRTL,
  exchangeRate = null,
}) {
  const styling = bundleConfig.styling || {};
  const colors = styling.colors || {};
  const tiers = bundleConfig.tiers || [];
  const isHorizontal = styling.layout === 'horizontal';
  const radius = styling.cornerRoundness || 12;
  const space = styling.breathingSpace || 12;

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
            gap: '8px',
          }}
        >
          {!bundleConfig.hideHeaderLines && (
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
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
            <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
          )}
        </div>
      )}

      {/* Tiers */}
      <div
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          gap: `${space}px`,
        }}
      >
        {tiers.map((tier) => {
          const isSelected = selectedTierId === tier.id;
          const tierColors = isSelected ? colors.selectedTier : colors.unselectedTier;
          const { fullPrice, discountedPrice, hasDiscount } = calculateTierPrice(productPrice, tier);

          // Convert prices for display if exchange rate is available
          const displayDiscountedPrice = exchangeRate ? discountedPrice * exchangeRate : discountedPrice;
          const displayFullPrice = exchangeRate ? fullPrice * exchangeRate : fullPrice;

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
                    top: '-10px',
                    right: isRTL ? 'auto' : '10px',
                    left: isRTL ? '10px' : 'auto',
                    backgroundColor: colors.mostPopularTag?.bgColor || '#ff0000',
                    color: colors.mostPopularTag?.textColor || '#fff',
                    fontSize: `${colors.mostPopularTag?.fontSize || 11}px`,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: '600',
                  }}
                >
                  Most Popular
                </div>
              )}

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
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    border: `2px solid ${isSelected ? (colors.selectedTier?.borderColor || '#000') : '#ccc'}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {isSelected && (
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
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
                  {hasDiscount && (
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
