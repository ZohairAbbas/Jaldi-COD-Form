import React from 'react';

/**
 * Combo (multi-product) bundle card.
 *
 * Rendered on the storefront by App.jsx AND in the admin editor's live preview,
 * so what the merchant styles is literally what the customer sees. Everything it
 * needs arrives as props — no storefront globals, no data fetching.
 *
 * Pricing is never computed here: the caller passes a `pricing` object from
 * calculateComboPricing() so the widget, the cart items and the draft order all
 * come from one calculation.
 */
export default function ComboWidget({
  combo,
  components,
  pricing,
  currencySymbol = '',
  exchangeRate = null,
  isRTL = false,
  selected = false,
  added = false,
  disabled = false,
  disabledReason = null,
  ctaLabel = 'Add to order',
  onToggle = null,
  onVariantChange = null,
  interactive = true,
}) {
  const styling = combo.styling || {};
  const colors = styling.colors || {};
  const radius = styling.cornerRoundness ?? 12;
  const space = styling.breathingSpace ?? 12;
  const showImages = styling.showImage !== false;
  // Combos saved before the layout option existed have no `layout`: vertical.
  const isHorizontal = styling.layout === 'horizontal';

  if (!components?.length || !pricing) return null;

  const cardColors = selected ? colors.selectedTier : colors.unselectedTier;
  const money = (amount) => {
    const value = exchangeRate ? amount * exchangeRate : amount;
    return `${currencySymbol}${value.toFixed(2)}`;
  };

  return (
    <div
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
        direction: isRTL ? 'rtl' : 'ltr',
        marginBottom: '16px',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      {combo.headerText && (
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
          {!combo.hideHeaderLines && (
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
            {combo.headerText}
          </span>
          {!combo.hideHeaderLines && (
            <div style={{ flex: 1, height: '1px', backgroundColor: '#a2a5a9' }}>&nbsp;</div>
          )}
        </div>
      )}

      <div
        style={{
          border: `2px solid ${cardColors?.borderColor || (selected ? '#000' : '#e0e0e0')}`,
          borderRadius: `${radius}px`,
          padding: `${space}px`,
          background: cardColors?.bgGradient || cardColors?.bgColor || '#ffffff',
          transition: 'border-color 0.15s ease',
        }}
      >
        {/* Component products, separated by a "+". Vertical stacks them as
            rows; horizontal lays them out side by side as columns. */}
        <div
          style={{
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            alignItems: 'stretch',
          }}
        >
          {components.map((component, index) => {
            const line = pricing.lines[index];
            const hasVariantChoice = interactive
              && Array.isArray(component.variants)
              && component.variants.length > 1;

            const imageSize = isHorizontal ? 64 : 56;
            const image = showImages && (
              <div
                style={{
                  width: `${imageSize}px`,
                  height: `${imageSize}px`,
                  flexShrink: 0,
                  borderRadius: '6px',
                  border: '1px solid #e5e5e5',
                  backgroundColor: '#fff',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {component.image ? (
                  <img
                    src={component.image}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <span aria-hidden="true" style={{ fontSize: '20px', opacity: 0.35 }}>🖼️</span>
                )}
              </div>
            );

            const title = (
              <div
                style={{
                  color: colors.tierTitle?.color || '#1b1b1b',
                  fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                  fontWeight: '500',
                  marginBottom: '4px',
                  // Columns are narrow: cap long titles at two lines.
                  ...(isHorizontal && {
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    wordBreak: 'break-word',
                  }),
                }}
              >
                {component.title}
              </div>
            );

            const stock = component.outOfStock && (
              <div style={{ color: '#d72c0d', fontSize: '12px', marginBottom: '4px' }}>
                {component.stockMessage || 'Out of stock'}
              </div>
            );

            const options = (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: isHorizontal ? 'center' : 'flex-start',
                  gap: isHorizontal ? '4px' : '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 7px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0,0,0,0.08)',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: colors.tierTitle?.color || '#1b1b1b',
                  }}
                >
                  ×{line.quantity}
                </span>

                {hasVariantChoice && (
                  <select
                    value={component.selectedVariantId ?? ''}
                    disabled={!onVariantChange}
                    onChange={(e) => onVariantChange?.(index, e.target.value)}
                    aria-label={`Choose an option for ${component.title}`}
                    style={{
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid #c9c9c9',
                      fontSize: '12px',
                      maxWidth: isHorizontal ? '100%' : '160px',
                      minWidth: 0,
                      backgroundColor: '#fff',
                    }}
                  >
                    {component.variants.map((v) => (
                      <option key={v.id} value={v.id}>{v.title}</option>
                    ))}
                  </select>
                )}
              </div>
            );

            const price = (
              <div
                style={{
                  textAlign: isHorizontal ? 'center' : (isRTL ? 'left' : 'right'),
                  flexShrink: 0,
                  color: colors.price?.color || '#1b1b1b',
                  fontSize: `${colors.price?.fontSize || 16}px`,
                  fontWeight: '700',
                  ...(isHorizontal && { marginTop: 'auto', paddingTop: '6px' }),
                }}
              >
                {money(line.discountedPrice)}
              </div>
            );

            return (
              <React.Fragment key={component.productId}>
                {index > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      padding: isHorizontal
                        ? `0 ${Math.max(2, Math.round(space / 4))}px`
                        : `${Math.round(space / 2)}px 0`,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: '1px solid #d9d9d9',
                        backgroundColor: '#ffffff',
                        color: '#1b1b1b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '15px',
                        lineHeight: 1,
                      }}
                    >
                      +
                    </span>
                  </div>
                )}

                {isHorizontal ? (
                  <div
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      gap: '6px',
                      padding: `${Math.round(space * 0.75)}px ${Math.max(4, Math.round(space / 2))}px`,
                      borderRadius: `${Math.max(4, radius - 4)}px`,
                      backgroundColor: 'rgba(0,0,0,0.035)',
                    }}
                  >
                    {image}
                    <div style={{ width: '100%', minWidth: 0 }}>
                      {title}
                      {stock}
                      {options}
                    </div>
                    {price}
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${Math.max(8, space)}px`,
                      padding: `${Math.round(space * 0.75)}px`,
                      borderRadius: `${Math.max(4, radius - 4)}px`,
                      backgroundColor: 'rgba(0,0,0,0.035)',
                    }}
                  >
                    {image}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {title}
                      {stock}
                      {options}
                    </div>
                    {price}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer: "Buy all at:" + total, with the highlight tag riding the corner */}
        <div style={{ position: 'relative', marginTop: `${space}px` }}>
          {combo.showHighlightTag !== false && combo.highlightTag && (
            <span
              style={{
                position: 'absolute',
                top: '-10px',
                [isRTL ? 'left' : 'right']: '10px',
                padding: '3px 10px',
                borderRadius: '5px',
                backgroundColor: colors.badge?.bgColor || '#000000',
                color: colors.badge?.textColor || '#ffffff',
                fontSize: `${colors.badge?.fontSize || 12}px`,
                fontWeight: '600',
                whiteSpace: 'nowrap',
              }}
            >
              {combo.highlightTag}
            </span>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: `${Math.round(space * 0.9)}px`,
              borderRadius: `${Math.max(4, radius - 4)}px`,
              backgroundColor: 'rgba(0,0,0,0.05)',
            }}
          >
            <span
              style={{
                color: colors.tierTitle?.color || '#1b1b1b',
                fontSize: `${colors.tierTitle?.fontSize || 14}px`,
                fontWeight: '700',
              }}
            >
              {combo.footerText || 'Buy all at:'}
            </span>

            <span style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              {combo.showCompareAt !== false && pricing.showCompareAt && (
                <span
                  style={{
                    textDecoration: 'line-through',
                    color: colors.strikethroughPrice?.color || '#999999',
                    fontSize: `${colors.strikethroughPrice?.fontSize || 14}px`,
                  }}
                >
                  {money(pricing.compareAtTotal)}
                </span>
              )}
              <span
                style={{
                  color: colors.price?.color || '#1b1b1b',
                  fontSize: `${(colors.price?.fontSize || 16) + 2}px`,
                  fontWeight: '700',
                }}
              >
                {money(pricing.total)}
              </span>
            </span>
          </div>
        </div>

        {disabled && disabledReason && (
          <div
            role="status"
            style={{
              marginTop: `${Math.round(space * 0.75)}px`,
              padding: '8px 10px',
              borderRadius: '6px',
              backgroundColor: '#fff1f0',
              border: '1px solid #f5c2c0',
              color: '#8e1f11',
              fontSize: '12px',
              textAlign: 'center',
            }}
          >
            {disabledReason}
          </div>
        )}

        <button
          type="button"
          disabled={disabled || !interactive}
          onClick={() => onToggle?.()}
          style={{
            marginTop: `${space}px`,
            width: '100%',
            padding: '14px 16px',
            borderRadius: `${Math.max(4, radius - 4)}px`,
            border: 'none',
            backgroundColor: disabled
              ? '#c9c9c9'
              : (colors.selectedTier?.borderColor || '#000000'),
            color: '#ffffff',
            fontSize: '15px',
            fontWeight: '700',
            cursor: disabled || !interactive ? 'not-allowed' : 'pointer',
          }}
        >
          {/* `added` is the native-checkout confirmation (the products went
              into the Shopify cart); `selected` is the COD path, where the combo
              sits in the form and can be taken back out. */}
          {added ? 'Added ✓' : selected ? 'Remove from order' : ctaLabel}
        </button>
      </div>
    </div>
  );
}
