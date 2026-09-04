import React, { useEffect, useRef, useState } from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Success screen.
 *
 * Only shown when the merchant's `redirectMode` is 'none' — the mode that
 * otherwise renders a plain interpolated thank-you message. The other three
 * modes ('shopify', 'custom_page', 'whatsapp') are explicit instructions to
 * leave for another page, so they still redirect immediately; delaying them
 * would cost conversions and risk purchase-pixel attribution.
 */
export default function SuccessStep({
  lang = 'en',
  currencySymbol = '',
  total = 0,
  orderNumber,
  messageHtml,
  onClose,
  onContinueShopping,
  autoCloseSeconds = 0,
}) {
  const [remaining, setRemaining] = useState(autoCloseSeconds);

  useEffect(() => {
    if (!autoCloseSeconds) return undefined;
    if (remaining <= 0) {
      onContinueShopping?.();
      return undefined;
    }
    const timer = setTimeout(() => setRemaining((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining, autoCloseSeconds, onContinueShopping]);

  const timeline = [
    { done: true, label: t(lang, 'timelineOrderPlaced'), when: t(lang, 'timelineJustNow') },
    { done: false, label: t(lang, 'timelineMerchantConfirms'), when: t(lang, 'timelineWithinHour') },
    { done: false, label: t(lang, 'timelineOutForDelivery'), when: '' },
    { done: false, label: t(lang, 'timelinePayOnDelivery'), when: t(lang, 'timelineCashToCourier') },
  ];

  return (
    <div className="jaldi-sc-step-pane jaldi-sc-center">
      <Confetti />

      <div className="jaldi-sc-success-disc">
        <svg viewBox="0 0 60 60" width="48" height="48" aria-hidden="true">
          <path
            d="M16 31l9 9 19-22"
            stroke="#fff"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray="50"
            className="jaldi-sc-checkpath"
          />
        </svg>
      </div>

      <div>
        <h2 className="jaldi-sc-h1">{t(lang, 'orderPlaced')}</h2>
        {messageHtml ? (
          // Merchant-authored template, already interpolated and escaped by
          // order-redirect.js — the template is trusted, the values are not,
          // and interpolate() escapes them before they reach here.
          <div
            className="jaldi-sc-sub jaldi-sc-narrow"
            dangerouslySetInnerHTML={{ __html: messageHtml }}
          />
        ) : (
          <p className="jaldi-sc-sub jaldi-sc-narrow">
            {t(lang, 'orderPlacedBlurb')}{' '}
            <strong>{currencySymbol}{Number(total).toFixed(2)}</strong>
          </p>
        )}
      </div>

      <div className="jaldi-sc-card jaldi-sc-success-card">
        {orderNumber && (
          <div className="jaldi-sc-order-ref">
            <span className="jaldi-sc-eyebrow">{t(lang, 'orderReference')}</span>
            <span className="jaldi-sc-mono jaldi-sc-order-no">#{orderNumber}</span>
          </div>
        )}

        <div className={`jaldi-sc-timeline${orderNumber ? ' has-divider' : ''}`}>
          {timeline.map((s, i) => (
            <div key={i} className="jaldi-sc-tl-row">
              <span className={`jaldi-sc-tl-dot${s.done ? ' is-done' : ''}`}>
                {s.done && <Icon.Check size={9} />}
              </span>
              <span className={`jaldi-sc-tl-label${s.done ? ' is-done' : ''}`}>{s.label}</span>
              {s.when && <span className="jaldi-sc-tl-when">{s.when}</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="jaldi-sc-spacer" />

      <button type="button" onClick={onClose} className="jaldi-sc-cta jaldi-sc-hit">
        {t(lang, 'continueShopping')}
      </button>

      {autoCloseSeconds > 0 && remaining > 0 && (
        <span className="jaldi-sc-redirect-note">
          {t(lang, 'autoRedirectIn')} {remaining}s
        </span>
      )}
    </div>
  );
}

/** Decorative burst; positions computed once so re-renders don't reshuffle. */
function Confetti() {
  const pieces = useRef(null);
  if (pieces.current === null) {
    const palette = [
      'var(--brand)', 'var(--accent-amber)', 'var(--accent-emerald)',
      'var(--accent-pink)', 'var(--accent-indigo)', 'var(--danger)',
    ];
    pieces.current = Array.from({ length: 20 }, (_, i) => ({
      background: palette[i % palette.length],
      '--cx': `${((i * 18) % 360) - 30 + (Math.random() - 0.5) * 80}px`,
      '--cy': `${130 + Math.random() * 60}px`,
      '--cr': `${Math.random() * 720 - 360}deg`,
      animationDelay: `${i * 40}ms`,
      animationDuration: '1600ms',
    }));
  }
  return (
    <div className="jaldi-sc-confetti jaldi-sc-confetti-success" aria-hidden="true">
      {pieces.current.map((style, i) => <span key={i} style={style} />)}
    </div>
  );
}
