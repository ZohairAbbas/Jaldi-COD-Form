import React, { useState, useEffect, useRef, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { trackInitiateCheckout, trackAddPaymentInfo, trackAddToCart, getEventId, getAttributionData, trackSnapchatStartCheckout, trackTikTokInitiateCheckout } from './pixels';
import { resolvePixelCurrency, getCurrencySymbolForCurrency, COUNTRIES, validatePhone } from '../lib/constants';
import { getBuyerFromLocalStorage, saveBuyerToLocalStorage, getFingerprint } from './device-recognition';
import { t, fieldTranslations } from './translations';
import { matchesOfferCountry } from './offer-country';
import PayFastModal from './PayFastModal';
import ModalShell from './smart/ModalShell';
import PhoneStep from './smart/PhoneStep';
import VerifyStep from './smart/VerifyStep';
import AddressStep from './smart/AddressStep';
import ReviewStep from './smart/ReviewStep';
import SummaryRail from './smart/SummaryRail';
import SuccessStep from './smart/SuccessStep';
import SmartIcon from './smart/icons';
import { deriveTheme } from './smart/theme';

/**
 * City input with a custom, fully-styled suggestions dropdown.
 *
 * The predefined city list acts as SUGGESTIONS only — the customer can pick one
 * or type any city, so nobody is blocked by "city not found". We render our own
 * dropdown (not a native <datalist>, which browsers render un-styled/ugly and
 * can't be controlled). Keyboard: ↑/↓ to move, Enter to pick, Esc to close.
 */
function CityCombobox({ value, onChange, cities, placeholder, inputStyle, name }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [rect, setRect] = useState(null); // input position for the portalled dropdown
  const wrapRef = useRef(null);
  const inputRef = useRef(null);

  // Filter suggestions by what's typed (case-insensitive substring). Empty input
  // shows the full list. Cap to keep the dropdown snappy on long lists (PAK ~310).
  const query = (value || '').trim().toLowerCase();
  const suggestions = (query
    ? cities.filter((c) => c.toLowerCase().includes(query))
    : cities
  ).slice(0, 50);

  const showList = open && suggestions.length > 0;

  // Compute the dropdown position from the input's viewport rect. The list is
  // portalled to <body> with position:fixed so it escapes the form's
  // overflow:hidden section containers (which would otherwise clip it).
  const updateRect = () => {
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    if (!showList) return undefined;
    updateRect();
    // Keep it anchored while scrolling/resizing. Capture:true catches scrolls on
    // inner scroll containers (the popup form body), not just the window.
    const onReposition = () => updateRect();
    window.addEventListener('scroll', onReposition, true);
    window.addEventListener('resize', onReposition);
    return () => {
      window.removeEventListener('scroll', onReposition, true);
      window.removeEventListener('resize', onReposition);
    };
  }, [showList]);

  // Close when clicking outside (the portalled list is outside wrapRef, so also
  // ignore clicks that land on it — handled via its own onMouseDown preventing blur).
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (
        wrapRef.current && !wrapRef.current.contains(e.target) &&
        !(e.target.closest && e.target.closest('[data-jaldi-city-dropdown]'))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const commit = (city) => {
    onChange(city);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && highlight >= 0 && suggestions[highlight]) {
        e.preventDefault();
        commit(suggestions[highlight]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        style={inputStyle}
      />
      {showList && rect && createPortal(
        <ul
          data-jaldi-city-dropdown
          role="listbox"
          style={{
            position: 'fixed',
            top: rect.bottom + 4,
            left: rect.left,
            width: rect.width,
            margin: 0,
            padding: '4px 0',
            listStyle: 'none',
            background: '#FFFFFF',
            border: '1px solid #D1D5DB',
            borderRadius: '6px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
            maxHeight: '220px',
            overflowY: 'auto',
            zIndex: 2147483647, // above the COD form modal
            fontFamily: 'inherit',
          }}
        >
          {suggestions.map((city, idx) => (
            <li
              key={city}
              role="option"
              aria-selected={idx === highlight}
              // onMouseDown (not onClick) so it fires before the input blur closes the list.
              onMouseDown={(e) => { e.preventDefault(); commit(city); }}
              onMouseEnter={() => setHighlight(idx)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                color: '#111827',
                cursor: 'pointer',
                background: idx === highlight ? '#F3F4F6' : 'transparent',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {city}
            </li>
          ))}
        </ul>,
        document.body
      )}
    </div>
  );
}

export default function CODForm({ config, cart, onSubmit, onClose, onRemoveItem, mode = 'popup', showProductSelection = false, productSelection, onProductSelectionChange, fullCartItemCount = 0, recoveryDiscount = null, detectedCountry = null, realVisitorCountry = null, appPath = '/apps/preventify/', variantMixOosError = false, smartSuccess = null }) {
  // Manual country selection state (for user override)
  const [selectedCountry, setSelectedCountry] = useState(null);

  // One-tick upsells available in the visitor's country. Derived ONCE here and
  // used by every consumer (preselect state, totals, render, submit, draft order)
  // so a country-blocked upsell can never be preselected, priced, or charged
  // while being invisible. Uses the IP-detected country, NOT `selectedCountry`.
  const eligibleOneTickUpsells = useMemo(
    () => (config.upsells?.oneTick || []).filter(u =>
      matchesOfferCountry(u, config.shopDomain, realVisitorCountry)
    ),
    [config.upsells?.oneTick, config.shopDomain, realVisitorCountry]
  );

  // Priority: user-selected > detected > shop default
  const countryCode = selectedCountry || detectedCountry || config.shop?.country || 'PAK';
  const country = COUNTRIES[countryCode] || COUNTRIES.PAK;

  // Get supported countries for dropdown (only in multi-country mode)
  const supportedCountries = config.shop?.enableMultiCountry
    ? (config.shop.supportedCountries || []).map(code => COUNTRIES[code]).filter(Boolean)
    : [country];

  // Use displayed currency symbol from currency converter if available, otherwise fall back to the
  // symbol for the SHOP's actual Shopify currency, and only then to its base country's symbol.
  // Country dropdown is for shipping address, NOT currency conversion - prices stay in shop's base currency.
  // Preferring the real currency matters: a store selling in AED with its country left on another
  // market would otherwise price the whole form in that market's symbol.
  const displayCurrency = cart.items?.find(item => item.displayCurrencySymbol);
  const shopBaseCountry = COUNTRIES[config.shop?.country] || COUNTRIES.PAK;
  const currencySymbol = displayCurrency?.displayCurrencySymbol
    || getCurrencySymbolForCurrency(config.shop?.currencyCode)
    || shopBaseCountry.currencySymbol;
  
  // Language & RTL
  const lang = config.settings?.language || 'en';
  const isRTL = (config.settings?.enableRTL || lang === 'ar') && lang !== 'bilingual';

  // Bilingual field label helper — appends Arabic inline when in bilingual mode
  const getFieldLabel = (field) => {
    if (lang !== 'bilingual') return field.label;
    const enLabel = fieldTranslations.en[field.id]?.label || field.label;
    const arLabel = fieldTranslations.ar[field.id]?.label;
    return arLabel ? `${enLabel} ${arLabel}` : enLabel;
  };
  const isSmartCheckout = config.settings?.enableSmartCheckout === true;
  const otpEnabled = config.settings?.enableOTP === true;

  const [formData, setFormData] = useState({
    fullName: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    address2: '',
    city: '',
    province: '',
    postalCode: '',
    customFields: {},
  });

  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false); // To track submitting state in async callbacks
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);

  // PayFast state
  const [showPayFastModal, setShowPayFastModal] = useState(false);
  const [isPayfastProcessing, setIsPayfastProcessing] = useState(false);

  // OTP verification state
  const [otpStep, setOtpStep] = useState('form'); // 'form' | 'otp' | 'whatsapp'
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [pendingOrderData, setPendingOrderData] = useState(null);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [buyerData, setBuyerData] = useState(null); // Global buyer lookup result
  const [selectedAddressId, setSelectedAddressId] = useState(null); // Address picker selection
  const [editingAddressId, setEditingAddressId] = useState(null); // Which address card is in edit mode
  const [editFormData, setEditFormData] = useState({}); // Edit form state: { label, address, city, province, postalCode }
  const [isSavingAddress, setIsSavingAddress] = useState(false); // Saving indicator for edit form
  const [focusedOtpIndex, setFocusedOtpIndex] = useState(-1);
  const otpInputRefs = useRef([]);

  // WhatsApp verification state
  const [waLoginToken, setWaLoginToken] = useState(null);
  const [waLoginDeepLink, setWaLoginDeepLink] = useState(null);
  const [waLoginStatus, setWaLoginStatus] = useState('idle'); // 'idle' | 'waiting' | 'verified'
  const [verifyMethod, setVerifyMethod] = useState('whatsapp-login'); // 'whatsapp-login' | 'whatsapp-otp' | 'sms-otp'
  const [waError, setWaError] = useState('');
  const waPollingRef = useRef(null);
  const [pendingAction, setPendingAction] = useState(null); // 'cod' | 'card' — what to do after verification
  const pendingCardPayloadRef = useRef(null); // Stores card draft order payload for post-verification submission

  // One-Tick Upsells state
  const [selectedUpsells, setSelectedUpsells] = useState(() => {
    // Initialize with preselected upsells, country-eligible ones only — a
    // preselected upsell that's hidden in this country must never start ticked.
    const oneTickUpsells = (config.upsells?.oneTick || []).filter(u =>
      matchesOfferCountry(u, config.shopDomain, realVisitorCountry)
    );
    return oneTickUpsells
      .filter(u => u.preselectUpsell)
      .reduce((acc, u) => ({ ...acc, [u.id]: true }), {});
  });

  // Country detection can resolve AFTER mount (the initializer above runs once).
  // Drop any selection that is no longer eligible, so a late-arriving country
  // can't leave an invisible upsell ticked and charged.
  useEffect(() => {
    const eligibleIds = new Set(eligibleOneTickUpsells.map(u => u.id));
    setSelectedUpsells(prev => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([id]) => eligibleIds.has(id))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [eligibleOneTickUpsells]);

  // Discount code state
  const [discountCodeInput, setDiscountCodeInput] = useState('');
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);
  const [discountError, setDiscountError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState(null);

  // Shipping rate state
  const [selectedShippingRate, setSelectedShippingRate] = useState(null);

  // Generate and store session ID
  const [sessionId] = useState(() => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // Track session when user starts filling form
  const trackSession = async (email, phone) => {
    try {
      await fetch(`${appPath}proxy/session-track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shop: config.shopDomain,
          sessionId,
          email,
          phone,
          cartItems: cart.items,
          totalAmount: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          formData,
        }),
      });
    } catch (error) {
      console.error('Session tracking failed:', error);
    }
  };

  // Track InitiateCheckout event when form first opens
  useEffect(() => {
    const currency = resolvePixelCurrency({ shopCurrencyCode: config.shop?.currencyCode, country: config.shop?.country });
    trackInitiateCheckout(cart, currency);
    trackSnapchatStartCheckout(cart, currency);
    trackTikTokInitiateCheckout(cart, currency);

    // Fire CAPI InitiateCheckout server-side
    try {
      const attribution = getAttributionData();
      fetch(`${appPath}proxy/pixel-initiate-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: config.shopDomain,
          items: cart.items.map(item => ({ variantId: item.variantId || item.id, id: item.id })),
          total: cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          currency,
          pixelAttribution: attribution,
        }),
      }).catch(() => {});
    } catch (e) {
      // Don't block form open if CAPI call fails
    }
  }, []); // Only run once on mount

  // Two-step checkout state
  // Smart Checkout runs the design's multi-step flow:
  //   'phone' → 'verify' → 'address' → 'review' → 'success'
  // The basic form has no steps and stays on 'details' for its whole lifetime,
  // which is what gates its (unchanged) single-page render below.
  const [checkoutStep, setCheckoutStep] = useState(isSmartCheckout ? 'phone' : 'details');

  // Identity verification is its own step now, rather than an overlay fired at
  // submit time. `isVerified` records that it already happened so the submit
  // handlers don't ask a second time; `verificationTag` remembers HOW, since
  // the order payload needs it and executePendingAction no longer computes it
  // on the step-2 path.
  const [isVerified, setIsVerified] = useState(false);
  const [verificationTag, setVerificationTag] = useState(null);

  // Address step: pick a saved address or type a new one.
  const [addressMode, setAddressMode] = useState('saved');

  // The success screen is driven by the `smartSuccess` prop, which App sets
  // only for redirectMode 'none' — the other modes navigate away instead.
  const [isFingerprintMatched, setIsFingerprintMatched] = useState(false);
  const [isTransitioningStep, setIsTransitioningStep] = useState(false);
  const fingerprintRef = useRef(null);
  const [step2SummaryOpen, setStep2SummaryOpen] = useState(true);
  const [shippingMethodOpen, setShippingMethodOpen] = useState(true);

  // Device recognition: pre-fill phone only (buyer lookup happens on "Continue" click)
  // Layer 1: localStorage (instant) — pre-fill phone field
  // Layer 2: ThumbmarkJS fingerprint — start background computation + fallback phone pre-fill
  useEffect(() => {
    if (!isSmartCheckout) return; // Skip device recognition for basic 1-step checkout

    let cancelled = false;

    // Layer 1: Check localStorage for saved phone
    const lsData = getBuyerFromLocalStorage();
    if (lsData?.phone) {
      setFormData(prev => ({ ...prev, phone: lsData.phone }));
    }

    // Start fingerprint computation in background (cached for later use in handleContinueToStep2)
    getFingerprint().then(fp => {
      if (!cancelled) fingerprintRef.current = fp;
    }).catch(() => {});

    // Layer 2: If no localStorage, try fingerprint-based phone pre-fill
    if (!lsData?.phone) {
      getFingerprint().then(async (fp) => {
        if (!fp || cancelled) return;
        fingerprintRef.current = fp;
        try {
          const response = await fetch(`${appPath}proxy/device-lookup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprintId: fp }),
          });
          const data = await response.json();
          if (!cancelled && data.phone) {
            setFormData(prev => ({ ...prev, phone: prev.phone || data.phone }));
          }
        } catch {
          // Non-critical: fingerprint lookup failed silently
        }
      }).catch(() => {});
    }

    return () => { cancelled = true; };
  }, []); // Only run once on mount

  // Track when email or phone is entered (session tracking + AddPaymentInfo pixel event)
  useEffect(() => {
    const email = formData.email || null;
    const phone = formData.phone && formData.phone !== country.phoneCode ? formData.phone : null;

    if (email || phone) {
      trackSession(email, phone);

      // Track AddPaymentInfo pixel event
      const currency = resolvePixelCurrency({ shopCurrencyCode: config.shop?.currencyCode, country: config.shop?.country });
      trackAddPaymentInfo(cart, currency);
    }
  }, [formData.email, formData.phone]);

  // Update phone code when country changes
  useEffect(() => {
    setFormData(prev => {
      // Only update if phone is empty or has old country code
      if (!prev.phone || prev.phone === '' || Object.values(COUNTRIES).some(c => prev.phone.startsWith(c.phoneCode))) {
        return { ...prev, phone: country.phoneCode };
      }
      return prev;
    });
  }, [country.phoneCode]);

  // OTP countdown timer
  useEffect(() => {
    if (otpCountdown <= 0) return;
    const timer = setInterval(() => {
      setOtpCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [otpCountdown]);

  // WhatsApp login status polling
  useEffect(() => {
    if (waLoginStatus !== 'waiting' || !waLoginToken) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${appPath}proxy/wa-login-status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: waLoginToken }),
        });
        const data = await response.json();

        if (data.status === 'verified') {
          clearInterval(pollInterval);
          setWaLoginStatus('verified');
          // Either advances to the address step or places the pending order,
          // depending on where verification was triggered from.
          await handleVerificationSuccess();
        } else if (data.status === 'expired') {
          clearInterval(pollInterval);
          setWaLoginStatus('idle');
          setWaError(t(lang, 'verificationTimeout'));
        }
      } catch {
        // Silently retry on network errors
      }
    }, 2000);

    waPollingRef.current = pollInterval;

    // Stop polling after 5 minutes
    const timeout = setTimeout(() => {
      clearInterval(pollInterval);
      setWaLoginStatus('idle');
      setWaError(t(lang, 'verificationTimeout'));
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(pollInterval);
      clearTimeout(timeout);
    };
  }, [waLoginStatus, waLoginToken]);

  // Pre-fetch WhatsApp login token + deep link when verification screen shows.
  // This way the "Verify with WhatsApp" button can navigate synchronously via
  // window.location.href — no async gap, no popup blocker, no extra tab on iOS.
  useEffect(() => {
    if (otpStep !== 'whatsapp' || waLoginToken || waLoginDeepLink) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${appPath}proxy/wa-login-init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: formData.phone }),
        });
        const data = await response.json();
        if (!cancelled && data.token && data.deepLink) {
          setWaLoginToken(data.token);
          setWaLoginDeepLink(data.deepLink);
        }
      } catch {
        // Will be retried when user taps the button
      }
    })();
    return () => { cancelled = true; };
  }, [otpStep]);

  // Step 1 → Step 2: Validate phone, fire buyer lookup + fingerprint check, transition
  const handleContinueToStep2 = async () => {
    const phone = formData.phone;

    // Validate phone format
    if (!phone || phone === country.phoneCode) {
      setErrors({ phone: t(lang, 'phoneRequired') });
      return;
    }
    const phoneValidation = validatePhone(phone, country.code, phoneValidationOptions);
    if (!phoneValidation.isValid) {
      setErrors({ phone: phoneValidation.message });
      return;
    }

    setErrors({});
    setIsTransitioningStep(true);

    // Decided inside the try (where the lookup result is in scope) and applied
    // in the finally. Reading buyerData/isFingerprintMatched there wouldn't
    // work — those setState calls haven't flushed yet.
    let nextStep = 'verify';

    try {
      // Get fingerprint (from cache or compute now)
      const fingerprintId = fingerprintRef.current || await getFingerprint().catch(() => null);
      if (fingerprintId) fingerprintRef.current = fingerprintId;

      // Buyer lookup with fingerprint match check
      const response = await fetch(`${appPath}proxy/buyer-lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, fingerprintId: fingerprintId || undefined }),
      });
      const data = await response.json();

      if (data.buyer) {
        setBuyerData(data.buyer);
        setIsFingerprintMatched(data.fingerprintMatch === true);
        nextStep = resolveStepAfterPhone(data.buyer, data.fingerprintMatch === true);

        if (data.buyer.trustLevel === 'trusted' && data.buyer.address) {
          // Trusted buyer — full address autofill
          setFormData(prev => ({
            ...prev,
            firstname: prev.firstname || data.buyer.firstName || '',
            lastname: prev.lastname || data.buyer.lastName || '',
            email: prev.email || data.buyer.email || '',
            address: prev.address || data.buyer.address?.address || '',
            address2: prev.address2 || data.buyer.address?.address2 || '',
            city: prev.city || data.buyer.address?.city || data.buyer.lastCity || '',
            province: prev.province || data.buyer.address?.province || data.buyer.lastProvince || '',
            postalCode: prev.postalCode || data.buyer.address?.postalCode || '',
          }));
        } else if (data.buyer.trustLevel === 'recognized') {
          // Recognized buyer — preview only (firstName, city, province)
          setFormData(prev => ({
            ...prev,
            firstname: prev.firstname || data.buyer.firstName || '',
            city: prev.city || data.buyer.city || '',
            province: prev.province || data.buyer.province || '',
          }));
        }
      } else {
        setBuyerData(null);
        setIsFingerprintMatched(false);
        nextStep = resolveStepAfterPhone(null, false);
      }
    } catch (error) {
      console.error('Step 1 lookup failed:', error);
      // On error, still proceed with empty data (safe fallback)
      setBuyerData(null);
      setIsFingerprintMatched(false);
      nextStep = resolveStepAfterPhone(null, false);
    } finally {
      setIsTransitioningStep(false);
      setCheckoutStep(nextStep);
    }
  };

  // Go back to Step 1 (phone entry)
  const handleBackToPhone = () => {
    setCheckoutStep('phone');
    setBuyerData(null);
    setIsFingerprintMatched(false);
    setSelectedAddressId(null);
    setIsVerified(false);
    setVerificationTag(null);
    resetVerification();
    // Keep formData intact so user doesn't lose entered data
  };

  /**
   * Which step follows phone entry.
   *
   * Verification is skipped entirely when the merchant has OTP switched off —
   * the rail then renders three steps instead of four rather than showing a
   * step with nothing to do.
   */
  function resolveStepAfterPhone(buyer, fingerprintMatch) {
    if (!otpEnabled) return 'address';
    // A trusted buyer on a recognised device still goes through step 2, but it
    // resolves instantly and sends no message — that's the design's `trusted`
    // variant, and it's where "Welcome back" lives.
    if (buyer?.trustLevel === 'trusted' && fingerprintMatch) return 'verify';
    return 'verify';
  }

  /**
   * Called when identity is confirmed, by any of the three routes.
   *
   * Two callers with different needs: the step-2 flow just advances, while the
   * legacy submit-time overlay (still used when a buyer reaches Place Order
   * unverified) has a pending order to place. `pendingAction` distinguishes
   * them — executePendingAction is a no-op without it.
   */
  const handleVerificationSuccess = async (skipped = false, explicitTag = null) => {
    const tag = explicitTag
      || (skipped
        ? 'verification_skipped'
        : verifyMethod === 'whatsapp-login'
          ? 'whatsapp_verified'
          : verifyMethod === 'whatsapp-otp'
            ? 'whatsapp_otp_verified'
            : 'sms_otp_verified');

    setIsVerified(true);
    setVerificationTag(tag);

    if (pendingAction) {
      await executePendingAction(skipped);
      return;
    }

    // Step-2 path: clear the verification UI state and move to the address step.
    setOtpStep('form');
    setOtpCode('');
    setOtpError('');
    setWaError('');
    setCheckoutStep('address');
  };

  // Send OTP to customer's phone
  const handleSendOtp = async () => {
    setIsSendingOtp(true);
    setOtpError('');
    setOtpCode('');
    try {
      const response = await fetch(`${appPath}proxy/otp-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: config.shopDomain, phone: formData.phone }),
      });
      const data = await response.json();
      if (data.success) {
        setOtpStep('otp');
        setOtpCountdown(60); // 60 second cooldown for resend
      } else {
        setOtpError(data.error || t(lang, 'failedToSendOTP'));
      }
    } catch (error) {
      setOtpError(t(lang, 'failedToSendOTP'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Verify OTP and submit order
  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setOtpError('Please enter the 6-digit code');
      return;
    }
    setIsVerifyingOtp(true);
    setOtpError('');
    try {
      const response = await fetch(`${appPath}proxy/otp-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: config.shopDomain, phone: formData.phone, otp: otpCode }),
      });
      const data = await response.json();
      if (data.success) {
        // OTP verified — advance, or place the pending order.
        await handleVerificationSuccess();
      } else {
        setOtpError(data.error || t(lang, 'invalidOTP'));
      }
    } catch (error) {
      setOtpError(t(lang, 'somethingWentWrong'));
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Open WhatsApp deep link: on mobile use location.href (native app handles it,
  // no leftover tab), on desktop use window.open (keeps the store tab in place).
  const openWhatsAppLink = (url) => {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  };

  // Initialize WhatsApp login session (free channel)
  const handleWhatsAppLogin = async () => {
    setWaError('');

    if (waLoginDeepLink && waLoginToken) {
      // Deep link already pre-fetched — open WhatsApp.
      setWaLoginStatus('waiting');
      openWhatsAppLink(waLoginDeepLink);
      return;
    }

    // Pre-fetch hasn't completed yet — fetch now with loading indicator.
    setIsSendingOtp(true);
    try {
      const response = await fetch(`${appPath}proxy/wa-login-init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone }),
      });
      const data = await response.json();
      if (data.token && data.deepLink) {
        setWaLoginToken(data.token);
        setWaLoginDeepLink(data.deepLink);
        setWaLoginStatus('waiting');
        openWhatsAppLink(data.deepLink);
      } else {
        setWaError(data.error || t(lang, 'failedWhatsAppVerification'));
      }
    } catch {
      setWaError(t(lang, 'failedWhatsAppVerification'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Send OTP via WhatsApp (paid fallback)
  const handleSendWhatsAppOtp = async () => {
    setIsSendingOtp(true);
    setOtpError('');
    setOtpCode('');
    try {
      const response = await fetch(`${appPath}proxy/wa-otp-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop: config.shopDomain, phone: formData.phone }),
      });
      const data = await response.json();
      if (data.success) {
        setVerifyMethod('whatsapp-otp');
        setOtpStep('otp');
        setOtpCountdown(60);
      } else {
        setWaError(data.error || t(lang, 'failedWhatsAppOTP'));
      }
    } catch {
      setWaError(t(lang, 'failedWhatsAppOTP'));
    } finally {
      setIsSendingOtp(false);
    }
  };

  // Switch to SMS OTP (most expensive fallback) — disabled, re-enable when smsmobileapi is active
  // const handleSwitchToSmsOtp = async () => {
  //   setVerifyMethod('sms-otp');
  //   await handleSendOtp(); // Existing SMS OTP handler
  // };

  // Reset WhatsApp verification state
  const resetVerification = () => {
    setOtpStep('form');
    setOtpCode('');
    setOtpError('');
    setWaError('');
    setWaLoginToken(null);
    setWaLoginDeepLink(null);
    setWaLoginStatus('idle');
    setVerifyMethod('whatsapp-login');
    setFocusedOtpIndex(-1);
    setIsSubmitting(false);
    isSubmittingRef.current = false;
    setIsRedirectingToCheckout(false);
    setPendingOrderData(null);
    setPendingAction(null);
    pendingCardPayloadRef.current = null;
    if (waPollingRef.current) {
      clearInterval(waPollingRef.current);
    }
  };

  // Register device fingerprint + localStorage after a successful order
  // Non-blocking: runs async but never throws (fire-and-forget)
  const registerDeviceAfterOrder = (phone, firstName) => {
    if (!phone) return;

    // Layer 1: Save to localStorage immediately (sync, instant)
    saveBuyerToLocalStorage(phone, firstName || '');

    // Layer 2: Register ThumbmarkJS fingerprint with server (async)
    getFingerprint().then(fingerprintId => {
      if (!fingerprintId) return;
      fetch(`${appPath}proxy/device-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprintId, phone }),
      }).catch(() => {}); // Silently ignore network errors
    }).catch(() => {}); // Silently ignore fingerprint errors
  };

  // Execute pending action after verification (COD or Card)
  // verificationTag: which verification path was used (or skipped)
  const executePendingAction = async (skipped = false) => {
    // Determine the verification tag based on how the user verified
    const verificationTag = skipped
      ? 'verification_skipped'
      : verifyMethod === 'whatsapp-login'
        ? 'whatsapp_verified'
        : verifyMethod === 'whatsapp-otp'
          ? 'whatsapp_otp_verified'
          : 'sms_otp_verified';

    if (pendingAction === 'cod' && pendingOrderData) {
      try {
        await onSubmit({ ...pendingOrderData, verificationMethod: verificationTag });
        // Order succeeded — register device for future one-tap checkout
        registerDeviceAfterOrder(pendingOrderData.phone, pendingOrderData.firstName);
      } catch (error) {
        console.error('Order submission error:', error);
        if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
          setErrors(error.fieldErrors);
          resetVerification();
        } else {
          setWaError(t(lang, 'somethingWentWrong'));
        }
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    } else if (pendingAction === 'card' && pendingCardPayloadRef.current) {
      try {
        const response = await fetch(`${appPath}proxy/draft-order`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...pendingCardPayloadRef.current, verificationMethod: verificationTag }),
        });
        const result = await response.json();
        if (result.success && result.invoiceUrl) {
          // Card checkout created — register device before redirecting
          registerDeviceAfterOrder(pendingCardPayloadRef.current?.customerInfo?.phone, pendingCardPayloadRef.current?.customerInfo?.firstName);
          window.location.href = result.invoiceUrl;
        } else {
          setWaError(result.error || t(lang, 'failedCheckout'));
          setIsRedirectingToCheckout(false);
          setIsSubmitting(false);
          isSubmittingRef.current = false;
        }
      } catch (error) {
        console.error('Pay with Card error:', error);
        setWaError(t(lang, 'somethingWentWrong'));
        setIsRedirectingToCheckout(false);
        setIsSubmitting(false);
        isSubmittingRef.current = false;
      }
    }
  };

  const formStyle = {
    backgroundColor: config.formConfig.backgroundColor,
    color: config.formConfig.textColor,
    fontSize: `${config.formConfig.fontSize}px`,
    borderRadius: mode === 'popup' ? `${config.formConfig.borderRadius}px` : '0',
    border: mode === 'popup' ? 'none' : `${config.formConfig.borderWidth}px solid ${config.formConfig.borderColor}`,
    boxShadow: mode === 'popup' ? 'none' : `0 ${config.formConfig.shadowIntensity}px ${config.formConfig.shadowIntensity * 2}px rgba(0,0,0,0.1)`,
    padding: '0',
    maxWidth: mode === 'popup' ? '560px' : '100%',
    width: '100%',
    maxHeight: mode === 'popup' ? '90vh' : 'auto',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    direction: isRTL ? 'rtl' : 'ltr',
  };

  const visibleSections = config.formConfig.sections
    .filter(s => s.visible)
    .sort((a, b) => a.order - b.order);

  const visibleFields = config.formConfig.fields
    .filter(f => f.visible && f.section === 'shipping-address')
    .sort((a, b) => a.order - b.order);

  // Merchant-configured phone validation overrides (min/max digits, error msg)
  const phoneFieldConfig = config.formConfig.fields.find(f => f.id === 'phone') || {};
  const phoneValidationOptions = {
    minDigits: phoneFieldConfig.phoneMinDigits,
    maxDigits: phoneFieldConfig.phoneMaxDigits,
    errorMessage: phoneFieldConfig.phoneErrorMessage,
  };

  // One-tap banner: true when all required fields are filled via device recognition
  const allRequiredFieldsFilled = buyerData?.trustLevel === 'trusted' &&
    visibleFields
      .filter(f => f.required && f.id !== 'discount-code')
      .every(f => {
        const fieldId = f.id.replace(/-/g, '');
        const val = formData[fieldId];
        return val && val.trim() !== '' && val !== country.phoneCode;
      });

  const handleChange = (fieldId, value) => {
    // Special handling for phone field
    if (fieldId === 'phone') {
      // Ensure country phone code prefix is always present
      if (!value.startsWith(country.phoneCode)) {
        value = country.phoneCode;
      }
      // Only allow numbers after country code
      const codeLength = country.phoneCode.length;
      const digitsOnly = value.slice(codeLength).replace(/\D/g, '');
      value = country.phoneCode + digitsOnly;
      // Clear buyer lookup when phone changes
      setBuyerData(null);
    }

    setFormData(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when user types
    if (errors[fieldId]) {
      setErrors(prev => ({ ...prev, [fieldId]: null }));
    }
  };

  const handleCustomFieldChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      customFields: { ...prev.customFields, [fieldId]: value },
    }));
    // Clear error when user edits (errors are keyed by full field id)
    if (errors[fieldId]) {
      setErrors(prev => ({ ...prev, [fieldId]: null }));
    }
  };

  // Check if cart has any bundle items (for blocking discount codes on bundles)
  const hasBundleInCart = cart.items.some(item => item.hasBundleDiscount || item.hasCartDiscount);
  const discountBlockedByBundle = hasBundleInCart && config.settings?.allowDiscountOnBundles === false;

  const handleApplyDiscount = async () => {
    const code = discountCodeInput.trim();
    if (!code) return;

    // Block discount codes on bundles if setting is disabled
    if (discountBlockedByBundle) {
      setDiscountError(t(lang, 'discountNotAllowedOnBundles'));
      return;
    }

    setIsValidatingDiscount(true);
    setDiscountError('');

    try {
      const response = await fetch(`${appPath}proxy/validate-discount`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: config.shopDomain,
          code,
          subtotal,
          itemCount: cart.items.reduce((sum, item) => sum + item.quantity, 0),
        }),
      });

      const result = await response.json();

      if (result.valid) {
        setAppliedDiscount({
          code: result.code,
          title: result.title,
          discountType: result.discountType,
          discountValue: result.discountValue,
          discountAmount: result.discountAmount,
        });
        setDiscountError('');
      } else {
        setDiscountError(result.error || t(lang, 'invalidDiscountCode'));
        setAppliedDiscount(null);
      }
    } catch (error) {
      setDiscountError(t(lang, 'invalidDiscountCode'));
      setAppliedDiscount(null);
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  // Apply a saved address from the address picker
  const handleAddressSelect = (addressId) => {
    if (addressId === 'new') {
      // Clear address fields so user can type a new one
      setSelectedAddressId('new');
      setFormData(prev => ({
        ...prev,
        address: '',
        address2: '',
        city: '',
        province: '',
        postalCode: '',
      }));
      return;
    }

    const selected = buyerData?.addresses?.find(a => a.id === addressId);
    if (!selected) return;

    setSelectedAddressId(addressId);
    setFormData(prev => ({
      ...prev,
      address: selected.address || '',
      address2: selected.address2 || '',
      city: selected.city || '',
      province: selected.province || '',
      postalCode: selected.postalCode || '',
    }));

    // Clear any address-related errors
    setErrors(prev => ({
      ...prev,
      address: null,
      city: null,
      province: null,
    }));
  };

  // Open edit mode for an address card
  const handleEditAddress = (e, a) => {
    e.stopPropagation(); // Don't trigger address select
    setEditingAddressId(a.id);
    setEditFormData({
      label: a.label || '',
      firstName: buyerData?.firstName || formData.firstName || '',
      lastName: buyerData?.lastName || formData.lastName || '',
      email: buyerData?.email || formData.email || '',
      address: a.address || '',
      address2: a.address2 || '',
      city: a.city || '',
      province: a.province || '',
      postalCode: a.postalCode || '',
    });
  };

  const handleCancelEdit = (e) => {
    e?.stopPropagation();
    setEditingAddressId(null);
    setEditFormData({});
  };

  // Save edited address to server and update local buyerData
  const handleSaveAddress = async (e, addressId) => {
    e.stopPropagation();
    setIsSavingAddress(true);
    try {
      const response = await fetch(`${appPath}proxy/address-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: formData.phone,
          addressId,
          ...editFormData,
        }),
      });
      const result = await response.json();
      if (result.success) {
        // Update local buyerData so UI reflects change immediately
        setBuyerData(prev => ({
          ...prev,
          firstName: editFormData.firstName || prev.firstName,
          lastName: editFormData.lastName || prev.lastName,
          email: editFormData.email || prev.email,
          addresses: prev.addresses.map(a =>
            a.id === addressId ? { ...a, ...editFormData } : a
          ),
        }));
        // If this is the currently selected address, update the form fields too
        const isSelected = selectedAddressId === addressId || (!selectedAddressId && buyerData?.addresses?.find(a => a.id === addressId)?.isDefault);
        if (isSelected) {
          setFormData(prev => ({
            ...prev,
            firstName: editFormData.firstName || prev.firstName,
            lastName: editFormData.lastName || prev.lastName,
            fullName: [editFormData.firstName, editFormData.lastName].filter(Boolean).join(' ') || prev.fullName,
            email: editFormData.email || prev.email,
            address: editFormData.address || prev.address,
            address2: editFormData.address2 || prev.address2,
            city: editFormData.city || prev.city,
            province: editFormData.province || prev.province,
            postalCode: editFormData.postalCode || prev.postalCode,
          }));
        }
        setEditingAddressId(null);
        setEditFormData({});
      }
    } catch {
      // Silently fail — user still has original data
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (e, addressId) => {
    e.stopPropagation();
    try {
      const response = await fetch(`${appPath}proxy/address-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: formData.phone, addressId }),
      });
      const result = await response.json();
      if (result.success) {
        setBuyerData(prev => ({
          ...prev,
          addresses: prev.addresses.filter(a => a.id !== addressId),
        }));
        // If the deleted address was selected, switch to 'new'
        if (selectedAddressId === addressId) {
          handleAddressSelect('new');
        }
      }
    } catch {
      // Silently fail
    }
  };

  const handleRemoveDiscount = () => {
    setAppliedDiscount(null);
    setDiscountCodeInput('');
    setDiscountError('');
  };

  const validate = () => {
    const newErrors = {};

    visibleFields.forEach(field => {
      // Discount code field is handled by its own Apply flow, skip standard validation
      if (field.id === 'discount-code') return;

      // Phone is validated on its own step and never re-rendered afterwards, so
      // an error here would point at a field the buyer cannot see.
      if (field.id === 'phone' && isSmartCheckout && checkoutStep !== 'phone') return;

      // Title fields are presentational (no input) — never validate
      if (field.type === 'title') return;

      if (field.required) {
        const value = field.id.startsWith('custom-')
          ? formData.customFields?.[field.id]
          : formData[field.id.replace(/-/g, '')];

        // Handle non-string values (checkbox boolean, quantity number) safely
        const isEmpty =
          value === undefined ||
          value === null ||
          value === false ||
          (typeof value === 'string' && value.trim() === '');

        if (isEmpty) {
          newErrors[field.id] = config.formConfig.requiredFieldErrorText;
        }
      }

      // Special validation for phone field
      if (field.id === 'phone') {
        const phoneValue = formData.phone;
        if (!phoneValue || phoneValue === country.phoneCode) {
          newErrors['phone'] = t(lang, 'phoneRequired');
        } else {
          const phoneValidation = validatePhone(phoneValue, country.code, phoneValidationOptions);
          if (!phoneValidation.isValid) newErrors['phone'] = phoneValidation.message;
        }
      }

      // Min/max length validation for text fields (skip phone — own rules).
      // Only runs when a value is present; emptiness is handled by required above.
      if (field.type === 'text' && field.id !== 'phone' && !newErrors[field.id]) {
        const rawValue = field.id.startsWith('custom-')
          ? formData.customFields?.[field.id]
          : formData[field.id.replace(/-/g, '')];
        const strValue = typeof rawValue === 'string' ? rawValue.trim() : '';
        if (strValue !== '') {
          const min = parseInt(field.minLength, 10);
          const max = parseInt(field.maxLength, 10);
          const tooShort = Number.isFinite(min) && min > 0 && strValue.length < min;
          const tooLong = Number.isFinite(max) && max > 0 && strValue.length > max;
          if (tooShort || tooLong) {
            newErrors[field.id] = field.errorText?.trim()
              || config.formConfig.invalidFieldErrorText;
          }
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Block submission if variant mix has out-of-stock items
    if (variantMixOosError) return;

    // Synchronous guard - prevent multiple rapid submissions
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!validate()) {
      isSubmittingRef.current = false; //reset if validation fails
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    // Add selected one-tick upsells to cart items
    const selectedOneTickItems = eligibleOneTickUpsells
      .filter(upsell => selectedUpsells[upsell.id])
      .map(upsell => {
        // If connected to a product, use product details but with upsell price
        if (upsell.product) {
          return {
            id: upsell.product.id,
            title: upsell.product.title,
            price: upsell.upsellPrice, // Use the upsell price, not product price
            productPrice: upsell.product.price, // Keep original product price for discount calculation
            quantity: 1,
            image: upsell.product.image,
            variantId: upsell.product.variantId,
            isOneTickUpsell: true,
            upsellId: upsell.id,
          };
        }
        // If not connected to a product, use upsell title and price
        return {
          id: `upsell-${upsell.id}`,
          title: upsell.upsellTitle,
          price: upsell.upsellPrice,
          quantity: 1,
          image: upsell.imageUrl || null,
          variantId: null,
          isOneTickUpsell: true,
          upsellId: upsell.id,
        };
      });

    // Get pixel attribution data and event ID for server-side tracking
    const attributionData = getAttributionData();
    const pixelEventId = getEventId();

    // Get first and last name from form data
    // Form input uses lowercase keys (e.g. "firstname" from "first-name" field id)
    let derivedFirstName = formData.firstname || formData.firstName || '';
    let derivedLastName = formData.lastname || formData.lastName || '';

    // If last name is empty, try to split first name into first and last
    if (!derivedLastName || derivedLastName.trim() === '') {
      const nameParts = derivedFirstName.trim().split(/\s+/);
      if (nameParts.length > 1) {
        derivedFirstName = nameParts[0];
        derivedLastName = nameParts.slice(1).join(' ');
      } else {
        derivedLastName = derivedFirstName;
      }
    }

    // Transform cart items for submission
    // For bundle items (Pumper Bundles), we need to:
    // 1. Keep the original quantity (e.g., 3)
    // 2. Use the original per-unit price (originalPrice / quantity) so Shopify shows correct line total
    // 3. Pass the bundle discount separately so it shows as a discount line in Shopify
    // Example: originalPrice=3075, quantity=3, discountedPrice=2152.50
    //   -> perUnitPrice = 3075/3 = 1025/ea
    //   -> Shopify shows: 3 × Rs.1,025/ea = Rs.3,075
    //   -> bundleDiscount = 3075 - 2152.50 = 922.50 (shown separately)
    const transformedCartItems = cart.items.map(item => {
      if (item.hasBundleDiscount && item.originalPrice) {
        // Calculate per-unit price from ORIGINAL total (not discounted)
        // originalPrice is the total before discount (e.g., 3075 for 3 items)
        const perUnitOriginalPrice = item.originalPrice / item.quantity;
        // Calculate the bundle discount amount
        const bundleDiscountAmount = item.originalPrice - item.price;

        return {
          ...item,
          price: perUnitOriginalPrice, // Per-unit ORIGINAL price so Shopify shows full price
          // quantity stays the same (e.g., 3)
          bundleDiscount: bundleDiscountAmount, // Pass discount to show separately
          originalBundlePrice: item.price, // Keep discounted bundle total for reference
        };
      }
      return item;
    });

    // Detect Shopify Markets currency from cart items
    const marketItem = cart.items.find(i => i.isShopifyMarkets && i.displayCurrencyCode);

    // Snapshot of currency detection state at order submission time (for backend debugging)
    const bucksEl = document.querySelector('.buckscc-converted[bucks-current]');
    const currencyDebug = {
      detector: marketItem ? 'ShopifyMarkets' : bucksEl ? 'Bucks' : 'none',
      shopifyCurrencyActive: window.Shopify?.currency?.active || null,
      shopifyCurrencyRate: window.Shopify?.currency?.rate || null,
      bucksElFound: !!bucksEl,
      bucksCurrency: bucksEl?.getAttribute('bucks-currency') || null,
      itemDisplayCurrencies: [...new Set(cart.items.map(i => i.displayCurrencyCode).filter(Boolean))],
      presentmentCurrencyCode: marketItem?.displayCurrencyCode || null,
    };

    const orderData = {
      shop: config.shopDomain,
      sessionId: sessionId, // Include session ID for abandoned cart tracking
      firstName: derivedFirstName,
      lastName: derivedLastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      address2: formData.address2,
      city: formData.city,
      province: formData.province,
      postalCode: formData.postalCode || formData.postalcode,
      country: country.name,
      countryCode: country.code,
      items: [...transformedCartItems, ...selectedOneTickItems],
      customFields: formData.customFields,
      shippingCost: shippingCost,
      shippingRateId: selectedShippingRate?.id,
      shippingRateName: selectedShippingRate?.name,
      // Recovery discount from downsell (if any)
      // Use the pre-calculated amount from App.jsx, not the local recalculation
      recoveryDiscount: recoveryDiscount ? {
        type: recoveryDiscount.type,
        value: recoveryDiscount.value,
        amount: recoveryDiscount.amount, // Use the amount calculated when downsell was accepted
        downsellId: recoveryDiscount.downsellId,
      } : null,
      // User-entered discount code (if validated and applied)
      userDiscount: appliedDiscount ? {
        code: appliedDiscount.code,
        discountType: appliedDiscount.discountType,
        discountValue: appliedDiscount.discountValue,
        amount: userDiscountAmount,
      } : null,
      // Pixel tracking data for server-side CAPI
      pixelEventId,
      pixelAttribution: attributionData,
      // Shopify Markets: pass presentment currency so the order is created in the correct currency
      ...(marketItem ? { presentmentCurrencyCode: marketItem.displayCurrencyCode } : {}),
      // Currency debug snapshot for server-side logging
      currencyDebug,
    };

    console.log('[Preventify Debug]', 'cod-order-submit', {
      currencyDebug,
      itemCount: orderData.items.length,
      items: orderData.items.map(item => ({
        variantId: item.variantId,
        price: item.price,
        isShopifyMarkets: item.isShopifyMarkets || false,
        displayCurrencyCode: item.displayCurrencyCode || null,
      })),
      phoneLast4: orderData.phone?.slice(-4),
    });

    // If OTP/verification is enabled, trigger WhatsApp-first verification.
    // Skipped when the buyer already verified at step 2 of Smart Checkout, and
    // for trusted buyers (verified within 90 days + have previous orders).
    if (config.settings?.enableOTP && !isVerified && (!isSmartCheckout || !(buyerData?.trustLevel === 'trusted' && isFingerprintMatched))) {
      setPendingOrderData(orderData);
      setPendingAction('cod');
      setOtpStep('whatsapp'); // Show WhatsApp verification screen
      // Don't setIsSubmitting(false) here — it stays true until verification completes or user cancels
      return;
    }

    // OTP disabled or skipped for trusted buyer — submit directly
    // Determine why OTP was skipped so we can still tag the order correctly
    const bypassTag = !config.settings?.enableOTP
      ? undefined                  // OTP disabled entirely — no verification tag
      : verificationTag            // verified at step 2 — carry how they did it
        || 'trusted_buyer_verified'; // bypassed for trusted+fingerprint-matched buyer

    try {
      await onSubmit({ ...orderData, verificationMethod: bypassTag });
      // Order succeeded — register device for future one-tap checkout
      registerDeviceAfterOrder(orderData.phone, orderData.firstName);
    } catch (error) {
      console.error('Order submission error:', error);
      if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        const firstErrorField = Object.keys(error.fieldErrors)[0];
        const errorElement = document.querySelector(`[name="${firstErrorField}"]`);
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        }
      } else {
        setSubmitError(error.message || t(lang, 'failedCheckout'));
      }
      // Only reset on error — on success, the page navigates away so the guard
      // must stay locked to prevent duplicate submissions during redirect.
      setIsSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Handle Pay with Card - creates a draft order with all discounts and redirects to Shopify checkout
  const handlePayWithCard = async () => {
    if (variantMixOosError) return;
    if (!validate()) {
      return;
    }

    setIsRedirectingToCheckout(true);
    setSubmitError('');

    try {
      // Parse full name into first/last name
      let firstName = formData.firstname || formData.firstName || '';
      let lastName = formData.lastname || formData.lastName || '';

      const fullNameValue = formData.fullName || formData.fullname || '';
      if (fullNameValue.trim()) {
        const nameParts = fullNameValue.trim().split(/\s+/);
        if (nameParts.length === 1) {
          firstName = nameParts[0];
          lastName = nameParts[0];
        } else {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        }
      }

      if (!lastName || lastName.trim() === '') {
        const nameParts = firstName.trim().split(/\s+/);
        if (nameParts.length > 1) {
          firstName = nameParts[0];
          lastName = nameParts.slice(1).join(' ');
        } else {
          lastName = firstName;
        }
      }

      // Transform cart items for draft order.
      // The draft order line item uses the variant's actual Shopify price (not compare_at).
      // Apps like Pumper modify the variant price, so we must calculate the discount
      // as: (variantShopifyPrice × quantity) - bundleTotalPrice.
      // If variantShopifyPrice is not available, fall back to originalPrice / quantity.
      const transformedItems = cart.items.map(item => {
        if (item.hasBundleDiscount && item.originalPrice) {
          // Use actual Shopify variant price if available, otherwise fall back to compare_at-based original
          const perUnitVariantPrice = item.variantShopifyPrice || (item.originalPrice / item.quantity);
          const shopifyTotal = perUnitVariantPrice * item.quantity;
          const bundleDiscountAmount = shopifyTotal - item.price;
          return {
            ...item,
            price: perUnitVariantPrice,
            bundleDiscount: bundleDiscountAmount > 0 ? bundleDiscountAmount : 0,
          };
        }
        return item;
      });

      // Include one-tick upsells (country-eligible only, matching the form)
      const selectedOneTickItems = eligibleOneTickUpsells
        .filter(u => selectedUpsells[u.id] && u.product)
        .map(u => ({
          variantId: u.product.variantId,
          title: u.product.title,
          quantity: 1,
          price: u.upsellPrice || 0,
          productPrice: u.product.price,
          isOneTickUpsell: true,
        }));

      const allItems = [...transformedItems, ...selectedOneTickItems];

      // Calculate card discount if enabled — base it on the effective total after bundle discounts,
      // including pre/post purchase upsells but excluding one-tick upsells.
      const cardSettings = config.settings || {};
      let cardDiscountAmount = 0;
      if (cardSettings.cardDiscountEnabled && cardSettings.cardDiscountValue > 0) {
        const effectiveTotal = allItems.reduce((sum, item) => {
          if (item.isOneTickUpsell) return sum;
          const lineTotal = item.price * (item.quantity || 1);
          const lineBundleDiscount = item.bundleDiscount || 0;
          return sum + lineTotal - lineBundleDiscount;
        }, 0);
        if (cardSettings.cardDiscountType === 'percentage') {
          cardDiscountAmount = effectiveTotal * (cardSettings.cardDiscountValue / 100);
        } else {
          cardDiscountAmount = Math.min(cardSettings.cardDiscountValue, effectiveTotal);
        }
        cardDiscountAmount = parseFloat(cardDiscountAmount.toFixed(2));
      }

      // Detect Shopify Markets currency from cart items
      const draftMarketItem = cart.items.find(i => i.isShopifyMarkets && i.displayCurrencyCode);

      // Snapshot of currency detection state at draft order submission time
      const draftBucksEl = document.querySelector('.buckscc-converted[bucks-current]');
      const draftCurrencyDebug = {
        detector: draftMarketItem ? 'ShopifyMarkets' : draftBucksEl ? 'Bucks' : 'none',
        shopifyCurrencyActive: window.Shopify?.currency?.active || null,
        shopifyCurrencyRate: window.Shopify?.currency?.rate || null,
        bucksElFound: !!draftBucksEl,
        bucksCurrency: draftBucksEl?.getAttribute('bucks-currency') || null,
        itemDisplayCurrencies: [...new Set(cart.items.map(i => i.displayCurrencyCode).filter(Boolean))],
        presentmentCurrencyCode: draftMarketItem?.displayCurrencyCode || null,
      };

      console.log('[Preventify Debug]', 'card-order-submit', {
        currencyDebug: draftCurrencyDebug,
        itemCount: allItems.length,
        cardDiscount: cardDiscountAmount,
        phoneLast4: (formData.phone || '').slice(-4),
      });

      const cardPayload = {
        shop: config.shopDomain,
        items: allItems,
        customFields: formData.customFields || {},
        customerInfo: {
          firstName,
          lastName,
          email: formData.email || '',
          phone: formData.phone || '',
        },
        address: {
          address: formData.address || '',
          address2: formData.address2 || '',
          city: formData.city || '',
          province: formData.province || '',
          postalCode: formData.postalcode || formData.postalCode || '',
          country: country.name || 'Pakistan',
        },
        recoveryDiscount: recoveryDiscount ? {
          type: recoveryDiscount.type,
          value: recoveryDiscount.value,
          amount: recoveryDiscountAmount,
          downsellId: recoveryDiscount.downsellId,
        } : null,
        userDiscount: appliedDiscount ? {
          code: appliedDiscount.code,
          discountType: appliedDiscount.discountType,
          discountValue: appliedDiscount.discountValue,
          amount: userDiscountAmount,
        } : null,
        cardDiscount: cardDiscountAmount > 0 ? { amount: cardDiscountAmount } : null,
        shippingCost: shippingCost,
        shippingRateName: selectedShippingRate?.name,
        // Shopify Markets: pass presentment currency for draft order
        ...(draftMarketItem ? { presentmentCurrencyCode: draftMarketItem.displayCurrencyCode } : {}),
        // Currency debug snapshot for server-side logging
        currencyDebug: draftCurrencyDebug,
      };

      // Gate card payment behind verification too, with the same exemptions:
      // already verified at step 2, or a trusted fingerprint-matched buyer.
      if (config.settings?.enableOTP && !isVerified && (!isSmartCheckout || !(buyerData?.trustLevel === 'trusted' && isFingerprintMatched))) {
        pendingCardPayloadRef.current = cardPayload;
        setPendingAction('card');
        setOtpStep('whatsapp');
        // Don't reset isRedirectingToCheckout — stays true until verification completes or user cancels
        return;
      }

      const cardBypassTag = !config.settings?.enableOTP
        ? undefined
        : verificationTag || 'trusted_buyer_verified';
      const response = await fetch(`${appPath}proxy/draft-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cardPayload, verificationMethod: cardBypassTag }),
      });

      const result = await response.json();

      if (result.success && result.invoiceUrl) {
        // Card checkout created — register device before redirecting
        registerDeviceAfterOrder(formData.phone, firstName);
        window.location.href = result.invoiceUrl;
      } else {
        setSubmitError(result.error || t(lang, 'failedCheckout'));
        setIsRedirectingToCheckout(false);
      }
    } catch (error) {
      console.error('Pay with Card error:', error);
      setSubmitError(t(lang, 'somethingWentWrong'));
      setIsRedirectingToCheckout(false);
    }
  };

  // Handle Pay with PayFast — opens the PayFast card modal after form validation
  const handlePayWithPayFast = () => {
    if (variantMixOosError) return;
    if (!validate()) return;
    setSubmitError('');
    setShowPayFastModal(true);
  };

  // Build the order payload that PayFastModal will send to the backend
  const buildPayfastOrderPayload = () => {
    const items = cart.items.map(item => ({
      variantId: item.variantId,
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      originalPrice: item.originalPrice,
      hasBundleDiscount: item.hasBundleDiscount,
      variantShopifyPrice: item.variantShopifyPrice,
      bundleDiscount: item.hasBundleDiscount && item.originalPrice
        ? Math.max(0, (item.variantShopifyPrice || (item.originalPrice / item.quantity)) * item.quantity - item.price)
        : 0,
      isShopifyMarkets: item.isShopifyMarkets || false,
      displayCurrencyCode: item.displayCurrencyCode || null,
    }));

    let firstName = formData.firstName || formData.firstname || '';
    let lastName = formData.lastName || formData.lastname || '';
    const fullNameValue = formData.fullName || formData.fullname || '';
    if (fullNameValue.trim()) {
      const parts = fullNameValue.trim().split(/\s+/);
      firstName = parts[0];
      lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    }
    if (!lastName) lastName = firstName;

    const effectiveCountry = selectedCountry || detectedCountry || config?.shop?.country || 'PAK';

    return {
      firstName,
      lastName,
      email: formData.email || '',
      phone: formData.phone || '',
      address: formData.address || '',
      address2: formData.address2 || '',
      city: formData.city || '',
      province: formData.province || '',
      postalCode: formData.postalCode || formData.postalcode || '',
      country: COUNTRIES[effectiveCountry]?.name || 'Pakistan',
      countryCode: effectiveCountry,
      items,
      total: cart.total,
      shippingCost: selectedShippingRate?.price || 0,
      shippingRateName: selectedShippingRate?.name || 'Standard Shipping',
      shippingRateId: selectedShippingRate?.id || null,
      recoveryDiscount: recoveryDiscount || null,
      userDiscount: appliedDiscount || null,
      presentmentCurrencyCode: cart.items.find(i => i.isShopifyMarkets)?.displayCurrencyCode || null,
      customFields: formData.customFields || {},
      sessionId: sessionId || null,
      verificationMethod: null,
      pixelEventId: getEventId(),
      pixelAttribution: getAttributionData(),
    };
  };

  // Called by PayFastModal on successful payment + order creation
  const handlePayfastSuccess = (result) => {
    setShowPayFastModal(false);
    setIsPayfastProcessing(false);
    // Reuse CODForm's existing onSubmit success flow with the created order data
    if (onSubmit) {
      onSubmit({
        paymentMethod: 'payfast',
        order: result.order,
        payfastTransactionId: result.payfastTransactionId,
      });
    }
  };

  // Icon components - black filled, matching EasySell's Bootstrap icon style
  const iconStyle = { flexShrink: 0, pointerEvents: 'none' };

  const PersonIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000" style={iconStyle}>
      <path d="M11 6a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
      <path fillRule="evenodd" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm8-7a7 7 0 0 0-5.468 11.37C3.242 11.226 4.805 10 8 10s4.757 1.225 5.468 2.37A7 7 0 0 0 8 1z" />
    </svg>
  );

  const PhoneIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000" style={iconStyle}>
      <path fillRule="evenodd" d="M1.885.511a1.745 1.745 0 0 1 2.61.163L6.29 2.98c.329.423.445.974.315 1.494l-.547 2.19a.678.678 0 0 0 .178.643l2.457 2.457a.678.678 0 0 0 .644.178l2.189-.547a1.745 1.745 0 0 1 1.494.315l2.306 1.794c.829.645.905 1.87.163 2.611l-1.034 1.034c-.74.74-1.846 1.065-2.877.702a18.634 18.634 0 0 1-7.01-4.42 18.634 18.634 0 0 1-4.42-7.009c-.362-1.03-.037-2.137.703-2.877L1.885.511z" />
    </svg>
  );

  const EmailIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000" style={iconStyle}>
      <path d="M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555ZM0 4.697v7.104l5.803-3.558L0 4.697ZM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757ZM16 11.801V4.697l-5.803 3.546L16 11.801Z" />
    </svg>
  );

  const LocationIcon = () => (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="#000000" style={iconStyle}>
      <path fillRule="evenodd" d="M12.166 8.94c-.524 1.062-1.234 2.12-1.96 3.07A31.493 31.493 0 0 1 8 14.58a31.481 31.481 0 0 1-2.206-2.57c-.726-.95-1.436-2.008-1.96-3.07C3.304 7.867 3 6.862 3 6a5 5 0 0 1 10 0c0 .862-.305 1.867-.834 2.94zM8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10z" />
      <path d="M8 8a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm0 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  );

  const renderField = (field) => {
    const fieldId = field.id.replace(/-/g, '');
    // Custom fields store their value in formData.customFields keyed by the full
    // (hyphenated) field id — that's what validation and order submission read.
    // Core/Shopify fields use a flat, de-hyphenated key on formData.
    const isCustom = field.id.startsWith('custom-');
    const value = isCustom
      ? (formData.customFields?.[field.id] ?? '')
      : (formData[fieldId] || '');
    // Route changes to the correct store so values are actually captured/submitted.
    const setFieldValue = (val) =>
      isCustom ? handleCustomFieldChange(field.id, val) : handleChange(fieldId, val);
    const error = errors[field.id];

    const hasIcon = ['full-name', 'first-name', 'last-name', 'email', 'phone', 'address', 'city'].includes(field.id);

    // Smart Checkout restyles every field type through these six shared style
    // objects rather than per-branch, so the design lands on custom fields and
    // selects too. Layout differs from the basic form: the label sits ABOVE the
    // input as a small uppercase eyebrow, and the leading icon chip is dropped.
    const inputStyle = isSmartCheckout ? {
      width: '100%',
      padding: 'var(--pad-input)',
      borderRadius: 'var(--radius)',
      border: 'none',
      // 16px stops iOS Safari zooming the page when the field takes focus
      fontSize: '16px',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-medium)',
      color: 'var(--ink)',
      backgroundColor: 'transparent',
      outline: 'none',
      flex: 1,
      minWidth: 0,
    } : {
      width: '100%',
      padding: '10px 12px',
      borderRadius: '0',
      border: 'none',
      fontSize: '14px',
      fontFamily: 'inherit',
      color: '#111827',
      backgroundColor: '#FFFFFF',
      outline: 'none',
      flex: 1,
    };

    const inputGroupStyle = isSmartCheckout ? {
      display: 'flex',
      alignItems: 'center',
      borderRadius: 'var(--radius)',
      border: error ? '1.5px solid var(--danger)' : '1px solid var(--line)',
      backgroundColor: 'var(--surface)',
      overflow: 'hidden',
      flex: 1,
    } : {
      display: 'flex',
      alignItems: 'center',
      borderRadius: '4px',
      border: error ? '1px solid #EF4444' : '1px solid #D1D5DB',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      flex: 1,
    };

    // The design has no leading icon chip — the label carries the meaning.
    const iconContainerStyle = isSmartCheckout ? { display: 'none' } : {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 12px',
      backgroundColor: '#E9ECEF',
      borderRight: '1px solid #D1D5DB',
      borderLeft: 'none',
      alignSelf: 'stretch',
    };

    const labelStyle = isSmartCheckout ? {
      display: 'block',
      fontSize: 'var(--fs-3xs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--muted)',
      letterSpacing: '0.5px',
      textTransform: 'uppercase',
      width: 'auto',
      minWidth: 0,
      marginBottom: 'var(--sp-2)',
      lineHeight: '1.3',
    } : {
      display: 'flex',
      alignItems: 'center',
      fontSize: '14px',
      fontWeight: '600',
      color: '#000000',
      width: '100px',
      minWidth: '100px',
      flexShrink: 0,
      lineHeight: '1.3',
    };

    const fieldRowStyle = isSmartCheckout ? {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
      gap: '0',
      marginBottom: 'var(--sp-5)',
    } : {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '16px',
    };

    const errorStyle = isSmartCheckout ? {
      color: 'var(--danger)',
      fontSize: 'var(--fs-2xs)',
      fontWeight: 'var(--fw-semi)',
      marginTop: 'var(--sp-2)',
    } : {
      color: '#EF4444',
      fontSize: '12px',
      marginTop: '4px',
    };

    const getFieldIcon = (fieldId) => {
      if (fieldId === 'full-name' || fieldId === 'first-name' || fieldId === 'last-name') return <PersonIcon />;
      if (fieldId === 'email') return <EmailIcon />;
      if (fieldId === 'phone') return <PhoneIcon />;
      if (fieldId === 'address' || fieldId === 'city') return <LocationIcon />;
      return null;
    };

    // Special rendering for discount-code field
    if (field.id === 'discount-code') {
      const isDiscountDisabled = discountBlockedByBundle || !!appliedDiscount || isValidatingDiscount;

      return (
        <div key={field.id} style={{ marginBottom: '16px' }}>
          <div className="jaldi-field-row" style={fieldRowStyle}>
            <label className="jaldi-field-label" style={labelStyle}>
              {getFieldLabel(field)}
            </label>

            {/* Input + Apply button row */}
            <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
              <div style={{ ...inputGroupStyle, opacity: isDiscountDisabled ? 0.6 : 1 }}>
                <input
                  type="text"
                  value={discountCodeInput}
                  onChange={(e) => {
                    setDiscountCodeInput(e.target.value.toUpperCase());
                    if (discountError) setDiscountError('');
                  }}
                  placeholder={discountBlockedByBundle ? t(lang, 'notAllowedOnBundles') : (field.placeholder || t(lang, 'discountCode'))}
                  disabled={isDiscountDisabled}
                  style={inputStyle}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleApplyDiscount();
                    }
                  }}
                />
              </div>
              <button
                type="button"
                onClick={handleApplyDiscount}
                disabled={!discountCodeInput.trim() || isDiscountDisabled}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#000000',
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                  fontWeight: '600',
                  cursor: (!discountCodeInput.trim() || isDiscountDisabled)
                    ? 'not-allowed' : 'pointer',
                  opacity: (!discountCodeInput.trim() || isDiscountDisabled)
                    ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                  minWidth: '80px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isValidatingDiscount ? (
                  <div className="jaldi-loading" style={{ width: '16px', height: '16px' }}></div>
                ) : t(lang, 'apply')}
              </button>
            </div>
          </div>

          {/* Error message */}
          {discountError && (
            <div style={{ ...errorStyle, marginInlineStart: '108px' }}>{discountError}</div>
          )}

          {/* Applied discount tag/chip */}
          {appliedDiscount && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              marginInlineStart: '108px',
              padding: '4px 10px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '16px',
              fontSize: '13px',
              color: '#166534',
              fontWeight: '500',
            }}>
              <span>&#x25C7;</span>
              <span>{appliedDiscount.code}</span>
              <button
                type="button"
                onClick={handleRemoveDiscount}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#166534',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: '600',
                  padding: '0 2px',
                  lineHeight: '1',
                }}
              >
                &times;
              </button>
            </div>
          )}
        </div>
      );
    }

    switch (field.type) {
      case 'text':
        // City: when the selected country has a predefined city list, render a
        // free-text input backed by a <datalist> so the list acts as SUGGESTIONS
        // (customers can pick or type any city — never blocked by "city not
        // found"). Falls through to the plain text input when no list exists.
        if (field.id === 'city' && country.cities && country.cities.length > 0) {
          return (
            <div key={field.id} style={{ marginBottom: '0' }}>
              <div className="jaldi-field-row" style={fieldRowStyle}>
                <label className="jaldi-field-label" style={labelStyle}>
                  {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
                </label>
                <div style={{ flex: 1 }}>
                  <div style={inputGroupStyle}>
                    {hasIcon && (
                      <div style={iconContainerStyle}>
                        {getFieldIcon(field.id)}
                      </div>
                    )}
                    <CityCombobox
                      name={field.id}
                      value={value}
                      onChange={setFieldValue}
                      cities={country.cities}
                      placeholder={field.placeholder || 'City'}
                      inputStyle={inputStyle}
                    />
                  </div>
                  {error && <div style={errorStyle}>{error}</div>}
                </div>
              </div>
            </div>
          );
        }
        return (
          <div key={field.id} style={{ marginBottom: '0' }}>
            <div className="jaldi-field-row" style={fieldRowStyle}>
              <label className="jaldi-field-label" style={labelStyle}>
                {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={inputGroupStyle}>
                  {hasIcon && (
                    <div style={iconContainerStyle}>
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  {field.id === 'phone' && (
                    <span style={{
                      padding: '0 6px 0 10px',
                      fontSize: '14px',
                      color: '#111827',
                      fontFamily: 'inherit',
                      whiteSpace: 'nowrap',
                      userSelect: 'none',
                    }}>
                      {country.phoneCode}
                    </span>
                  )}
                  <input
                    type={field.id === 'phone' ? 'tel' : field.id === 'email' ? 'email' : 'text'}
                    name={field.id}
                    value={field.id === 'phone' ? value.slice(country.phoneCode.length) : value}
                    onChange={(e) => field.id === 'phone' ? handleChange(fieldId, country.phoneCode + e.target.value) : setFieldValue(e.target.value)}
                    onBlur={undefined}
                    placeholder={field.id === 'phone' ? (field.placeholder || '3001234567') : field.id === 'email' ? 'email@example.com' : field.placeholder}
                    maxLength={field.id === 'phone'
                      ? 15 - country.phoneCode.length
                      : (Number.isFinite(parseInt(field.maxLength, 10)) && parseInt(field.maxLength, 10) > 0 ? parseInt(field.maxLength, 10) : undefined)}
                    style={field.id === 'phone' ? { ...inputStyle, paddingLeft: '0' } : inputStyle}
                  />
                  {field.id === 'phone' && isLookingUpCustomer && (
                    <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center' }}>
                      <div className="jaldi-loading" style={{ width: '16px', height: '16px' }}></div>
                    </div>
                  )}
                </div>
                {field.id === 'phone' && buyerData && (
                  <div style={{
                    fontSize: '12px',
                    color: buyerData.trustLevel === 'trusted' ? '#059669' : '#6B7280',
                    marginTop: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}>
                    {buyerData.trustLevel === 'trusted' ? (
                      <>
                        <span>&#10003;</span>
                        <span>{t(lang, 'welcomeBack')}{buyerData.firstName ? `, ${buyerData.firstName}` : ''}!</span>
                      </>
                    ) : (
                      <>
                        <span>&#10003;</span>
                        <span>{t(lang, 'welcomeBack')}{buyerData.firstName ? `, ${buyerData.firstName}` : ''}!</span>
                      </>
                    )}
                  </div>
                )}
                {error && <div style={errorStyle}>{error}</div>}
              </div>
            </div>
          </div>
        );

      case 'dropdown':
        // Use country-based provinces for province field
        const options = field.id === 'province' ? country.provinces : field.options;

        // If province field has no options (empty provinces array), render as text input instead
        if (field.id === 'province' && (!options || options.length === 0)) {
          return (
            <div key={field.id} style={{ marginBottom: '0' }}>
              <div className="jaldi-field-row" style={fieldRowStyle}>
                <label className="jaldi-field-label" style={labelStyle}>
                  {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
                </label>
                <div style={{ flex: 1 }}>
                  <div style={inputGroupStyle}>
                    <input
                      type="text"
                      name={field.id}
                      value={value}
                      onChange={(e) => handleChange(fieldId, e.target.value)}
                      placeholder={field.placeholder || 'Enter your province/state'}
                      style={inputStyle}
                    />
                  </div>
                  {error && <div style={errorStyle}>{error}</div>}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div key={field.id} style={{ marginBottom: '0' }}>
            <div className="jaldi-field-row" style={fieldRowStyle}>
              <label className="jaldi-field-label" style={labelStyle}>
                {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <select
                    name={field.id}
                    value={value}
                    onChange={(e) => setFieldValue(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">{field.placeholder || 'Select...'}</option>
                    {options?.map((opt, idx) => (
                      <option key={idx} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                {error && <div style={errorStyle}>{error}</div>}
              </div>
            </div>
          </div>
        );

      case 'checkbox':
        return (
          <div key={field.id} style={{ marginBottom: fieldRowStyle.marginBottom }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                name={field.id}
                checked={!!value}
                onChange={(e) => setFieldValue(e.target.checked)}
                style={{ width: '16px', height: '16px', cursor: 'pointer', flexShrink: 0 }}
              />
              <span style={{ fontSize: '14px', color: '#000000', fontWeight: '600' }}>
                {getFieldLabel(field)}{field.required && <span style={{ color: '#EF4444' }}> *</span>}
              </span>
            </label>
            {error && <div style={errorStyle}>{error}</div>}
          </div>
        );

      case 'date':
        return (
          <div key={field.id} style={{ marginBottom: '0' }}>
            <div className="jaldi-field-row" style={fieldRowStyle}>
              <label className="jaldi-field-label" style={labelStyle}>
                {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <input
                    type="date"
                    name={field.id}
                    value={value}
                    onChange={(e) => setFieldValue(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                {error && <div style={errorStyle}>{error}</div>}
              </div>
            </div>
          </div>
        );

      case 'quantity':
        return (
          <div key={field.id} style={{ marginBottom: '0' }}>
            <div className="jaldi-field-row" style={fieldRowStyle}>
              <label className="jaldi-field-label" style={labelStyle}>
                {getFieldLabel(field)} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <input
                    type="number"
                    min="1"
                    name={field.id}
                    value={value === '' ? '' : value}
                    onChange={(e) => setFieldValue(e.target.value)}
                    placeholder={field.placeholder || '1'}
                    style={inputStyle}
                  />
                </div>
                {error && <div style={errorStyle}>{error}</div>}
              </div>
            </div>
          </div>
        );

      case 'title':
        return (
          <div key={field.id} style={{ marginBottom: '12px' }}>
            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#000000' }}>
              {getFieldLabel(field)}
            </h3>
          </div>
        );

      default:
        return null;
    }
  };

  // Calculate subtotal using original prices for upsell items and bundle items, regular price for others
  // Note: For Pumper Bundle items, the price is already the total bundle price, not per-unit
  // For cart discount items (quantity-breaks), prices are per-unit
  const subtotal = cart.items.reduce((sum, item) => {
    if (item.hasBundleDiscount && item.originalPrice) {
      // Pumper Bundle price is already the total for all units, don't multiply by quantity
      return sum + item.originalPrice;
    }
    if (item.hasCartDiscount && item.originalPrice) {
      // Cart discount items have per-unit prices, use original price × quantity
      return sum + (item.originalPrice * item.quantity);
    }
    // Use original price if available (for upsells)
    const itemPrice = item.isUpsell && item.originalPrice ? item.originalPrice : item.price;
    return sum + (itemPrice * item.quantity);
  }, 0);

  // Calculate total discount from upsell items
  const upsellDiscount = cart.items.reduce((sum, item) => {
    if (item.isUpsell && item.originalPrice && item.originalPrice !== item.price) {
      return sum + ((item.originalPrice - item.price) * item.quantity);
    }
    return sum;
  }, 0);

  // Calculate bundle discount (from Pumper Bundles, quantity-breaks, or similar)
  // Note: Pumper Bundle prices are already totals, not per-unit prices
  // Cart discount prices are per-unit, so multiply by quantity
  const bundleDiscount = cart.items.reduce((sum, item) => {
    if (item.hasBundleDiscount && item.originalPrice && item.originalPrice !== item.price) {
      return sum + (item.originalPrice - item.price);
    }
    if (item.hasCartDiscount && item.originalPrice && item.originalPrice !== item.price) {
      return sum + ((item.originalPrice - item.price) * item.quantity);
    }
    return sum;
  }, 0);

  // Calculate total from selected one-tick upsells
  // Country-eligible only — drives totals, rendering and submit alike
  const oneTickUpsells = eligibleOneTickUpsells;
  const oneTickTotal = oneTickUpsells.reduce((sum, upsell) => {
    if (selectedUpsells[upsell.id]) {
      return sum + (upsell.upsellPrice || 0);
    }
    return sum;
  }, 0);

  // Effective subtotal after bundle and upsell discounts
  // Recovery and user discounts are applied on this base, not on the raw subtotal
  const effectiveSubtotal = subtotal - bundleDiscount - upsellDiscount;

  // Calculate recovery discount amount (from downsell)
  const recoveryDiscountAmount = recoveryDiscount
    ? (recoveryDiscount.type === 'percentage'
        ? effectiveSubtotal * (recoveryDiscount.value / 100)
        : Math.min(recoveryDiscount.value, effectiveSubtotal))
    : 0;

  // Calculate user-entered discount code amount (reactive to subtotal changes)
  const userDiscountAmount = appliedDiscount
    ? (appliedDiscount.discountType === 'percentage'
        ? effectiveSubtotal * (appliedDiscount.discountValue / 100)
        : Math.min(appliedDiscount.discountValue, effectiveSubtotal))
    : 0;

  // Calculate cart weight and quantity for shipping conditions
  const cartWeight = cart.items.reduce((sum, item) => sum + ((item.weight || 0) * item.quantity), 0);
  const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  // Get eligible shipping rates based on conditions
  const getEligibleShippingRates = () => {
    const rates = config.shippingRates || [];

    return rates.filter(rate => {
      const conditions = rate.conditions || [];

      // If no conditions, rate is always eligible
      if (conditions.length === 0) {
        return true;
      }

      // All conditions must be met (AND logic)
      return conditions.every(condition => {
        switch (condition.type) {
          case 'order_total_gte':
            return subtotal >= condition.value;
          case 'order_total_lt':
            return subtotal < condition.value;
          case 'order_weight_gte':
            return cartWeight >= condition.value;
          case 'order_weight_lt':
            return cartWeight < condition.value;
          case 'quantity_gte':
            return totalQuantity >= condition.value;
          case 'quantity_lt':
            return totalQuantity < condition.value;
          case 'contains_product':
            // Support both single product (legacy) and multiple products
            const productIdsToCheck = condition.productIds || [condition.productId];
            return productIdsToCheck.some(productId =>
              cart.items.some(item =>
                item.id === productId ||
                item.variantId?.includes(productId) ||
                item.productId === productId
              )
            );
          case 'not_contains_product':
            // Support both single product (legacy) and multiple products
            const productIdsToExclude = condition.productIds || [condition.productId];
            return !productIdsToExclude.some(productId =>
              cart.items.some(item =>
                item.id === productId ||
                item.variantId?.includes(productId) ||
                item.productId === productId
              )
            );
          default:
            return true;
        }
      });
    });
  };

  const eligibleShippingRates = getEligibleShippingRates();

  // Calculate shipping cost
  const shippingCost = selectedShippingRate?.price || 0;

  // Final total after discount + one-tick upsells - recovery discount - user discount + shipping
  const total = subtotal - bundleDiscount - upsellDiscount + oneTickTotal - recoveryDiscountAmount - userDiscountAmount + shippingCost;

  // Display calculations (for currency converter — display only, not used in order submission)
  const hasDisplayPrice = cart.items.some(item => item.displayPrice != null);
  const displaySubtotal = hasDisplayPrice
    ? cart.items.reduce((sum, item) => {
        // For upsell items, use displayOriginalPrice (converted original) since discount is shown separately
        if (item.isUpsell && item.displayOriginalPrice != null) {
          return sum + (item.displayOriginalPrice * item.quantity);
        }
        // For cart discount items, use displayOriginalPrice (per-unit) × quantity
        if (item.hasCartDiscount && item.displayOriginalPrice != null) {
          return sum + (item.displayOriginalPrice * item.quantity);
        }
        if (item.hasBundleDiscount && item.originalPrice) {
          // Use displayOriginalPrice for the subtotal (discount is subtracted separately)
          const displayOrig = item.displayOriginalPrice != null ? item.displayOriginalPrice : item.originalPrice;
          return sum + displayOrig;
        }
        const dp = item.displayPrice != null ? item.displayPrice : item.price;
        return sum + (dp * item.quantity);
      }, 0)
    : subtotal;

  // Display versions of discounts using exchange rate from bucks-init/bucks-current (stored on items)
  // Prefer non-bundle, non-upsell cart items for accurate rate, fall back to any item with displayPrice
  const displayExchangeRate = hasDisplayPrice
    ? (() => {
        const item = cart.items.find(i => i.displayPrice != null && i.price > 0 && !i.hasBundleDiscount && !i.hasCartDiscount && !i.isUpsell)
          || cart.items.find(i => i.displayPrice != null && i.price > 0);
        return item ? item.displayPrice / item.price : 1;
      })()
    : 1;
  const displayUpsellDiscount = hasDisplayPrice ? parseFloat((upsellDiscount * displayExchangeRate).toFixed(2)) : upsellDiscount;
  const displayBundleDiscount = hasDisplayPrice ? parseFloat((bundleDiscount * displayExchangeRate).toFixed(2)) : bundleDiscount;
  const displayRecoveryDiscountAmount = hasDisplayPrice ? parseFloat((recoveryDiscountAmount * displayExchangeRate).toFixed(2)) : recoveryDiscountAmount;
  const displayUserDiscountAmount = hasDisplayPrice ? parseFloat((userDiscountAmount * displayExchangeRate).toFixed(2)) : userDiscountAmount;
  const displayOneTickTotal = hasDisplayPrice ? parseFloat((oneTickTotal * displayExchangeRate).toFixed(2)) : oneTickTotal;
  const displayShippingCost = hasDisplayPrice ? parseFloat((shippingCost * displayExchangeRate).toFixed(2)) : shippingCost;

  const displayTotal = hasDisplayPrice
    ? displaySubtotal - displayBundleDiscount - displayUpsellDiscount + displayOneTickTotal - displayRecoveryDiscountAmount - displayUserDiscountAmount + displayShippingCost
    : total;

  // ── Free shipping progress nudge ────────────────────────────────────────
  // When a free (price 0) rate is gated behind an order-total or quantity
  // threshold, we ALWAYS surface that free rate in the Shipping Method list —
  // disabled with a "buy more" subtitle while locked, enabled + auto-selected
  // with a success subtitle once unlocked. Auto-derived from rate conditions;
  // only the message text is merchant-configurable.
  const getFreeShippingNudge = () => {
    if (!config.settings?.freeShippingNudgeEnabled) return null;

    const rates = config.shippingRates || [];
    let best = null; // { rate, met, progress, type, gap }

    rates.forEach(rate => {
      if (rate.price !== 0) return; // free rates only
      const conditions = rate.conditions || [];
      if (conditions.length === 0) return; // unconditional free rate — nothing to nudge

      // Only "spend/add more" thresholds are actionable. If a rate carries any
      // non-actionable condition (upper bounds, product rules), skip it — we
      // can't promise the buyer they'll unlock it by adding to the cart.
      const actionable = conditions.every(c => c.type === 'order_total_gte' || c.type === 'quantity_gte');
      if (!actionable) return;

      conditions.forEach(c => {
        let cand = null;
        if (c.type === 'order_total_gte') {
          const gap = c.value - subtotal;
          cand = { rate, type: 'amount', met: gap <= 0, progress: c.value > 0 ? Math.min(subtotal / c.value, 1) : 1, gap: Math.max(gap, 0) };
        } else if (c.type === 'quantity_gte') {
          const gap = c.value - totalQuantity;
          cand = { rate, type: 'quantity', met: gap <= 0, progress: c.value > 0 ? Math.min(totalQuantity / c.value, 1) : 1, gap: Math.max(gap, 0) };
        }
        if (!cand) return;
        // Prefer an unlocked rate; otherwise the one closest to completion.
        if (!best || (cand.met && !best.met) || (cand.met === best.met && cand.progress > best.progress)) {
          best = cand;
        }
      });
    });

    if (!best) return null;

    // Build the subtitle message shown under the free rate row.
    let message = '';
    if (best.met) {
      message = config.settings.freeShippingNudgeSuccessText || '';
    } else if (best.type === 'amount') {
      const displayGap = hasDisplayPrice ? best.gap * displayExchangeRate : best.gap;
      const amountStr = `${currencySymbol}${displayGap.toFixed(2)}`;
      message = (config.settings.freeShippingNudgeAmountText || '').replace(/\{\{\s*amount\s*\}\}/g, amountStr);
    } else {
      message = (config.settings.freeShippingNudgeQtyText || '').replace(/\{\{\s*count\s*\}\}/g, String(best.gap));
    }

    return { rate: best.rate, unlocked: best.met, message };
  };

  const freeShippingNudge = getFreeShippingNudge();

  // The set of rates actually shown in the Shipping Method list. When the free
  // nudge is active we always include its gated free rate (it may be filtered
  // out of eligibleShippingRates while locked). When unlocked, the free rate is
  // the only selectable option and paid rates are shown disabled; when locked,
  // the free rate is the disabled one.
  const nudgeFreeRateId = freeShippingNudge?.rate?.id;
  const displayShippingRates = (() => {
    if (!freeShippingNudge) return eligibleShippingRates;

    if (freeShippingNudge.unlocked) {
      // Once free is unlocked, paid rates with an order-total/quantity upper bound
      // (e.g. "Standard = order < 250") fall out of eligibleShippingRates. We still
      // want to show them — disabled — so the buyer sees the option they "graduated"
      // from. Re-evaluate paid rates ignoring threshold conditions; keep product/
      // weight rules so genuinely-irrelevant rates stay hidden.
      const isThresholdCond = (c) => ['order_total_gte', 'order_total_lt', 'quantity_gte', 'quantity_lt'].includes(c.type);
      const paidRatesIgnoringThreshold = (config.shippingRates || []).filter(rate => {
        if (rate.price === 0) return false;
        const nonThreshold = (rate.conditions || []).filter(c => !isThresholdCond(c));
        return nonThreshold.every(condition => {
          switch (condition.type) {
            case 'order_weight_gte': return cartWeight >= condition.value;
            case 'order_weight_lt': return cartWeight < condition.value;
            case 'contains_product': {
              const ids = condition.productIds || [condition.productId];
              return ids.some(pid => cart.items.some(i => i.id === pid || i.variantId?.includes(pid) || i.productId === pid));
            }
            case 'not_contains_product': {
              const ids = condition.productIds || [condition.productId];
              return !ids.some(pid => cart.items.some(i => i.id === pid || i.variantId?.includes(pid) || i.productId === pid));
            }
            default: return true;
          }
        });
      });
      return [freeShippingNudge.rate, ...paidRatesIgnoringThreshold];
    }

    // Locked: paid rates eligible as usual, free rate appended (disabled).
    const withoutFree = eligibleShippingRates.filter(r => r.id !== nudgeFreeRateId);
    return [...withoutFree, freeShippingNudge.rate];
  })();

  // Whether a given row is selectable. With the nudge active: unlocked → only the
  // free rate is enabled; locked → only the free rate is disabled.
  const isRateDisabled = (rate) => {
    if (!freeShippingNudge) return false;
    const isFreeRate = rate.id === nudgeFreeRateId;
    return freeShippingNudge.unlocked ? !isFreeRate : isFreeRate;
  };

  // Auto-select the appropriate default rate (skips disabled rows).
  useEffect(() => {
    const selectable = displayShippingRates.filter(r => !isRateDisabled(r));
    const currentStillValid = selectedShippingRate
      && selectable.some(r => r.id === selectedShippingRate.id);
    if (currentStillValid) return;
    if (selectable.length > 0) {
      setSelectedShippingRate(selectable[0]);
    } else if (!selectedShippingRate) {
      setSelectedShippingRate({ id: 'free', name: 'Free Shipping', price: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayShippingRates.map(r => r.id).join(','), freeShippingNudge?.unlocked, subtotal, cartWeight, totalQuantity]);

  // Map a section's heading alignment to a flexbox justifyContent value.
  const alignToJustify = (align) =>
    align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start';

  // One-tick upsells. Extracted so Smart Checkout's review step and the basic
  // form render the identical block — its colours, borders and radius all come
  // from each upsell's own merchant config, so it must not be restyled.
  const renderOneTickUpsells = () => (
    <>
      {oneTickUpsells.length > 0 && oneTickUpsells.map((upsell) => {
                const isSelected = selectedUpsells[upsell.id] || false;

                // Replace placeholders in checkbox text (use converted price if available)
                const oneTickPrice = hasDisplayPrice && displayExchangeRate
                  ? parseFloat((upsell.upsellPrice * displayExchangeRate).toFixed(2))
                  : upsell.upsellPrice;
                const oneTickCurrency = hasDisplayPrice ? currencySymbol : resolvePixelCurrency({ shopCurrencyCode: config.shop?.currencyCode, country: config.shop?.country });
                const checkboxText = upsell.checkboxText
                  .replace('{title}', `<strong>${upsell.upsellTitle || ''}</strong>`)
                  .replace('{price}', `<strong>${oneTickCurrency} ${oneTickPrice?.toFixed(2) || '0.00'}</strong>`);

                return (
                  <div
                    key={upsell.id}
                    style={{
                      marginBottom: '16px',
                      padding: '16px',
                      backgroundColor: upsell.backgroundColor || '#d9ebf6',
                      border: `${upsell.borderWidth || 2}px ${upsell.borderStyle || 'solid'} ${upsell.borderColor || '#0074bf'}`,
                      borderRadius: `${upsell.borderRadius || 8}px`,
                    }}
                  >
                    <label style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      cursor: 'pointer',
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          setSelectedUpsells(prev => ({
                            ...prev,
                            [upsell.id]: e.target.checked
                          }));

                          // Track AddToCart event when upsell is selected
                          if (e.target.checked) {
                            const currency = resolvePixelCurrency({ shopCurrencyCode: config.shop?.currencyCode, country: config.shop?.country });
                            const upsellItem = {
                              id: upsell.product?.id || `upsell-${upsell.id}`,
                              variantId: upsell.product?.variantId,
                              price: upsell.upsellPrice,
                            };
                            trackAddToCart(upsellItem, currency);
                          }
                        }}
                        style={{
                          width: '18px',
                          height: '18px',
                          marginTop: '2px',
                          cursor: 'pointer',
                        }}
                      />
                      {upsell.imageUrl && (
                        <img
                          src={upsell.imageUrl}
                          alt=""
                          style={{
                            width: '48px',
                            height: '48px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            border: '1px solid rgba(0,0,0,0.1)',
                            flexShrink: 0,
                          }}
                        />
                      )}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontSize: '16px',
                            fontWeight: '400',
                            color: upsell.textColor || '#000000',
                            marginBottom: upsell.descriptionText ? '4px' : '0',
                          }}
                          dangerouslySetInnerHTML={{ __html: checkboxText }}
                        />
                        {upsell.descriptionText && (
                          <div
                            style={{
                              fontSize: '14px',
                              color: upsell.descriptionColor || '#595959',
                            }}
                          >
                            {upsell.descriptionText}
                          </div>
                        )}
                      </div>
                    </label>
                  </div>
                );
              })}
    </>
  );


  /**
   * Inline edit form for a saved address, Smart Checkout styling.
   *
   * Backed by the same editFormData / handleSaveAddress pair the basic form
   * uses, so the address-update call and the local buyerData reconciliation are
   * unchanged — only the presentation differs.
   */
  const renderAddressEditForm = () => {
    const field = (key, labelKey, opts = {}) => (
      <div className="jaldi-sc-edit-field" style={opts.half ? { flex: 1, minWidth: 0 } : undefined}>
        <label className="jaldi-sc-label">{t(lang, labelKey)}</label>
        <input
          value={editFormData[key] || ''}
          onChange={(e) => setEditFormData((prev) => ({ ...prev, [key]: e.target.value }))}
          className="jaldi-sc-edit-input"
          type={key === 'email' ? 'email' : 'text'}
        />
      </div>
    );

    return (
      <div className="jaldi-sc-edit-grid">
        {field('label', 'addressLabelPlaceholder')}
        <div className="jaldi-sc-edit-row">
          {field('firstName', 'firstNamePlaceholder', { half: true })}
          {field('lastName', 'lastNamePlaceholder', { half: true })}
        </div>
        {field('email', 'emailPlaceholder')}
        {field('address', 'streetAddressPlaceholder')}
        <div className="jaldi-sc-edit-row">
          {field('city', 'cityPlaceholder', { half: true })}
          {field('province', 'provincePlaceholder', { half: true })}
        </div>
        {field('postalCode', 'postalCodePlaceholder')}

        <div className="jaldi-sc-edit-actions">
          <button
            type="button"
            className="jaldi-sc-cta jaldi-sc-cta-sm"
            disabled={isSavingAddress}
            onClick={(e) => handleSaveAddress(e, editingAddressId)}
          >
            {isSavingAddress ? t(lang, 'saving') : t(lang, 'save')}
          </button>
          <button type="button" className="jaldi-sc-btn-ghost" onClick={handleCancelEdit}>
            {t(lang, 'cancel')}
          </button>
        </div>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Smart Checkout render
  //
  // Returns before the basic form's markup below, which is left untouched —
  // this is the "Smart Checkout only" scope boundary.
  // ═══════════════════════════════════════════════════════════════════════
  if (isSmartCheckout) {
    // Verification is dropped from the rail entirely when the merchant has OTP
    // off, rather than showing a step with nothing in it.
    const smartSteps = otpEnabled
      ? ['phone', 'verify', 'address', 'review']
      : ['phone', 'address', 'review'];
    const smartLabels = otpEnabled
      ? [t(lang, 'stepPhone'), t(lang, 'stepVerify'), t(lang, 'stepAddress'), t(lang, 'stepReview')]
      : [t(lang, 'stepPhone'), t(lang, 'stepAddress'), t(lang, 'stepReview')];
    const stepNumber = smartSteps.indexOf(checkoutStep) + 1;

    // The field stores `phoneCode + digits`; the design shows the code in the
    // picker, so strip it for display and re-attach on the way back in.
    const localPhone = (formData.phone || '').startsWith(country.phoneCode)
      ? formData.phone.slice(country.phoneCode.length)
      : (formData.phone || '');

    const savedAddresses = (buyerData?.trustLevel === 'trusted' && buyerData?.addresses) || [];

    // Totals, in display currency, mirroring the basic form's breakdown rows.
    const smartBreakdown = [
      { label: t(lang, 'subtotal'), value: displaySubtotal },
      bundleDiscount > 0 && { label: t(lang, 'bundleDiscount'), value: -displayBundleDiscount, kind: 'discount', display: `−${currencySymbol}${displayBundleDiscount.toFixed(2)}` },
      upsellDiscount > 0 && { label: t(lang, 'upsellDiscount'), value: -displayUpsellDiscount, kind: 'discount', display: `−${currencySymbol}${displayUpsellDiscount.toFixed(2)}` },
      recoveryDiscountAmount > 0 && { label: t(lang, 'recoveryDiscount'), value: -displayRecoveryDiscountAmount, kind: 'discount', display: `−${currencySymbol}${displayRecoveryDiscountAmount.toFixed(2)}` },
      userDiscountAmount > 0 && { label: t(lang, 'discount'), value: -displayUserDiscountAmount, kind: 'discount', display: `−${currencySymbol}${displayUserDiscountAmount.toFixed(2)}` },
      { label: t(lang, 'shipping'), value: displayShippingCost, kind: displayShippingCost === 0 ? 'free' : undefined },
    ].filter(Boolean);

    // Rate rows carry the free-shipping nudge's disabled/message state so that
    // merchant feature survives the redesign.
    const smartRates = displayShippingRates.map((rate) => {
      const isNudgeFree = freeShippingNudge && rate.id === nudgeFreeRateId;
      const ratePrice = hasDisplayPrice ? rate.price * displayExchangeRate : rate.price;
      return {
        id: rate.id,
        label: rate.name,
        eta: isNudgeFree ? null : rate.description,
        price: ratePrice,
        priceDisplay: ratePrice === 0 ? t(lang, 'free') : `${currencySymbol}${ratePrice.toFixed(2)}`,
        disabled: isRateDisabled(rate),
        message: isNudgeFree ? freeShippingNudge.message : null,
        unlocked: isNudgeFree ? freeShippingNudge.unlocked : false,
        raw: rate,
      };
    });

    // A null selectedAddressId means "the default address" elsewhere in this
    // component, so resolve it here rather than leaving the picker unselected.
    const effectiveAddressId = selectedAddressId
      || savedAddresses.find((a) => a.isDefault)?.id
      || savedAddresses[0]?.id
      || null;
    const selectedSaved = savedAddresses.find((a) => a.id === effectiveAddressId);
    const deliverToLine = selectedSaved
      ? [selectedSaved.address, selectedSaved.city].filter(Boolean).join(', ')
      : [formData.address, formData.city].filter(Boolean).join(', ');
    const deliverTo = deliverToLine
      ? { label: selectedSaved?.label, line: deliverToLine }
      : null;

    const railShipping = selectedShippingRate
      ? { label: selectedShippingRate.name, eta: selectedShippingRate.description }
      : null;

    // Address fields, minus the ones the flow handles itself (phone lives on
    // step 1; discount code moves to the review step).
    const addressFields = visibleFields.filter(
      (f) => f.id !== 'phone' && f.id !== 'discount-code' && f.type !== 'whatsapp'
    );
    const discountField = visibleFields.find((f) => f.id === 'discount-code');
    const whatsappFields = visibleFields.filter((f) => f.type === 'whatsapp');

    const codLabel = `${config.formConfig?.submitButtonText?.trim() || t(lang, 'placeOrder')} — ${currencySymbol}${displayTotal.toFixed(2)}`;

    let pane = null;

    if (smartSuccess) {
      pane = (
        <SuccessStep
          lang={lang}
          currencySymbol={currencySymbol}
          total={smartSuccess.total}
          orderNumber={smartSuccess.orderNumber}
          messageHtml={smartSuccess.messageHtml}
          onClose={onClose}
          onContinueShopping={onClose}
        />
      );
    } else if (checkoutStep === 'phone') {
      pane = (
        <PhoneStep
          lang={lang}
          isRTL={isRTL}
          country={country}
          countryCode={countryCode}
          supportedCountries={supportedCountries}
          enableMultiCountry={config.shop?.enableMultiCountry}
          localPhone={localPhone}
          otpEnabled={otpEnabled}
          error={errors.phone}
          isLoading={isTransitioningStep}
          onPhoneChange={(digits) => handleChange('phone', country.phoneCode + digits)}
          onCountryChange={(code) => {
            setSelectedCountry(code);
            const next = COUNTRIES[code];
            if (next) setFormData((prev) => ({ ...prev, phone: next.phoneCode }));
          }}
          onContinue={handleContinueToStep2}
        />
      );
    } else if (checkoutStep === 'verify' || otpStep !== 'form') {
      // `otpStep !== 'form'` covers the submit-time fallback: handleSubmit can
      // still ask for verification from the review step, and without this the
      // request would have nowhere to render.
      const trusted = checkoutStep === 'verify'
        && otpStep === 'form'
        && buyerData?.trustLevel === 'trusted'
        && isFingerprintMatched;
      pane = (
        <VerifyStep
          variant={trusted ? 'trusted' : otpStep === 'otp' ? 'otp' : 'walogin'}
          lang={lang}
          isRTL={isRTL}
          phone={formData.phone}
          firstName={buyerData?.firstName}
          totalOrders={buyerData?.totalOrders || 0}
          phase={trusted ? 'verified' : 'checking'}
          status={waLoginStatus}
          error={waError || otpError}
          isSending={isSendingOtp}
          isVerifying={isVerifyingOtp}
          method={verifyMethod}
          code={otpCode}
          countdown={otpCountdown}
          canSkip
          onContinue={() => handleVerificationSuccess(false, trusted ? 'trusted_buyer_verified' : null)}
          onStart={handleWhatsAppLogin}
          onVerify={handleVerifyOtp}
          onResend={handleSendWhatsAppOtp}
          onCodeChange={(v) => { setOtpCode(v); setOtpError(''); }}
          onFallbackToOtp={handleSendWhatsAppOtp}
          onBack={() => { setOtpStep('form'); setOtpCode(''); setOtpError(''); }}
          onSkip={() => handleVerificationSuccess(true)}
          onUseDifferentNumber={handleBackToPhone}
        />
      );
    } else if (checkoutStep === 'address') {
      const useSaved = savedAddresses.length > 0 && addressMode === 'saved';
      pane = (
        <AddressStep
          lang={lang}
          isRTL={isRTL}
          addresses={savedAddresses}
          selectedId={addressMode === 'new' ? 'new' : effectiveAddressId}
          mode={savedAddresses.length > 0 ? addressMode : 'new'}
          editingAddressId={editingAddressId}
          onSelect={handleAddressSelect}
          onAddNew={() => { setAddressMode('new'); setSelectedAddressId('new'); }}
          onUseSaved={() => setAddressMode('saved')}
          onEditAddress={(id) => {
            const target = savedAddresses.find((a) => a.id === id);
            if (target) handleEditAddress({ preventDefault() {}, stopPropagation() {} }, target);
          }}
          onDeleteAddress={(id) => handleDeleteAddress({ stopPropagation() {} }, id)}
          renderEditForm={() => renderAddressEditForm()}
          newAddressNode={<>{addressFields.map(renderField)}</>}
          continueDisabled={useSaved && !effectiveAddressId}
          onContinue={() => {
            if (!validate()) return;
            setCheckoutStep('review');
          }}
        />
      );
    } else {
      pane = (
        <ReviewStep
          lang={lang}
          items={cart.items}
          currencySymbol={currencySymbol}
          breakdown={smartBreakdown}
          total={displayTotal}
          deliverTo={deliverTo}
          onEditAddress={() => setCheckoutStep('address')}
          shippingRates={smartRates}
          selectedShippingRateId={selectedShippingRate?.id}
          onSelectShipping={(r) => setSelectedShippingRate(r.raw)}
          discountNode={discountField ? renderField(discountField) : null}
          upsellsNode={renderOneTickUpsells()}
          showSummary
          ctasNode={
            <>
              {submitError && (
                <div className="jaldi-sc-alert" role="alert">
                  <SmartIcon.Info size={13} /> {submitError}
                </div>
              )}
              {variantMixOosError && (
                <div className="jaldi-sc-alert" role="alert">
                  <SmartIcon.Info size={13} /> {t(lang, 'removeOosFromBundle')}
                </div>
              )}

              {!(config.settings?.enableCartPermalink && config.settings?.hideCompleteOrderButton) && (
                <button
                  type="submit"
                  disabled={isSubmitting || variantMixOosError}
                  className="jaldi-sc-cta jaldi-sc-hit"
                >
                  {isSubmitting ? (
                    <><span className="jaldi-sc-spinner" aria-hidden="true" />{t(lang, 'processing')}</>
                  ) : (
                    <><SmartIcon.Lock size={14} /> {codLabel}</>
                  )}
                </button>
              )}

              {config.settings?.enableCartPermalink && (
                <button
                  type="button"
                  onClick={handlePayWithCard}
                  disabled={isRedirectingToCheckout || isSubmitting || variantMixOosError}
                  className="jaldi-sc-cta jaldi-sc-cta-alt jaldi-sc-hit"
                >
                  {isRedirectingToCheckout ? (
                    <><span className="jaldi-sc-spinner" aria-hidden="true" />{t(lang, 'redirecting')}</>
                  ) : (
                    <><SmartIcon.CreditCard size={16} /> {t(lang, 'payWithCard')}</>
                  )}
                </button>
              )}

              {config.settings?.payfastEnabled && (
                <button
                  type="button"
                  onClick={handlePayWithPayFast}
                  disabled={isPayfastProcessing || isSubmitting || isRedirectingToCheckout || variantMixOosError}
                  className="jaldi-sc-cta jaldi-sc-cta-alt jaldi-sc-hit"
                >
                  <SmartIcon.CreditCard size={16} /> {config.settings?.payfastButtonText || 'PayFast'}
                </button>
              )}

              {whatsappFields.map(renderField)}
            </>
          }
        />
      );
    }

    const smartRoot = {
      ...deriveTheme(config.formConfig?.submitButtonBgColor || config.settings?.buttonBgColor),
      display: 'flex',
      width: '100%',
      direction: isRTL ? 'rtl' : 'ltr',
    };

    return (
      <div style={smartRoot}>
        <ModalShell
          step={smartSuccess ? 0 : stepNumber}
          totalSteps={smartSuccess ? 0 : smartSteps.length}
          stepLabels={smartLabels}
          onBack={!smartSuccess && stepNumber > 1 ? () => setCheckoutStep(smartSteps[stepNumber - 2]) : null}
          onClose={onClose}
          title={config.formConfig.formTitle}
          titleAlign={config.formConfig.formTitleAlign || 'center'}
          lang={lang}
          isRTL={isRTL}
          mode={mode}
          summary={smartSuccess ? null : (
            <SummaryRail
              lang={lang}
              items={cart.items}
              currencySymbol={currencySymbol}
              breakdown={smartBreakdown}
              total={displayTotal}
              address={checkoutStep === 'review' ? deliverTo : null}
              shipping={checkoutStep === 'review' ? railShipping : null}
            />
          )}
        >
          <form onSubmit={handleSubmit} className="jaldi-form jaldi-sc-form-wrap">
            {pane}
          </form>
        </ModalShell>

        {showPayFastModal && (
          <PayFastModal
            appPath={appPath}
            shop={config.shopDomain}
            orderPayload={buildPayfastOrderPayload()}
            phone={formData.phone || ''}
            config={config}
            onSuccess={handlePayfastSuccess}
            onClose={() => { setShowPayFastModal(false); setIsPayfastProcessing(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div style={formStyle}>
      {/* Fixed Header */}
      <div style={{
        padding: '20px 24px',
        borderBottom: '1px solid #E5E7EB',
        flexShrink: 0,
        position: 'relative',
      }}>
        {mode === 'popup' && onClose && (
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '16px',
              ...(isRTL ? { left: '16px' } : { right: '16px' }),
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              color: '#000',
              lineHeight: '1',
              fontWeight: '300',
            }}
          >
            ×
          </button>
        )}

        <h2 style={{
          margin: '0',
          fontSize: '18px',
          fontWeight: '900',
          letterSpacing: '0.5px',
          color: '#000',
          textAlign: config.formConfig.formTitleAlign || 'left',
        }}>
          {lang === 'bilingual' && config.formConfig.formTitle === 'CASH ON DELIVERY'
            ? 'CASH ON DELIVERY (الدفع عند الاستلام)'
            : config.formConfig.formTitle}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="jaldi-form-scrollable-content" style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0',
        display: 'flex',
        flexDirection: 'column',
      }}>

        {/* Step 2: Order Details */}
        {checkoutStep === 'details' && (
          <>
        {/* Product Selection Dropdown - Only show if cart items are allowed and there are cart items */}
        {showProductSelection && (
          <div style={{
            padding: '16px 24px',
            borderBottom: '1px solid #e5e7eb',
            backgroundColor: '#f9fafb',
          }}>
            <label style={{
              display: 'block',
              marginBottom: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: '#374151',
            }}>
              {t(lang, 'whatToOrder')}
            </label>
            <select
              value={productSelection}
              onChange={(e) => onProductSelectionChange(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer',
              }}
            >
              <option value="current+cart">{t(lang, 'currentProductAndCart')} ({1 + fullCartItemCount} {t(lang, 'items')})</option>
              <option value="current">{t(lang, 'currentProductOnly')}</option>
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px 24px' }}>



        {visibleSections.map((section) => {
          switch (section.type) {
            case 'orderSummary':
              return (
                <div key={section.id} style={{
                  marginBottom: '16px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  backgroundColor: '#fff',
                }}>
                  {/* Collapsible header */}
                  <button
                    type="button"
                    onClick={() => setStep2SummaryOpen(prev => !prev)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      backgroundColor: '#f9fafb',
                      borderBottom: step2SummaryOpen ? '1px solid #E5E7EB' : 'none',
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: alignToJustify(section.headingAlign), minWidth: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
                      </svg>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#111' }}>{section.customLabel || t(lang, 'orderSummary')}</span>
                      {/* Item count: only when collapsed AND left-aligned, so center/right headings stay clean */}
                      {!step2SummaryOpen && (section.headingAlign || 'left') === 'left' && (
                        <span style={{ fontSize: '13px', color: '#6B7280' }}>
                          ({cart.items.reduce((sum, i) => sum + i.quantity, 0)} {cart.items.reduce((sum, i) => sum + i.quantity, 0) === 1 ? t(lang, 'item') : t(lang, 'items')})
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {/* Total: only when collapsed AND left-aligned (kept-when-collapsed rule) */}
                      {!step2SummaryOpen && (section.headingAlign || 'left') === 'left' && (
                        <span style={{ fontSize: '15px', fontWeight: '700', color: '#111' }}>
                          {currencySymbol}{displayTotal.toFixed(2)}
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 12 12"
                        style={{ transform: step2SummaryOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <path d="M2.5 4.5L6 8L9.5 4.5" stroke="#6B7280" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {/* Collapsible body — product cards + price breakdown */}
                  {step2SummaryOpen && (
                    <div style={{ padding: '12px 16px 16px 16px' }}>
                      {/* Product Cards */}
                      {cart.items.map((item, idx) => (
                        <div key={idx} style={{
                          display: 'flex',
                          gap: '12px',
                          marginBottom: '12px',
                          paddingBottom: idx === cart.items.length - 1 ? '0' : '12px',
                          borderBottom: idx === cart.items.length - 1 ? 'none' : '1px solid #f3f4f6',
                          position: 'relative',
                        }}>
                          {item.image && (
                            <div style={{
                              width: '52px',
                              height: '52px',
                              flexShrink: 0,
                              borderRadius: '8px',
                              overflow: 'visible',
                              backgroundColor: '#F3F4F6',
                              position: 'relative',
                              border: '1px solid #E5E7EB',
                            }}>
                              <img src={item.image} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '7px' }} />
                              <div style={{
                                position: 'absolute', top: '-6px', left: '-6px',
                                backgroundColor: '#6B7280', color: '#fff', borderRadius: '50%',
                                width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: '11px', fontWeight: '600', border: '2px solid #fff',
                              }}>
                                {item.quantity}
                              </div>
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: '#111', lineHeight: '1.3', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {item.title}
                              {item.isUpsell && (
                                <span style={{ backgroundColor: '#10b981', color: '#fff', padding: '1px 5px', borderRadius: '3px', fontSize: '9px', fontWeight: '600', textTransform: 'uppercase' }}>{t(lang, 'upsell')}</span>
                              )}
                            </div>
                            {item.variant && <div style={{ fontSize: '12px', color: '#6B7280' }}>{item.variant}</div>}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#111', whiteSpace: 'nowrap', alignSelf: 'center', textAlign: 'right' }}>
                            {item.hasBundleDiscount && item.originalPrice ? (
                              <>
                                <div style={{ fontSize: '11px', fontWeight: '400', color: '#9CA3AF', textDecoration: 'line-through' }}>
                                  {currencySymbol}{(item.displayOriginalPrice != null ? item.displayOriginalPrice : item.originalPrice).toFixed(2)}
                                </div>
                                <div style={{ color: '#10b981' }}>
                                  {currencySymbol}{(item.displayPrice != null ? item.displayPrice : item.price).toFixed(2)}
                                </div>
                              </>
                            ) : item.hasCartDiscount && item.originalPrice ? (
                              <>
                                <div style={{ fontSize: '11px', fontWeight: '400', color: '#9CA3AF', textDecoration: 'line-through' }}>
                                  {currencySymbol}{((item.displayOriginalPrice != null ? item.displayOriginalPrice : item.originalPrice) * item.quantity).toFixed(2)}
                                </div>
                                <div style={{ color: '#10b981' }}>
                                  {currencySymbol}{((item.displayPrice != null ? item.displayPrice : item.price) * item.quantity).toFixed(2)}
                                </div>
                              </>
                            ) : (
                              <>{currencySymbol}{((item.isUpsell && item.displayOriginalPrice != null ? item.displayOriginalPrice : item.displayPrice != null ? item.displayPrice : (item.isUpsell && item.originalPrice ? item.originalPrice : item.price)) * item.quantity).toFixed(2)}</>
                            )}
                          </div>
                          {mode === 'popup' && onRemoveItem && (
                            <button type="button" onClick={(e) => { e.preventDefault(); onRemoveItem(item.variantId); }}
                              style={{ position: 'absolute', top: '-4px', right: '-4px', background: '#6B7280', border: 'none', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#fff', fontSize: '12px', lineHeight: '1', padding: '0', fontWeight: '600' }}>
                              ×
                            </button>
                          )}
                        </div>
                      ))}

                      {/* Price Breakdown */}
                      <div style={{ padding: '10px 12px', backgroundColor: '#F3F4F6', borderRadius: '8px', fontSize: '13px', marginTop: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                          <span>{t(lang, 'subtotal')}</span>
                          <span style={{ fontWeight: '600' }}>{currencySymbol}{displaySubtotal.toFixed(2)}</span>
                        </div>
                        {bundleDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                            <span>{t(lang, 'bundleDiscount')}</span>
                            <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayBundleDiscount.toFixed(2)}</span>
                          </div>
                        )}
                        {upsellDiscount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                            <span>{t(lang, 'upsellDiscount')}</span>
                            <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayUpsellDiscount.toFixed(2)}</span>
                          </div>
                        )}
                        {recoveryDiscount && recoveryDiscountAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                            <span>{t(lang, 'recoveryDiscount')}</span>
                            <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayRecoveryDiscountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {appliedDiscount && userDiscountAmount > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                            <span>{appliedDiscount.code}</span>
                            <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayUserDiscountAmount.toFixed(2)}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#374151' }}>
                          <span>{t(lang, 'shipping')}</span>
                          <span style={{ fontWeight: '600' }}>{shippingCost === 0 ? t(lang, 'free') : `${currencySymbol}${displayShippingCost.toFixed(2)}`}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 2px', marginTop: '4px', borderTop: '1px solid #D1D5DB', fontWeight: '700', color: '#111' }}>
                          <span>{t(lang, 'total')}</span>
                          <span>{currencySymbol}{displayTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );

            case 'totals':
              // Totals are now merged into the collapsible orderSummary card above
              return null;

            case 'shippingMethod':
              return (
                <div key={section.id} style={{ marginBottom: '16px', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                  {/* Collapsible header */}
                  <div
                    onClick={() => setShippingMethodOpen(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      borderBottom: shippingMethodOpen ? '1px solid #E5E7EB' : 'none',
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', justifyContent: alignToJustify(section.headingAlign), minWidth: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="1" y="3" width="15" height="13" rx="1"></rect>
                        <path d="M16 8h4l3 5v3h-7V8z"></path>
                        <circle cx="5.5" cy="18.5" r="2.5"></circle>
                        <circle cx="18.5" cy="18.5" r="2.5"></circle>
                      </svg>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#000' }}>{section.customLabel || t(lang, 'shipping')}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {/* Shipping price: only when collapsed AND left-aligned */}
                      {!shippingMethodOpen && (section.headingAlign || 'left') === 'left' && (
                        <span style={{ fontSize: '14px', fontWeight: '600', color: '#000' }}>
                          {selectedShippingRate ? (selectedShippingRate.price === 0 ? t(lang, 'free') : `${currencySymbol}${(hasDisplayPrice ? parseFloat((selectedShippingRate.price * displayExchangeRate).toFixed(2)) : selectedShippingRate.price).toFixed(2)}`) : t(lang, 'free')}
                        </span>
                      )}
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2.5"
                        style={{ transform: shippingMethodOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                        <polyline points="6 9 12 15 18 9"></polyline>
                      </svg>
                    </div>
                  </div>

                  {/* Collapsible body */}
                  {shippingMethodOpen && (
                    <div style={{ padding: '12px 16px' }}>
                      {displayShippingRates.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {displayShippingRates.map(rate => {
                            const disabled = isRateDisabled(rate);
                            const isSelected = !disabled && selectedShippingRate?.id === rate.id;
                            // The gated free rate carries the nudge message as its subtitle.
                            const isNudgeFree = freeShippingNudge && rate.id === nudgeFreeRateId;
                            const subtitle = isNudgeFree ? freeShippingNudge.message : rate.description;
                            return (
                              <label
                                key={rate.id}
                                style={{
                                  display: 'flex',
                                  alignItems: subtitle ? 'flex-start' : 'center',
                                  justifyContent: 'space-between',
                                  padding: '8px 16px',
                                  border: isSelected ? '1px solid #000' : '1px solid #D1D5DB',
                                  borderRadius: '4px',
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                  backgroundColor: disabled ? '#F9FAFB' : '#FFFFFF',
                                  opacity: disabled ? 0.6 : 1,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                  <input
                                    type="radio"
                                    name="shippingRate"
                                    checked={isSelected}
                                    disabled={disabled}
                                    onChange={() => { if (!disabled) setSelectedShippingRate(rate); }}
                                    style={{
                                      width: '16px',
                                      height: '16px',
                                      accentColor: '#000',
                                      flexShrink: 0,
                                      cursor: disabled ? 'not-allowed' : 'pointer',
                                    }}
                                  />
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontSize: '14px', color: disabled ? '#9CA3AF' : '#000000' }}>
                                      {rate.name}
                                    </span>
                                    {subtitle && (
                                      <span style={{
                                        fontSize: '12px',
                                        lineHeight: '1.3',
                                        fontWeight: isNudgeFree ? '600' : '400',
                                        color: isNudgeFree
                                          ? (freeShippingNudge.unlocked ? '#047857' : '#B45309')
                                          : '#6B7280',
                                      }}>
                                        {subtitle}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: '14px',
                                  fontWeight: '700',
                                  color: disabled ? '#9CA3AF' : '#000000',
                                }}>
                                  {rate.price === 0 ? t(lang, 'free') : `${currencySymbol}${(hasDisplayPrice ? parseFloat((rate.price * displayExchangeRate).toFixed(2)) : rate.price).toFixed(2)}`}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <label style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 16px',
                          border: '1px solid #D1D5DB',
                          borderRadius: '4px',
                          backgroundColor: '#FFFFFF',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              checked
                              readOnly
                              style={{ width: '16px', height: '16px', accentColor: '#000' }}
                            />
                            <span style={{ fontSize: '14px', color: '#000000' }}>{t(lang, 'freeShipping')}</span>
                          </div>
                          <span style={{ fontSize: '14px', fontWeight: '700', color: '#000000' }}>{t(lang, 'free')}</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              );

            case 'shippingAddress':
              return (
                <div key={section.id} style={{ marginBottom: '16px', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden', padding: '16px' }}>
                  <h3 style={{
                    fontSize: '15px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    color: '#000',
                    textAlign: section.headingAlign || 'left',
                  }}>
                    {section.customLabel || t(lang, 'enterShippingAddress')}
                  </h3>

                  {/* Country Selector - Only show in multi-country mode with more than 1 country */}
                  {config.shop?.enableMultiCountry && supportedCountries.length > 1 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '16px',
                    }}>
                      <label className="jaldi-field-label" style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#000000',
                        width: '100px',
                        minWidth: '100px',
                        flexShrink: 0,
                        lineHeight: '1.3',
                      }}>
                        {t(lang, 'country')}
                      </label>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          borderRadius: '4px',
                          border: '1px solid #D1D5DB',
                          backgroundColor: '#FFFFFF',
                          overflow: 'hidden',
                        }}>
                          <select
                            value={countryCode}
                            onChange={(e) => {
                              setSelectedCountry(e.target.value);
                              const newCountry = COUNTRIES[e.target.value];
                              setFormData(prev => ({
                                ...prev,
                                province: '',
                                phone: newCountry?.phoneCode || '',
                              }));
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              borderRadius: '0',
                              border: 'none',
                              fontSize: '14px',
                              fontFamily: 'inherit',
                              backgroundColor: 'transparent',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            {supportedCountries.map(c => (
                              <option key={c.code} value={c.code}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {detectedCountry && !selectedCountry && (
                          <small style={{
                            display: 'block',
                            marginTop: '4px',
                            color: '#666',
                            fontSize: '12px',
                          }}>
                            {t(lang, 'autoDetectedLocation')}
                          </small>
                        )}
                      </div>
                    </div>
                  )}


                  {visibleFields.filter(f => f.type !== 'whatsapp').map(renderField)}
                </div>
              );

            default:
              return null;
          }
        })}

        {/* One-Tick Upsells */}
        {renderOneTickUpsells()}

        {submitError && (
          <div style={{
            padding: '12px 14px',
            backgroundColor: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            color: '#991B1B',
            fontSize: '13px',
            lineHeight: '1.4',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            marginBottom: '12px',
          }}>
            <span style={{ fontSize: '16px', lineHeight: '1', flexShrink: 0, marginTop: '1px' }}>&#9888;</span>
            <span>{submitError}</span>
          </div>
        )}

        {/* Out of stock warning for variant mix */}
        {variantMixOosError && (
          <div style={{
            textAlign: 'center',
            color: '#DC2626',
            fontSize: '13px',
            fontWeight: '500',
            marginBottom: '8px',
          }}>
            {t(lang, 'removeOosFromBundle')}
          </div>
        )}

        {/* Complete Order (COD) button - hidden when hideCompleteOrderButton is enabled AND Pay with Card is active */}
        {!(config.settings?.enableCartPermalink && config.settings?.hideCompleteOrderButton) && (
          <button
            type="submit"
            disabled={isSubmitting || variantMixOosError}
            style={{
              width: '100%',
              padding: '14px 20px',
              backgroundColor: config.formConfig?.submitButtonBgColor || '#000000',
              color: config.formConfig?.submitButtonTextColor || '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: `${config.formConfig?.submitButtonFontSize || 15}px`,
              fontFamily: 'inherit',
              fontWeight: '600',
              cursor: (isSubmitting || variantMixOosError) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || variantMixOosError) ? 0.7 : 1,
              transition: 'opacity 0.2s',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isSubmitting ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div className="jaldi-loading"></div>
                <span>{t(lang, 'processing')}</span>
              </div>
            ) : (
              <>
                {config.formConfig?.submitButtonIcon && config.formConfig.submitButtonIcon !== 'none' && (() => {
                  const iconProps = {
                    width: '20',
                    height: '20',
                    viewBox: '0 0 24 24',
                    fill: 'none',
                    stroke: 'currentColor',
                    strokeWidth: '2',
                    strokeLinecap: 'round',
                    strokeLinejoin: 'round',
                  };
                  switch (config.formConfig.submitButtonIcon) {
                    case 'cart':
                      return (
                        <svg {...iconProps}>
                          <circle cx="9" cy="21" r="1" />
                          <circle cx="20" cy="21" r="1" />
                          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                      );
                    case 'truck':
                      return (
                        <svg {...iconProps}>
                          <path d="M1 3h15v13H1z" />
                          <path d="M16 8h4l3 3v5h-7V8z" />
                          <circle cx="5.5" cy="18.5" r="2.5" />
                          <circle cx="18.5" cy="18.5" r="2.5" />
                        </svg>
                      );
                    case 'package':
                      return (
                        <svg {...iconProps}>
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      );
                    case 'cash':
                      return (
                        <svg {...iconProps}>
                          <rect x="2" y="7" width="20" height="10" rx="2" />
                          <circle cx="12" cy="12" r="2" />
                          <path d="M18 12h.01M6 12h.01" />
                        </svg>
                      );
                    default:
                      return null;
                  }
                })()}
                {`${config.formConfig?.submitButtonText?.trim() || t(lang, 'completeOrder')} - ${currencySymbol}${displayTotal.toFixed(2)}`}
              </>
            )}
          </button>
        )}

        {/* Pay with Card Button - Only show if enabled */}
        {config.settings?.enableCartPermalink && (
          <>
            {buyerData?.preferredPaymentMethod === 'card' && (
              <div style={{
                marginTop: config.settings?.hideCompleteOrderButton ? '0' : '12px',
                marginBottom: '4px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11px',
                fontWeight: '600',
                color: '#1a7340',
                letterSpacing: '0.3px',
              }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="#1a7340">
                  <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z"/>
                </svg>
                {t(lang, 'youUsuallyPayWithCard')}
              </div>
            )}
          <button
            type="button"
            onClick={handlePayWithCard}
            disabled={isRedirectingToCheckout || isSubmitting || variantMixOosError}
            style={{
              width: '100%',
              padding: '14px 20px',
              marginTop: buyerData?.preferredPaymentMethod === 'card' ? '0' : config.settings?.hideCompleteOrderButton ? '0' : '12px',
              backgroundColor: config.settings?.cardButtonBgColor || '#FFFFFF',
              color: config.settings?.cardButtonTextColor || '#000000',
              border: buyerData?.preferredPaymentMethod === 'card' ? '2px solid #1a7340' : '2px solid #000000',
              borderRadius: '4px',
              fontSize: `${config.settings?.cardButtonFontSize || 15}px`,
              fontFamily: 'inherit',
              fontWeight: '600',
              cursor: (isRedirectingToCheckout || isSubmitting || variantMixOosError) ? 'not-allowed' : 'pointer',
              opacity: (isRedirectingToCheckout || isSubmitting || variantMixOosError) ? 0.7 : 1,
              transition: 'all 0.2s',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isRedirectingToCheckout ? (
              <>
                <div className="jaldi-loading"></div>
                <span>{t(lang, 'redirecting')}</span>
              </>
            ) : (
              <>
                {/* Credit Card Icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                <span>{config.settings?.cardButtonText && config.settings.cardButtonText !== 'PAY WITH CARD' ? config.settings.cardButtonText : t(lang, 'payWithCard')}</span>
              </>
            )}
          </button>
          </>
        )}

        {/* Pay with PayFast button */}
        {config.settings?.payfastEnabled && (
          <button
            type="button"
            onClick={handlePayWithPayFast}
            disabled={isPayfastProcessing || isSubmitting || isRedirectingToCheckout || variantMixOosError}
            style={{
              width: '100%',
              padding: '14px 20px',
              marginTop: '12px',
              backgroundColor: config.settings?.payfastButtonBgColor || '#00B140',
              color: config.settings?.payfastButtonTextColor || '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              fontSize: `${config.settings?.payfastButtonFontSize || 15}px`,
              fontFamily: 'inherit',
              fontWeight: '600',
              cursor: (isPayfastProcessing || isSubmitting || isRedirectingToCheckout || variantMixOosError) ? 'not-allowed' : 'pointer',
              opacity: (isPayfastProcessing || isSubmitting || isRedirectingToCheckout || variantMixOosError) ? 0.7 : 1,
              transition: 'all 0.2s',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {isPayfastProcessing ? (
              <>
                <div className="jaldi-loading"></div>
                <span>Processing...</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span>{config.settings?.payfastButtonText || 'PAY WITH PAYFAST'}</span>
              </>
            )}
          </button>
        )}

        {/* WhatsApp Buttons - rendered after COD and Pay with Card buttons */}
        {visibleFields.filter(f => f.type === 'whatsapp').map(field => {
          const waNumber = (field.whatsappNumber || '').replace(/\D/g, '');
          const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
          const waMessage = encodeURIComponent((field.whatsappMessage || '').replace('{url}', pageUrl));
          const waLink = `https://wa.me/${waNumber}?text=${waMessage}`;
          return (
            <a
              key={field.id}
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                width: '100%',
                padding: '14px 20px',
                marginTop: '12px',
                backgroundColor: field.whatsappBgColor || '#25d366',
                color: field.whatsappTextColor || '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: `${field.whatsappFontSize || 15}px`,
                fontFamily: 'inherit',
                fontWeight: '600',
                cursor: 'pointer',
                textDecoration: 'none',
                boxSizing: 'border-box',
                letterSpacing: '0.5px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
              </svg>
              {field.label || 'Order by WhatsApp'}
            </a>
          );
        })}

      </form>
          </>
        )}
      </div>

      {/* PayFast Modal — rendered OUTSIDE the COD <form> to prevent nested-form page reload */}
      {showPayFastModal && (
        <PayFastModal
          appPath={appPath}
          shop={config.shopDomain}
          orderPayload={buildPayfastOrderPayload()}
          phone={formData.phone || ''}
          config={config}
          onSuccess={handlePayfastSuccess}
          onClose={() => { setShowPayFastModal(false); setIsPayfastProcessing(false); }}
        />
      )}

      {/* WhatsApp Verification Overlay (Primary) */}
      {otpStep === 'whatsapp' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          zIndex: 10,
        }}>
          {/* WhatsApp Icon */}
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: '#ECFDF5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            border: '2px solid #D1FAE5',
          }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </div>

          <h3 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '6px',
            textAlign: 'center',
          }}>
            {t(lang, 'verifyYourPhone')}
          </h3>

          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            marginBottom: '4px',
            textAlign: 'center',
          }}>
            {t(lang, 'verifyNumberToOrder')}
          </p>
          <p style={{
            fontSize: '15px',
            color: '#111827',
            fontWeight: '600',
            marginBottom: '24px',
            textAlign: 'center',
            letterSpacing: '0.5px',
          }}>
            {formData.phone.replace(/^(\+92)0(\d)/, '$1$2')}
          </p>

          {/* Error message */}
          <div style={{ minHeight: '24px', marginBottom: '8px' }}>
            {waError && (
              <p style={{
                color: '#EF4444',
                fontSize: '13px',
                textAlign: 'center',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {waError}
              </p>
            )}
          </div>

          {/* Verify with WhatsApp button (primary - FREE) */}
          {waLoginStatus === 'idle' && (
            <button
              type="button"
              onClick={handleWhatsAppLogin}
              disabled={isSendingOtp}
              style={{
                width: '100%',
                maxWidth: '310px',
                padding: '14px 20px',
                backgroundColor: '#25D366',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: isSendingOtp ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {isSendingOtp ? (
                <>
                  <div className="jaldi-loading"></div>
                  <span>{t(lang, 'starting')}</span>
                </>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#FFFFFF">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  {t(lang, 'verifyWithWhatsApp')}
                </>
              )}
            </button>
          )}

          {/* Waiting for WhatsApp verification */}
          {waLoginStatus === 'waiting' && (
            <div style={{
              width: '100%',
              maxWidth: '310px',
              padding: '16px 20px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              marginBottom: '12px',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px' }}>
                <div className="jaldi-loading" style={{ borderTopColor: '#25D366' }}></div>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>{t(lang, 'waitingForVerification')}</span>
              </div>
              <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>
                {t(lang, 'sendMessageToVerify')}
              </p>
              {waLoginDeepLink && (
                <button
                  type="button"
                  onClick={() => { openWhatsAppLink(waLoginDeepLink); }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#25D366',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: '4px 0',
                    marginTop: '4px',
                  }}
                >
                  {t(lang, 'openWhatsAppAgain')}
                </button>
              )}
            </div>
          )}

          {/* Verified state (brief flash before auto-submit) */}
          {waLoginStatus === 'verified' && (
            <div style={{
              width: '100%',
              maxWidth: '310px',
              padding: '16px 20px',
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              marginBottom: '12px',
              textAlign: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>{t(lang, 'verifiedPlacingOrder')}</span>
              </div>
            </div>
          )}

          {/* Divider */}
          {waLoginStatus === 'idle' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              maxWidth: '310px',
              margin: '8px 0 16px',
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }}></div>
              <span style={{ padding: '0 12px', fontSize: '12px', color: '#9CA3AF', fontWeight: '500' }}>{t(lang, 'orVerifyWithCode')}</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#E5E7EB' }}></div>
            </div>
          )}

          {/* Fallback buttons */}
          {waLoginStatus === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '310px' }}>
              <button
                type="button"
                onClick={handleSendWhatsAppOtp}
                disabled={isSendingOtp}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#374151',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isSendingOtp ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                {t(lang, 'sendWhatsAppOTP')}
              </button>

              {/* SMS OTP fallback disabled — re-enable when smsmobileapi is active
              <button
                type="button"
                onClick={handleSwitchToSmsOtp}
                disabled={isSendingOtp}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  backgroundColor: '#FFFFFF',
                  color: '#6B7280',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: isSendingOtp ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Send SMS OTP
              </button>
              */}
            </div>
          )}

          {/* Back / Change phone */}
          <button
            type="button"
            onClick={resetVerification}
            style={{
              background: 'none',
              border: 'none',
              color: '#6B7280',
              fontSize: '13px',
              cursor: 'pointer',
              marginTop: '16px',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t(lang, 'changePhoneNumber')}
          </button>

          {/* Bypass for users without WhatsApp */}
          <button
            type="button"
            onClick={() => handleVerificationSuccess(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#9CA3AF',
              fontSize: '12px',
              cursor: 'pointer',
              marginTop: '8px',
              padding: '4px 8px',
              textDecoration: 'underline',
            }}
          >
            {t(lang, 'dontHaveWhatsApp')}
          </button>
        </div>
      )}

      {/* OTP Code Entry Overlay (for WhatsApp OTP or SMS OTP fallback) */}
      {otpStep === 'otp' && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#ffffff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          zIndex: 10,
        }}>
          {/* Icon based on method */}
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: verifyMethod === 'whatsapp-otp' ? '#ECFDF5' : '#F0F9FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            border: verifyMethod === 'whatsapp-otp' ? '2px solid #D1FAE5' : '2px solid #DBEAFE',
          }}>
            {verifyMethod === 'whatsapp-otp' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="#25D366">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            )}
          </div>

          <h3 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '6px',
            textAlign: 'center',
          }}>
            {t(lang, 'enterVerificationCode')}
          </h3>

          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            marginBottom: '4px',
            textAlign: 'center',
          }}>
            {verifyMethod === 'whatsapp-otp'
              ? t(lang, 'enterCodeWhatsApp')
              : t(lang, 'enterCodeSMS')}
          </p>
          <p style={{
            fontSize: '15px',
            color: '#111827',
            fontWeight: '600',
            marginBottom: '28px',
            textAlign: 'center',
            letterSpacing: '0.5px',
          }}>
            {formData.phone.replace(/^(\+92)0(\d)/, '$1$2')}
          </p>

          {/* 6 Individual OTP Boxes */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '8px',
            justifyContent: 'center',
          }}>
            {[0, 1, 2, 3, 4, 5].map((index) => {
              const digit = otpCode[index] || '';
              const isFocused = focusedOtpIndex === index;
              const isFilled = digit !== '';
              return (
                <input
                  key={index}
                  ref={(el) => { otpInputRefs.current[index] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={index === 0}
                  onFocus={() => setFocusedOtpIndex(index)}
                  onBlur={() => setFocusedOtpIndex(-1)}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    if (!val) return;
                    const newCode = otpCode.split('');
                    newCode[index] = val[val.length - 1];
                    for (let i = 0; i < 6; i++) {
                      if (!newCode[i]) newCode[i] = '';
                    }
                    const joined = newCode.join('').replace(/\s/g, '');
                    setOtpCode(joined);
                    setOtpError('');
                    if (index < 5 && otpInputRefs.current[index + 1]) {
                      otpInputRefs.current[index + 1].focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace') {
                      e.preventDefault();
                      const newCode = otpCode.split('');
                      if (newCode[index]) {
                        newCode[index] = '';
                        setOtpCode(newCode.join(''));
                      } else if (index > 0) {
                        newCode[index - 1] = '';
                        setOtpCode(newCode.join(''));
                        otpInputRefs.current[index - 1]?.focus();
                      }
                    }
                    if (e.key === 'ArrowLeft' && index > 0) {
                      otpInputRefs.current[index - 1]?.focus();
                    }
                    if (e.key === 'ArrowRight' && index < 5) {
                      otpInputRefs.current[index + 1]?.focus();
                    }
                  }}
                  onPaste={(e) => {
                    e.preventDefault();
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                    if (pasted) {
                      setOtpCode(pasted);
                      setOtpError('');
                      const focusIdx = Math.min(pasted.length, 5);
                      otpInputRefs.current[focusIdx]?.focus();
                    }
                  }}
                  style={{
                    width: '46px',
                    height: '54px',
                    textAlign: 'center',
                    fontSize: '22px',
                    fontWeight: '700',
                    color: '#111827',
                    border: otpError
                      ? '2px solid #EF4444'
                      : isFocused
                        ? '2px solid #2563EB'
                        : isFilled
                          ? '2px solid #111827'
                          : '2px solid #D1D5DB',
                    borderRadius: '10px',
                    outline: 'none',
                    backgroundColor: isFilled ? '#F8FAFC' : '#FFFFFF',
                    transition: 'all 0.15s ease',
                    caretColor: '#2563EB',
                  }}
                />
              );
            })}
          </div>

          {/* OTP Error */}
          <div style={{ minHeight: '24px', marginBottom: '8px' }}>
            {otpError && (
              <p style={{
                color: '#EF4444',
                fontSize: '13px',
                textAlign: 'center',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {otpError}
              </p>
            )}
          </div>

          {/* Verify Button */}
          <button
            type="button"
            onClick={handleVerifyOtp}
            disabled={isVerifyingOtp || otpCode.length !== 6}
            style={{
              width: '100%',
              maxWidth: '310px',
              padding: '14px 20px',
              backgroundColor: otpCode.length === 6 ? '#000000' : '#D1D5DB',
              color: otpCode.length === 6 ? '#FFFFFF' : '#9CA3AF',
              border: 'none',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: (isVerifyingOtp || otpCode.length !== 6) ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              marginBottom: '20px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            {isVerifyingOtp ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <div className="jaldi-loading"></div>
                <span>{t(lang, 'verifying')}</span>
              </div>
            ) : t(lang, 'verifyAndPlaceOrder')}
          </button>

          {/* Resend / Timer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginBottom: '8px',
          }}>
            {otpCountdown > 0 ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span style={{ fontSize: '13px', color: '#9CA3AF' }}>
                  {t(lang, 'resendCodeIn')} <strong style={{ color: '#6B7280' }}>{otpCountdown}s</strong>
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '13px', color: '#6B7280' }}>{t(lang, 'didntReceiveCode')}</span>
                <button
                  type="button"
                  onClick={handleSendWhatsAppOtp}
                  disabled={isSendingOtp}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#2563EB',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {isSendingOtp ? t(lang, 'sending') : t(lang, 'resend')}
                </button>
              </>
            )}
          </div>

          {/* Back to WhatsApp options */}
          <button
            type="button"
            onClick={() => {
              setOtpStep('whatsapp');
              setOtpCode('');
              setOtpError('');
              setFocusedOtpIndex(-1);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#6B7280',
              fontSize: '13px',
              cursor: 'pointer',
              marginTop: '4px',
              padding: '4px 8px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            {t(lang, 'backToVerificationOptions')}
          </button>
        </div>
      )}
    </div>
  );
}
