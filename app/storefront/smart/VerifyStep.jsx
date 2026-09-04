import React, { useEffect, useRef } from 'react';
import Icon from './icons';
import { t } from '../translations';

/**
 * Step 2 — verification.
 *
 * Three variants, matching the design's `trusted` / `walogin` / `waotp` modes.
 * Which one shows is decided by the parent from real lookup state, not a tweak:
 *
 *   trusted  buyer is trusted AND the device fingerprint matched — no message
 *            is sent, we just confirm and move on
 *   walogin  WhatsApp deep-link login (free channel, the default)
 *   waotp    6-digit code, via WhatsApp or SMS (paid fallback)
 *
 * This component is presentational: every network call lives in CODForm.
 */
export default function VerifyStep(props) {
  const { variant } = props;
  if (variant === 'trusted') return <VerifyTrusted {...props} />;
  if (variant === 'otp') return <VerifyOtp {...props} />;
  return <VerifyWhatsAppLogin {...props} />;
}

/* ── Trusted buyer — instant, celebratory ────────────────────────────────── */
function VerifyTrusted({ lang, isRTL, firstName, totalOrders, phase, onContinue, onUseDifferentNumber }) {
  const verified = phase === 'verified';

  return (
    <div className="jaldi-sc-step-pane jaldi-sc-center">
      <div className="jaldi-sc-hero">
        {verified && (
          <>
            <span className="jaldi-sc-hero-ring" />
            <span className="jaldi-sc-hero-ring is-delayed" />
          </>
        )}
        <div className={`jaldi-sc-hero-disc${verified ? ' is-verified' : ''}`}>
          {verified ? <CheckMark size={56} /> : <span className="jaldi-sc-hero-spinner" />}
        </div>
        {verified && <Confetti count={14} radius={80} />}
      </div>

      <span className={`jaldi-sc-badge jaldi-sc-badge-success${verified ? '' : ' is-hidden'}`}>
        <Icon.Shield size={12} /> {t(lang, 'trustedBuyerVerified')}
      </span>

      <div>
        <h2 className="jaldi-sc-h2">
          {verified
            ? `${t(lang, 'welcomeBack')}${firstName ? `, ${firstName}` : ''}`
            : t(lang, 'lookingYouUp')}
        </h2>
        <p className="jaldi-sc-sub jaldi-sc-narrow">
          {verified ? t(lang, 'recognizedNoCode') : t(lang, 'checkingYourNumber')}
        </p>
      </div>

      {/* The design shows three stats; only order count is real data, so that's
          all we show. Delivery rate and buyer rating have no source in the
          trusted-buyer payload and are not invented here. */}
      {verified && totalOrders > 0 && (
        <div className="jaldi-sc-stats">
          <div className="jaldi-sc-stat">
            <span className="jaldi-sc-stat-v">{totalOrders}</span>
            <span className="jaldi-sc-stat-l">{t(lang, 'ordersLabel')}</span>
          </div>
        </div>
      )}

      <div className="jaldi-sc-spacer" />

      <button
        type="button"
        onClick={onContinue}
        disabled={!verified}
        className="jaldi-sc-cta jaldi-sc-hit"
      >
        {t(lang, 'continueToDelivery')}
        <Icon.ChevronRight size={14} style={isRTL ? { transform: 'scaleX(-1)' } : undefined} />
      </button>

      <button type="button" className="jaldi-sc-btn-ghost" onClick={onUseDifferentNumber}>
        {t(lang, 'notYou')} <em>{t(lang, 'useDifferentNumber')}</em>
      </button>
    </div>
  );
}

/* ── WhatsApp deep-link login ────────────────────────────────────────────── */
function VerifyWhatsAppLogin({
  lang,
  phone,
  status,
  error,
  isSending,
  onStart,
  onUseDifferentNumber,
  onFallbackToOtp,
  onSkip,
  canSkip,
}) {
  const verified = status === 'verified';
  const waiting = status === 'waiting';

  return (
    <div className="jaldi-sc-step-pane">
      <div className="jaldi-sc-center-block">
        <div className={`jaldi-sc-wa-disc${verified ? ' is-verified' : ''}`}>
          {verified ? <Icon.Check size={36} /> : <Icon.Whatsapp size={36} />}
          {waiting && <span className="jaldi-sc-hero-ring is-wa" />}
        </div>

        <h2 className="jaldi-sc-h2">
          {verified
            ? t(lang, 'verifiedYoureIn')
            : waiting
              ? t(lang, 'waitingForWhatsapp')
              : t(lang, 'verifyOnWhatsapp')}
        </h2>
        <p className="jaldi-sc-sub jaldi-sc-narrow">
          {waiting ? t(lang, 'whatsappWaitingBlurb') : t(lang, 'whatsappVerifyBlurb')}
        </p>
      </div>

      <div className="jaldi-sc-card jaldi-sc-row">
        <span className="jaldi-sc-wa-ink"><Icon.Whatsapp size={22} /></span>
        <div className="jaldi-sc-row-main">
          <span className="jaldi-sc-eyebrow">{t(lang, 'verifyingAs')}</span>
          <span className="jaldi-sc-mono">{phone}</span>
        </div>
        {!waiting && !verified && (
          <button type="button" className="jaldi-sc-link" onClick={onUseDifferentNumber}>
            {t(lang, 'change')}
          </button>
        )}
      </div>

      {error && (
        <div className="jaldi-sc-alert" role="alert">
          <Icon.Info size={13} /> {error}
        </div>
      )}

      <div className="jaldi-sc-spacer" />

      {!verified && (
        <button
          type="button"
          onClick={onStart}
          disabled={waiting || isSending}
          className="jaldi-sc-cta jaldi-sc-cta-wa jaldi-sc-hit"
        >
          {waiting ? (
            <>
              <span className="jaldi-sc-dots" aria-hidden="true">
                <i /><i /><i />
              </span>
              {t(lang, 'openWhatsAppAgain')}
            </>
          ) : (
            <>
              <Icon.Whatsapp size={20} /> {t(lang, 'openWhatsappToVerify')}
            </>
          )}
        </button>
      )}

      <button type="button" className="jaldi-sc-btn-ghost" onClick={onFallbackToOtp}>
        {t(lang, 'orVerifyWithCode')}
      </button>

      {canSkip && (
        <button type="button" className="jaldi-sc-btn-ghost" onClick={onSkip}>
          {t(lang, 'dontHaveWhatsApp')}
        </button>
      )}
    </div>
  );
}

/* ── 6-digit code ────────────────────────────────────────────────────────── */
function VerifyOtp({
  lang,
  phone,
  method,
  code,
  onCodeChange,
  error,
  isVerifying,
  onVerify,
  onResend,
  countdown,
  isSending,
  onUseDifferentNumber,
  onBack,
}) {
  const refs = useRef([]);
  const digits = code.padEnd(6, ' ').slice(0, 6).split('');

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const setAt = (i, raw) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      // Deletion
      const next = digits.map((d, idx) => (idx === i ? ' ' : d)).join('').trimEnd();
      onCodeChange(next.replace(/ /g, ''));
      return;
    }
    // Paste of a full code: fill from this cell onwards
    const chars = clean.split('');
    const next = [...digits];
    for (let k = 0; k < chars.length && i + k < 6; k += 1) next[i + k] = chars[k];
    const joined = next.join('').replace(/ /g, '');
    onCodeChange(joined);
    const landed = Math.min(i + chars.length, 5);
    refs.current[landed]?.focus();
  };

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && digits[i].trim() === '' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };

  const complete = code.length === 6;

  return (
    <div className="jaldi-sc-step-pane">
      <div>
        <span className={`jaldi-sc-badge ${method === 'sms-otp' ? 'jaldi-sc-badge-muted' : 'jaldi-sc-badge-wa'}`}>
          {method === 'sms-otp'
            ? <>{t(lang, 'sentViaSms')}</>
            : <><Icon.Whatsapp size={12} /> {t(lang, 'sentViaWhatsapp')}</>}
        </span>
        <h2 className="jaldi-sc-h2">{t(lang, 'enterSixDigitCode')}</h2>
        <p className="jaldi-sc-sub">
          {t(lang, 'weSentCodeTo')}{' '}
          <span className="jaldi-sc-mono jaldi-sc-mono-inline">{phone}</span>.{' '}
          <button type="button" className="jaldi-sc-link" onClick={onUseDifferentNumber}>
            {t(lang, 'change')}
          </button>
        </p>
      </div>

      <div className="jaldi-sc-otp">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => { refs.current[i] = el; }}
            value={d.trim()}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            aria-label={`${t(lang, 'enterSixDigitCode')} ${i + 1}`}
            className={`jaldi-sc-otp-cell${error ? ' has-error' : ''}${d.trim() ? ' is-filled' : ''}`}
          />
        ))}
      </div>

      {error && (
        <div className="jaldi-sc-alert" role="alert">
          <Icon.Info size={13} /> {error}
        </div>
      )}

      <div className="jaldi-sc-card jaldi-sc-row jaldi-sc-resend">
        <span className="jaldi-sc-resend-text">
          {countdown > 0 ? (
            <>
              {t(lang, 'resendCodeIn')}{' '}
              <span className="jaldi-sc-mono jaldi-sc-mono-inline">
                0:{String(countdown).padStart(2, '0')}
              </span>
            </>
          ) : (
            t(lang, 'didntReceiveCode')
          )}
        </span>
        <button
          type="button"
          className="jaldi-sc-link"
          disabled={countdown > 0 || isSending}
          onClick={onResend}
        >
          {isSending ? t(lang, 'sending') : t(lang, 'resendCode')}
        </button>
      </div>

      <div className="jaldi-sc-spacer" />

      <button
        type="button"
        onClick={onVerify}
        disabled={!complete || isVerifying}
        className="jaldi-sc-cta jaldi-sc-hit"
      >
        {isVerifying ? (
          <>
            <span className="jaldi-sc-spinner" aria-hidden="true" />
            {t(lang, 'verifying')}
          </>
        ) : (
          t(lang, 'continue')
        )}
      </button>

      <button type="button" className="jaldi-sc-btn-ghost" onClick={onBack}>
        {t(lang, 'backToVerificationOptions')}
      </button>
    </div>
  );
}

/* ── Shared bits ─────────────────────────────────────────────────────────── */

function CheckMark({ size = 56 }) {
  return (
    <svg viewBox="0 0 60 60" width={size} height={size} aria-hidden="true">
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
  );
}

/**
 * Decorative confetti burst. Positions are computed once per mount so a
 * re-render (e.g. the countdown ticking) doesn't reshuffle the pieces.
 */
function Confetti({ count = 14, radius = 80 }) {
  const pieces = useRef(null);
  if (pieces.current === null) {
    const palette = ['var(--brand)', 'var(--accent-amber)', 'var(--accent-emerald)', 'var(--accent-pink)', 'var(--accent-indigo)'];
    pieces.current = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      const dist = radius + Math.random() * 30;
      return {
        background: palette[i % palette.length],
        '--cx': `${Math.cos(angle) * dist}px`,
        '--cy': `${Math.sin(angle) * dist}px`,
        '--cr': `${Math.random() * 540 - 270}deg`,
        animationDelay: `${100 + i * 25}ms`,
      };
    });
  }
  return (
    <div className="jaldi-sc-confetti" aria-hidden="true">
      {pieces.current.map((style, i) => <span key={i} style={style} />)}
    </div>
  );
}
