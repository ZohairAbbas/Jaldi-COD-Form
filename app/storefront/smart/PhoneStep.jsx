import React, { useState, useRef, useEffect } from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Step 1 — phone identity entry.
 *
 * The design splits the country code (in a picker) from the number field, but
 * `validatePhone` requires the stored value to start with the country's
 * phoneCode, and `handleChange` normalizes to `phoneCode + digits`. So this
 * component displays *local* digits and hands the parent local digits back —
 * CODForm re-attaches the prefix. Storage semantics are unchanged.
 */
export default function PhoneStep({
  lang = 'en',
  isRTL = false,
  country,
  countryCode,
  supportedCountries = [],
  enableMultiCountry = false,
  localPhone,
  onPhoneChange,
  onCountryChange,
  error,
  isLoading = false,
  onContinue,
  otpEnabled = true,
}) {
  const canPickCountry = enableMultiCountry && supportedCountries.length > 1;
  const valid = localPhone.replace(/\D/g, '').length >= 7;

  return (
    <div className="jaldi-sc-step-pane">
      <div>
        <h2 className="jaldi-sc-h2">{t(lang, 'continueWithMobile')}</h2>
        <p className="jaldi-sc-sub">{t(lang, 'phoneStepSubtitle')}</p>
      </div>

      <div>
        <label className="jaldi-sc-label" htmlFor="jaldi-sc-phone">
          {t(lang, 'mobileNumber')}
        </label>

        <div className={`jaldi-sc-phone-field${error ? ' has-error' : ''}`}>
          <CountryPicker
            country={country}
            countryCode={countryCode}
            countries={supportedCountries}
            canPick={canPickCountry}
            onChange={onCountryChange}
          />
          <span className="jaldi-sc-phone-sep" aria-hidden="true" />
          <input
            id="jaldi-sc-phone"
            type="tel"
            inputMode="tel"
            name="phone"
            autoComplete="tel-national"
            value={localPhone}
            maxLength={15}
            autoFocus
            dir="ltr"
            onChange={(e) => onPhoneChange(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onContinue();
              }
            }}
            placeholder={country?.phonePlaceholder || '3001234567'}
            className="jaldi-sc-phone-input"
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? 'jaldi-sc-phone-err' : 'jaldi-sc-phone-hint'}
          />
        </div>

        {error ? (
          <div id="jaldi-sc-phone-err" className="jaldi-sc-field-error" role="alert">
            <Icon.Info size={12} /> {error}
          </div>
        ) : (
          <div id="jaldi-sc-phone-hint" className="jaldi-sc-hint">
            <Icon.Info size={12} />
            {t(lang, otpEnabled ? 'phoneStepHintWhatsapp' : 'phoneStepHintPlain')}
          </div>
        )}
      </div>

      <div className="jaldi-sc-spacer" />

      <button
        type="button"
        onClick={onContinue}
        disabled={!valid || isLoading}
        className="jaldi-sc-cta jaldi-sc-hit"
      >
        {isLoading ? (
          <>
            <span className="jaldi-sc-spinner" aria-hidden="true" />
            {t(lang, 'lookingUp')}
          </>
        ) : (
          <>
            {t(lang, 'continue')}
            <Icon.ChevronRight size={14} style={isRTL ? { transform: 'scaleX(-1)' } : undefined} />
          </>
        )}
      </button>
    </div>
  );
}

/**
 * Country selector. Renders as static text when the merchant only supports one
 * country, so the control never suggests a choice that doesn't exist.
 */
function CountryPicker({ country, countryCode, countries, canPick, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocPointer = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!canPick) {
    return (
      <span className="jaldi-sc-country jaldi-sc-country-static">
        <span className="jaldi-sc-iso">{country.code}</span>
        <span className="jaldi-sc-dial">{country.phoneCode}</span>
      </span>
    );
  }

  return (
    <div className="jaldi-sc-country-wrap" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="jaldi-sc-country"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="jaldi-sc-iso">{country.code}</span>
        <span className="jaldi-sc-dial">{country.phoneCode}</span>
        <Icon.ChevronDown size={11} />
      </button>

      {open && (
        <div className="jaldi-sc-country-menu" role="listbox">
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              role="option"
              aria-selected={c.code === countryCode}
              onClick={() => { onChange(c.code); setOpen(false); }}
              className={`jaldi-sc-country-opt${c.code === countryCode ? ' is-selected' : ''}`}
            >
              <span className="jaldi-sc-iso">{c.code}</span>
              <span className="jaldi-sc-country-name">{c.name}</span>
              <span className="jaldi-sc-dial">{c.phoneCode}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
