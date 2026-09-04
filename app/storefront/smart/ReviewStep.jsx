import React from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Step 4 — review and place the order.
 *
 * Carries the design's summary/shipping/discount/totals layout, plus the
 * commerce surfaces the prototype omits but production depends on: one-tick
 * upsells and the alternate payment CTAs (card, PayFast, WhatsApp). Those
 * arrive as slots so their existing logic and merchant config stay in CODForm,
 * and they keep the ordering they have today — upsells immediately above the
 * payment buttons.
 */
export default function ReviewStep({
  lang = 'en',
  items = [],
  currencySymbol = '',
  breakdown = [],
  total = 0,
  deliverTo,
  onEditAddress,
  shippingRates = [],
  selectedShippingRateId,
  onSelectShipping,
  discountNode,
  upsellsNode,
  ctasNode,
  termsNode,
  showSummary = true,
}) {
  const itemCount = items.reduce((sum, i) => sum + (i.quantity || 0), 0);
  const money = (n) => `${currencySymbol}${Number(n).toFixed(2)}`;

  return (
    <div className="jaldi-sc-step-pane">
      <h2 className="jaldi-sc-h2">{t(lang, 'reviewYourOrder')}</h2>

      {deliverTo && (
        <div className="jaldi-sc-card jaldi-sc-row jaldi-sc-deliver">
          <span className="jaldi-sc-icon-tile"><Icon.Pin size={16} /></span>
          <div className="jaldi-sc-row-main">
            <span className="jaldi-sc-eyebrow">
              {t(lang, 'deliverToLabel')}{deliverTo.label ? ` · ${deliverTo.label}` : ''}
            </span>
            <span className="jaldi-sc-deliver-line">{deliverTo.line}</span>
          </div>
          {onEditAddress && (
            <button type="button" className="jaldi-sc-link" onClick={onEditAddress}>
              {t(lang, 'edit')}
            </button>
          )}
        </div>
      )}

      {/* Order summary — hidden on desktop two-column, where the rail carries it */}
      {showSummary && items.length > 0 && (
        <div className="jaldi-sc-summary">
          <div className="jaldi-sc-summary-head">
            <span className="jaldi-sc-summary-title">
              <Icon.Cart size={15} /> {t(lang, 'orderSummary')} · {itemCount}{' '}
              {itemCount === 1 ? t(lang, 'item') : t(lang, 'items')}
            </span>
            <span className="jaldi-sc-summary-total">{money(total)}</span>
          </div>

          <div className="jaldi-sc-summary-items">
            {items.map((item, idx) => (
              <LineItem key={idx} item={item} lang={lang} money={money} />
            ))}
          </div>
        </div>
      )}

      {shippingRates.length > 0 && (
        <div className="jaldi-sc-stack">
          <span className="jaldi-sc-label">{t(lang, 'shipping')}</span>
          {shippingRates.map((rate) => {
            const active = selectedShippingRateId === rate.id;
            return (
              <button
                key={rate.id}
                type="button"
                role="radio"
                aria-checked={active}
                aria-disabled={rate.disabled || undefined}
                disabled={rate.disabled}
                onClick={() => !rate.disabled && onSelectShipping(rate)}
                className={`jaldi-sc-rate jaldi-sc-hit${active ? ' is-selected' : ''}${rate.disabled ? ' is-disabled' : ''}`}
              >
                <span className="jaldi-sc-radio" aria-hidden="true" />
                <span className="jaldi-sc-rate-body">
                  <span className="jaldi-sc-rate-label">{rate.label}</span>
                  {rate.eta && <span className="jaldi-sc-rate-eta">{rate.eta}</span>}
                  {/* Free-shipping nudge copy ("spend X more to unlock"), which
                      the prototype has no equivalent for but merchants configure. */}
                  {rate.message && (
                    <span className={`jaldi-sc-rate-nudge${rate.unlocked ? ' is-unlocked' : ''}`}>
                      {rate.message}
                    </span>
                  )}
                </span>
                <span className={`jaldi-sc-rate-price${rate.price === 0 ? ' is-free' : ''}`}>
                  {rate.priceDisplay || (rate.price === 0 ? t(lang, 'free') : money(rate.price))}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {discountNode}

      {breakdown.length > 0 && (
        <div className="jaldi-sc-card jaldi-sc-breakdown">
          {breakdown.map((row, i) => (
            <div key={i} className="jaldi-sc-breakdown-row">
              <span>{row.label}</span>
              <span className={`jaldi-sc-breakdown-v${row.kind ? ` is-${row.kind}` : ''}`}>
                {row.kind === 'free' ? t(lang, 'free') : row.display || money(row.value)}
              </span>
            </div>
          ))}
          <span className="jaldi-sc-divider" />
          <div className="jaldi-sc-grand">
            <span>{t(lang, 'totalToPayOnDelivery')}</span>
            <span className="jaldi-sc-grand-v">{money(total)}</span>
          </div>
        </div>
      )}

      {upsellsNode}

      <div className="jaldi-sc-ctas">{ctasNode}</div>

      {termsNode && <div className="jaldi-sc-terms">{termsNode}</div>}
    </div>
  );
}

function LineItem({ item, lang, money }) {
  const unit = item.displayPrice != null ? item.displayPrice : item.price;
  const original = item.displayOriginalPrice != null ? item.displayOriginalPrice : item.originalPrice;
  const discounted = item.hasBundleDiscount && original;

  return (
    <div className="jaldi-sc-line">
      {item.image ? (
        <img className="jaldi-sc-thumb" src={item.image} alt="" loading="lazy" />
      ) : (
        <span className="jaldi-sc-thumb jaldi-sc-thumb-empty" aria-hidden="true" />
      )}
      <div className="jaldi-sc-line-body">
        <span className="jaldi-sc-line-title">{item.title}</span>
        <span className="jaldi-sc-line-meta">
          {[item.variant, `${t(lang, 'qty')} ${item.quantity}`].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="jaldi-sc-line-price">
        {discounted ? (
          <>
            <span className="jaldi-sc-was">{money(original)}</span>
            <span className="jaldi-sc-now">{money(unit)}</span>
          </>
        ) : (
          <span>{money(unit * item.quantity)}</span>
        )}
      </div>
    </div>
  );
}
