import React from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Smart Checkout shell — header, step rail, scrolling body, trust footer.
 *
 * One markup tree serves all three surfaces from the design; which one you get
 * is decided in CSS, not JS, so there is no first-paint flash inside the modal:
 *
 *   - mobile (< 1024px)          single column, compact header, active step label only
 *   - desktop popup (>= 1024px)  wider header, all step labels, optional summary rail
 *   - embedded                   same as desktop but no close button and no fixed height
 *
 * Layout constants are fixed px (--h-modal-max / --h-form-scroll), never vh.
 * The design's HANDOFF calls this out explicitly: vh clipped the Continue
 * button on short browser windows.
 */
export default function ModalShell({
  step,
  totalSteps,
  stepLabels,
  onBack,
  onClose,
  title,
  titleAlign = 'center',
  lang = 'en',
  isRTL = false,
  mode = 'popup',
  summary = null,
  children,
}) {
  const embedded = mode === 'embedded';
  const showBack = step > 1 && step <= totalSteps && typeof onBack === 'function';

  return (
    <div
      className={`jaldi-sc-shell${embedded ? ' is-embedded' : ''}${summary ? ' has-rail' : ''}`}
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="jaldi-sc-header">
        <div className="jaldi-sc-header-row">
          <div className="jaldi-sc-header-slot">
            {showBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t(lang, 'back')}
                className="jaldi-sc-icon-btn"
              >
                <Icon.ArrowLeft size={16} style={isRTL ? { transform: 'scaleX(-1)' } : undefined} />
              </button>
            )}
          </div>

          <div className="jaldi-sc-title-wrap" style={{ textAlign: titleAlign }}>
            <span className="jaldi-sc-title">{title}</span>
            <span className="jaldi-sc-title-badge">
              <Icon.Lock size={10} /> {t(lang, 'smartCheckout')}
            </span>
          </div>

          <div className="jaldi-sc-header-slot jaldi-sc-header-slot-end">
            {!embedded && typeof onClose === 'function' && (
              <button
                type="button"
                onClick={onClose}
                aria-label={t(lang, 'close')}
                className="jaldi-sc-icon-btn"
              >
                <Icon.Close size={14} />
              </button>
            )}
          </div>
        </div>

        {totalSteps > 0 && (
          <StepRail step={step} total={totalSteps} labels={stepLabels} />
        )}
      </div>

      <div className="jaldi-sc-body">
        <div className="jaldi-sc-form-col jaldi-sc-scroll">{children}</div>
        {summary}
      </div>

      <div className="jaldi-sc-footer">
        <Icon.Lock size={11} />
        <span>{t(lang, 'securedByPrefix')}</span>
        <strong>Preventify</strong>
      </div>
    </div>
  );
}

/**
 * Progress rail. Every label is rendered; mobile hides all but the active one
 * in CSS (see .jaldi-sc-step-label in styles.css) so the two layouts stay in
 * sync without a viewport listener.
 */
function StepRail({ step, total, labels }) {
  return (
    <div className="jaldi-sc-rail-steps" role="list">
      {labels.slice(0, total).map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <React.Fragment key={label}>
            <div
              className="jaldi-sc-step"
              role="listitem"
              aria-current={active ? 'step' : undefined}
            >
              <span className={`jaldi-sc-step-pip${done ? ' is-done' : ''}${active ? ' is-active' : ''}`}>
                {done ? <Icon.Check size={12} /> : idx}
              </span>
              <span className={`jaldi-sc-step-label${active ? ' is-active' : ''}${done ? ' is-done' : ''}`}>
                {label}
              </span>
            </div>
            {i < total - 1 && (
              <span className={`jaldi-sc-step-bar${done ? ' is-done' : ''}`} aria-hidden="true" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
