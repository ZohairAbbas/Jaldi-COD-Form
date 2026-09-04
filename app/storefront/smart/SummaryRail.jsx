import React from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Desktop two-column summary rail.
 *
 * Rendered only at >= 1024px (the shell hides it below that in CSS), so mobile
 * keeps the inline summary card on the review step instead. Content reveals
 * progressively as the buyer advances: address appears once chosen, shipping
 * once picked — matching the prototype's desktop-app.jsx.
 */
export default function SummaryRail({
  lang = 'en',
  items = [],
  currencySymbol = '',
  breakdown = [],
  total = 0,
  address = null,
  shipping = null,
}) {
  const money = (n) => `${currencySymbol}${Number(n).toFixed(2)}`;

  return (
    <aside className="jaldi-sc-rail jaldi-sc-scroll">
      <span className="jaldi-sc-label">{t(lang, 'orderSummary')}</span>

      {items.map((item, idx) => {
        const unit = item.displayPrice != null ? item.displayPrice : item.price;
        return (
          <div key={idx} className="jaldi-sc-card jaldi-sc-rail-item">
            {item.image ? (
              <img className="jaldi-sc-thumb jaldi-sc-thumb-lg" src={item.image} alt="" loading="lazy" />
            ) : (
              <span className="jaldi-sc-thumb jaldi-sc-thumb-lg jaldi-sc-thumb-empty" aria-hidden="true" />
            )}
            <div className="jaldi-sc-line-body">
              <span className="jaldi-sc-line-title">{item.title}</span>
              <span className="jaldi-sc-line-meta">
                {[item.variant, `${t(lang, 'qty')} ${item.quantity}`].filter(Boolean).join(' · ')}
              </span>
              <span className="jaldi-sc-rail-price">{money(unit * item.quantity)}</span>
            </div>
          </div>
        );
      })}

      {address && (
        <div className="jaldi-sc-card jaldi-sc-row jaldi-sc-rail-meta">
          <span className="jaldi-sc-brand-ink"><Icon.Pin size={14} /></span>
          <div className="jaldi-sc-row-main">
            <span className="jaldi-sc-eyebrow">
              {t(lang, 'deliverToLabel')}{address.label ? ` · ${address.label}` : ''}
            </span>
            <span className="jaldi-sc-deliver-line">{address.line}</span>
          </div>
        </div>
      )}

      {shipping && (
        <div className="jaldi-sc-card jaldi-sc-row jaldi-sc-rail-meta">
          <span className="jaldi-sc-brand-ink"><Icon.Truck size={16} /></span>
          <div className="jaldi-sc-row-main">
            <span className="jaldi-sc-rate-label">{shipping.label}</span>
            {shipping.eta && <span className="jaldi-sc-rate-eta">{shipping.eta}</span>}
          </div>
        </div>
      )}

      <div className="jaldi-sc-rail-breakdown">
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
          <span className="jaldi-sc-grand-l">{t(lang, 'totalToPayOnDelivery')}</span>
          <span className="jaldi-sc-grand-v jaldi-sc-grand-v-lg">{money(total)}</span>
        </div>
      </div>
    </aside>
  );
}
