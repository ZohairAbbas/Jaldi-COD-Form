import { useState, useRef } from 'react';

/**
 * PayFastModal
 *
 * Renders two sequential modals:
 * 1. Card details modal — collects card number, expiry, CVV, name, mobile
 * 2. OTP modal — collects the bank-sent OTP and submits the transaction
 *
 * Props:
 *   appPath        — base app proxy path e.g. '/apps/preventify/'
 *   shop           — myshopify domain
 *   orderPayload   — all order fields (customerInfo, address, items, total, etc.)
 *   phone          — pre-filled from form (bank-registered mobile)
 *   config         — storefront config (for button styling etc.)
 *   onSuccess      — called with { order, payfastTransactionId } on success
 *   onClose        — called when user dismisses the modal
 */
export default function PayFastModal({ appPath, shop, orderPayload, phone, config, onSuccess, onClose }) {
  const settings = config?.settings || {};

  // Stage: 'card' | 'otp' | '3ds'
  const [stage, setStage] = useState('card');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Card form state
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryMonth, setExpiryMonth] = useState('');
  const [expiryYear, setExpiryYear] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardPhone, setCardPhone] = useState(phone || '');

  // Transaction session (returned from initiate)
  const sessionRef = useRef(null);

  // OTP
  const [otp, setOtp] = useState('');

  // 3DS HTML
  const [threeDsHtml, setThreeDsHtml] = useState('');

  // ── Card submission ──────────────────────────────────────────────────────────

  const handleCardSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError('');

    // Basic validation
    const rawCard = cardNumber.replace(/\s+/g, '');
    if (rawCard.length < 13 || rawCard.length > 19) {
      setError('Please enter a valid card number.');
      return;
    }
    const month = parseInt(expiryMonth, 10);
    if (!month || month < 1 || month > 12) {
      setError('Please enter a valid expiry month (01–12).');
      return;
    }
    const year = expiryYear.trim();
    if (!year || year.length < 2) {
      setError('Please enter a valid expiry year.');
      return;
    }
    if (!cvv || cvv.length < 3) {
      setError('Please enter a valid CVV.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${appPath}proxy/payfast-initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          ...orderPayload,
          phone: cardPhone || orderPayload.phone,
          email: orderPayload.email,
          cardNumber: rawCard,
          expiryMonth: String(month).padStart(2, '0'),
          expiryYear: year,
          cvv,
          cardName,
          threeDsCallbackUrl: window.location.href,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Card validation failed. Please check your details.');
        return;
      }

      // Store session data for the next step
      sessionRef.current = {
        access_token: result.access_token,
        transaction_id: result.transaction_id,
        eci: result.eci,
        basket_id: result.basket_id,
        txnamt: result.txnamt,
        cardNumber: rawCard,
        expiryMonth: String(month).padStart(2, '0'),
        expiryYear: year,
        cvv,
      };

      if (result.needs3ds) {
        setThreeDsHtml(result.data_3ds_html);
        setStage('3ds');
        return;
      }

      if (result.needsOtp) {
        setStage('otp');
        return;
      }

      // Bank manages OTP internally — proceed directly to transact
      await submitTransaction('');

    } catch (err) {
      console.error('[PayFast] Initiate error:', err);
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── OTP submission ────────────────────────────────────────────────────────────

  const handleOtpSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError('');

    if (!otp || otp.trim().length < 4) {
      setError('Please enter the OTP sent to your registered mobile number.');
      return;
    }

    setIsLoading(true);
    try {
      await submitTransaction(otp.trim());
    } finally {
      setIsLoading(false);
    }
  };

  // ── Core transaction call ─────────────────────────────────────────────────────

  const submitTransaction = async (otpValue) => {
    const session = sessionRef.current;
    if (!session) {
      setError('Session expired. Please restart payment.');
      setStage('card');
      return;
    }

    try {
      const response = await fetch(`${appPath}proxy/payfast-transact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop,
          ...orderPayload,
          phone: cardPhone || orderPayload.phone,
          // PayFast session
          access_token: session.access_token,
          transaction_id: session.transaction_id,
          eci: session.eci,
          basket_id: session.basket_id,
          txnamt: session.txnamt,
          // Card (re-sent to rebuild HMAC on backend)
          cardNumber: session.cardNumber,
          expiryMonth: session.expiryMonth,
          expiryYear: session.expiryYear,
          cvv: session.cvv,
          otp: otpValue,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        if (result.paymentConfirmed) {
          // Payment taken but order creation failed — show special message
          setError(result.error);
          return;
        }
        setError(result.error || 'Payment failed. Please try again.');
        return;
      }

      // Clear card data from memory
      sessionRef.current = null;
      onSuccess(result);

    } catch (err) {
      console.error('[PayFast] Transact error:', err);
      setError('Connection error. Please try again.');
    }
  };

  // ── Card number display formatting ────────────────────────────────────────────

  const formatCardDisplay = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 19);
    return digits.replace(/(.{4})/g, '$1 ').trim();
  };

  // ── Shared overlay styles ─────────────────────────────────────────────────────

  const overlayStyle = {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
  };

  const modalStyle = {
    background: '#fff',
    borderRadius: '12px',
    padding: '24px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
    position: 'relative',
  };

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #d0d0d0',
    borderRadius: '6px',
    fontSize: '15px',
    boxSizing: 'border-box',
    marginTop: '6px',
    outline: 'none',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    color: '#555',
    fontWeight: '500',
    marginBottom: '2px',
  };

  const submitBtnStyle = {
    width: '100%',
    padding: '13px',
    background: settings.payfastButtonBgColor || '#00B140',
    color: settings.payfastButtonTextColor || '#fff',
    fontSize: `${settings.payfastButtonFontSize || 14}px`,
    border: 'none',
    borderRadius: '8px',
    cursor: isLoading ? 'not-allowed' : 'pointer',
    fontWeight: '600',
    marginTop: '8px',
    opacity: isLoading ? 0.7 : 1,
  };

  const closeBtnStyle = {
    position: 'absolute',
    top: '14px',
    right: '16px',
    background: 'none',
    border: 'none',
    fontSize: '20px',
    cursor: 'pointer',
    color: '#999',
    lineHeight: 1,
  };

  // ── 3DS stage ────────────────────────────────────────────────────────────────

  if (stage === '3ds') {
    return (
      <div style={overlayStyle}>
        <div style={{ ...modalStyle, maxWidth: '520px' }}>
          <button style={closeBtnStyle} onClick={onClose} aria-label="Close">×</button>
          <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '12px' }}>
            3D Secure Verification
          </div>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '12px' }}>
            Please complete 3D Secure verification with your bank.
          </p>
          <div
            style={{ width: '100%', minHeight: '340px', border: '1px solid #eee', borderRadius: '8px', overflow: 'hidden' }}
            dangerouslySetInnerHTML={{ __html: threeDsHtml }}
          />
          {error && <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '10px' }}>{error}</div>}
        </div>
      </div>
    );
  }

  // ── OTP stage ────────────────────────────────────────────────────────────────

  if (stage === 'otp') {
    return (
      <div style={overlayStyle}>
        <div style={modalStyle}>
          <button style={closeBtnStyle} onClick={onClose} aria-label="Close">×</button>

          <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '6px' }}>
            Enter OTP
          </div>
          <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
            An OTP has been sent to your bank-registered mobile number. Please enter it below to complete your payment.
          </p>

          <div>
            <label style={labelStyle}>OTP</label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={8}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleOtpSubmit(e); } }}
              placeholder="Enter OTP"
              style={{ ...inputStyle, letterSpacing: '4px', fontSize: '20px', textAlign: 'center' }}
              autoFocus
            />

            {error && (
              <div style={{ color: '#c0392b', fontSize: '13px', marginTop: '10px', padding: '8px', background: '#fdf0ef', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <button type="button" onClick={handleOtpSubmit} style={{ ...submitBtnStyle, marginTop: '16px' }} disabled={isLoading}>
              {isLoading ? 'Verifying...' : 'Verify & Complete Payment'}
            </button>
          </div>

          <button
            onClick={() => { setStage('card'); setError(''); setOtp(''); }}
            style={{ display: 'block', textAlign: 'center', marginTop: '12px', background: 'none', border: 'none', color: '#666', fontSize: '13px', cursor: 'pointer', width: '100%' }}
          >
            ← Back to card details
          </button>
        </div>
      </div>
    );
  }

  // ── Card stage (default) ──────────────────────────────────────────────────────

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <button style={closeBtnStyle} onClick={onClose} aria-label="Close">×</button>

        <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '4px' }}>
          Pay with PayFast
        </div>
        <p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
          Enter your card details to complete payment securely.
        </p>

        <div autoComplete="off">
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Cardholder Name</label>
            <input
              type="text"
              value={cardName}
              onChange={(e) => setCardName(e.target.value)}
              placeholder="Name on card"
              style={inputStyle}
              autoComplete="cc-name"
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Card Number</label>
            <input
              type="tel"
              inputMode="numeric"
              value={cardNumber}
              onChange={(e) => setCardNumber(formatCardDisplay(e.target.value))}
              placeholder="0000 0000 0000 0000"
              maxLength={23}
              style={{ ...inputStyle, letterSpacing: '1px' }}
              autoComplete="cc-number"
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Expiry Month</label>
              <input
                type="tel"
                inputMode="numeric"
                value={expiryMonth}
                onChange={(e) => setExpiryMonth(e.target.value.replace(/\D/g, '').slice(0, 2))}
                placeholder="MM"
                maxLength={2}
                style={inputStyle}
                autoComplete="cc-exp-month"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Expiry Year</label>
              <input
                type="tel"
                inputMode="numeric"
                value={expiryYear}
                onChange={(e) => setExpiryYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="YYYY"
                maxLength={4}
                style={inputStyle}
                autoComplete="cc-exp-year"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>CVV</label>
              <input
                type="password"
                inputMode="numeric"
                value={cvv}
                onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="CVV"
                maxLength={4}
                style={inputStyle}
                autoComplete="cc-csc"
              />
            </div>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Bank-Registered Mobile Number</label>
            <input
              type="tel"
              value={cardPhone}
              onChange={(e) => setCardPhone(e.target.value)}
              placeholder="e.g. 03001234567"
              style={inputStyle}
            />
            <span style={{ fontSize: '11px', color: '#888', marginTop: '3px', display: 'block' }}>
              OTP will be sent to the mobile number registered with your bank.
            </span>
          </div>

          {error && (
            <div style={{ color: '#c0392b', fontSize: '13px', marginBottom: '10px', padding: '8px', background: '#fdf0ef', borderRadius: '6px' }}>
              {error}
            </div>
          )}

          <button type="button" onClick={handleCardSubmit} style={submitBtnStyle} disabled={isLoading}>
            {isLoading ? 'Processing...' : (settings.payfastButtonText || 'PAY WITH PAYFAST')}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '14px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          <span style={{ fontSize: '12px', color: '#888' }}>Secured by PayFast</span>
        </div>
      </div>
    </div>
  );
}
