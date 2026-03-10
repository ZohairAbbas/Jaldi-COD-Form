import React, { useState, useEffect, useRef } from 'react';
import { trackInitiateCheckout, trackAddPaymentInfo, trackAddToCart, getEventId, getAttributionData, trackSnapchatStartCheckout, trackTikTokInitiateCheckout } from './pixels';
import { getCurrencyCode, COUNTRIES } from '../lib/constants';

export default function CODForm({ config, cart, onSubmit, onClose, onRemoveItem, mode = 'popup', showProductSelection = false, productSelection, onProductSelectionChange, fullCartItemCount = 0, recoveryDiscount = null, detectedCountry = null, appPath = '/apps/preventify/', variantMixOosError = false }) {
  // Manual country selection state (for user override)
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Priority: user-selected > detected > shop default
  const countryCode = selectedCountry || detectedCountry || config.shop?.country || 'PAK';
  const country = COUNTRIES[countryCode] || COUNTRIES.PAK;

  // Get supported countries for dropdown (only in multi-country mode)
  const supportedCountries = config.shop?.enableMultiCountry
    ? (config.shop.supportedCountries || []).map(code => COUNTRIES[code]).filter(Boolean)
    : [country];

  // Use displayed currency symbol from currency converter if available, otherwise fall back to country's symbol
  const displayCurrency = cart.items?.find(item => item.displayCurrencySymbol);
  const currencySymbol = displayCurrency?.displayCurrencySymbol || country.currencySymbol;

  // Check if RTL is enabled
  const isRTL = config.settings?.enableRTL || false;

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

  // OTP verification state
  const [otpStep, setOtpStep] = useState('form'); // 'form' | 'otp'
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [pendingOrderData, setPendingOrderData] = useState(null);
  const [isLookingUpCustomer, setIsLookingUpCustomer] = useState(false);
  const [focusedOtpIndex, setFocusedOtpIndex] = useState(-1);
  const otpInputRefs = useRef([]);

  // One-Tick Upsells state
  const [selectedUpsells, setSelectedUpsells] = useState(() => {
    // Initialize with preselected upsells
    const oneTickUpsells = config.upsells?.oneTick || [];
    return oneTickUpsells
      .filter(u => u.preselectUpsell)
      .reduce((acc, u) => ({ ...acc, [u.id]: true }), {});
  });

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
    const currency = getCurrencyCode(config.shop?.country);
    trackInitiateCheckout(cart, currency);
    trackSnapchatStartCheckout(cart, currency);
    trackTikTokInitiateCheckout(cart, currency);
  }, []); // Only run once on mount

  // Track when email or phone is entered (session tracking + AddPaymentInfo pixel event)
  useEffect(() => {
    const email = formData.email || null;
    const phone = formData.phone && formData.phone !== country.phoneCode ? formData.phone : null;

    if (email || phone) {
      trackSession(email, phone);

      // Track AddPaymentInfo pixel event
      const currency = getCurrencyCode(config.shop?.country);
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

  // Customer lookup on phone blur
  // Customer lookup disabled - security issue (exposes address for any phone number)
  const handlePhoneBlur = async () => {
    // No-op: customer lookup is disabled
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
        setOtpError(data.error || 'Failed to send OTP');
      }
    } catch (error) {
      setOtpError('Failed to send OTP. Please try again.');
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
        // OTP verified — submit the pending order
        if (pendingOrderData) {
          try {
            await onSubmit(pendingOrderData);
          } catch (error) {
            console.error('Order submission error:', error);
            if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
              setErrors(error.fieldErrors);
              setOtpStep('form'); // Go back to form to show errors
              setPendingOrderData(null);
            } else {
              alert('Failed to submit order: ' + error.message);
            }
            // Only reset on error — on success, the page navigates away so the guard
            // must stay locked to prevent duplicate submissions during redirect.
            setIsSubmitting(false);
            isSubmittingRef.current = false;
          }
        }
      } else {
        setOtpError(data.error || 'Invalid OTP');
      }
    } catch (error) {
      setOtpError('Verification failed. Please try again.');
    } finally {
      setIsVerifyingOtp(false);
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
  };

  // Check if cart has any bundle items (for blocking discount codes on bundles)
  const hasBundleInCart = cart.items.some(item => item.hasBundleDiscount || item.hasCartDiscount);
  const discountBlockedByBundle = hasBundleInCart && config.settings?.allowDiscountOnBundles === false;

  const handleApplyDiscount = async () => {
    const code = discountCodeInput.trim();
    if (!code) return;

    // Block discount codes on bundles if setting is disabled
    if (discountBlockedByBundle) {
      setDiscountError('Discount is not allowed on bundles');
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
        setDiscountError(result.error || 'Invalid discount code');
        setAppliedDiscount(null);
      }
    } catch (error) {
      setDiscountError('Failed to validate discount code');
      setAppliedDiscount(null);
    } finally {
      setIsValidatingDiscount(false);
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

      if (field.required) {
        const value = field.id.startsWith('custom-')
          ? formData.customFields[field.id]
          : formData[field.id.replace(/-/g, '')];

        if (!value || value.trim() === '') {
          newErrors[field.id] = config.formConfig.requiredFieldErrorText;
        }
      }

      // Special validation for phone field
      if (field.id === 'phone') {
        const phoneValue = formData.phone;
        if (!phoneValue.startsWith(country.phoneCode)) {
          newErrors['phone'] = `Phone number must start with ${country.phoneCode}`;
        } else {
          const digitsAfterPrefix = phoneValue.slice(country.phoneCode.length);
          if (digitsAfterPrefix.length < 7 || digitsAfterPrefix.length > 11) {
            newErrors['phone'] = `Phone number must be 7-11 digits after ${country.phoneCode}`;
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
    const selectedOneTickItems = oneTickUpsells
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
    };

    // If OTP is enabled, trigger OTP flow before submitting
    if (config.settings?.enableOTP) {
      setPendingOrderData(orderData);
      await handleSendOtp();
      // Don't setIsSubmitting(false) here — it stays true until OTP completes or user cancels
      return;
    }

    // OTP disabled — submit directly
    try {
      await onSubmit(orderData);
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
        setSubmitError(error.message || 'Failed to submit order. Please try again.');
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

      // Include one-tick upsells
      const oneTickUpsells = config.upsells?.oneTick || [];
      const selectedOneTickItems = oneTickUpsells
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

      const response = await fetch(`${appPath}proxy/draft-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop: config.shopDomain,
          items: allItems,
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
        }),
      });

      const result = await response.json();

      if (result.success && result.invoiceUrl) {
        window.location.href = result.invoiceUrl;
      } else {
        setSubmitError(result.error || 'Failed to create checkout. Please try again.');
        setIsRedirectingToCheckout(false);
      }
    } catch (error) {
      console.error('Pay with Card error:', error);
      setSubmitError('Something went wrong. Please try again.');
      setIsRedirectingToCheckout(false);
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
    const value = formData[fieldId] || '';
    const error = errors[field.id];

    const hasIcon = ['full-name', 'first-name', 'last-name', 'email', 'phone', 'address', 'city'].includes(field.id);

    const inputStyle = {
      width: '100%',
      padding: '10px 12px',
      borderRadius: '0',
      border: 'none',
      fontSize: '16px',
      color: '#111827',
      backgroundColor: '#FFFFFF',
      outline: 'none',
      flex: 1,
    };

    const inputGroupStyle = {
      display: 'flex',
      alignItems: 'center',
      borderRadius: '4px',
      border: error ? '1px solid #EF4444' : '1px solid #D1D5DB',
      backgroundColor: '#FFFFFF',
      overflow: 'hidden',
      flex: 1,
    };

    const iconContainerStyle = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 12px',
      backgroundColor: '#E9ECEF',
      borderRight: '1px solid #D1D5DB',
      borderLeft: 'none',
      alignSelf: 'stretch',
    };

    const labelStyle = {
      display: 'flex',
      alignItems: 'center',
      fontSize: '16px',
      fontWeight: '600',
      color: '#000000',
      width: '100px',
      minWidth: '100px',
      flexShrink: 0,
      lineHeight: '1.3',
    };

    const fieldRowStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      marginBottom: '16px',
    };

    const errorStyle = {
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
          <div style={fieldRowStyle}>
            <label style={labelStyle}>
              {field.label}
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
                  placeholder={discountBlockedByBundle ? 'Not allowed on bundles' : (field.placeholder || 'Discount Code')}
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
                  fontSize: '16px',
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
                ) : 'Apply'}
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
        return (
          <div key={field.id} style={{ marginBottom: '0' }}>
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1, position: 'relative' }}>
                <div style={inputGroupStyle}>
                  {hasIcon && (
                    <div style={iconContainerStyle}>
                      {getFieldIcon(field.id)}
                    </div>
                  )}
                  <input
                    type={field.id === 'phone' ? 'tel' : field.id === 'email' ? 'email' : 'text'}
                    name={field.id}
                    value={value}
                    onChange={(e) => handleChange(fieldId, e.target.value)}
                    onBlur={field.id === 'phone' ? handlePhoneBlur : undefined}
                    placeholder={field.id === 'phone' ? `${country.phoneCode}3001234567` : field.id === 'email' ? 'email@example.com' : field.placeholder}
                    maxLength={field.id === 'phone' ? 15 : undefined}
                    style={inputStyle}
                  />
                  {field.id === 'phone' && isLookingUpCustomer && (
                    <div style={{ padding: '0 12px', display: 'flex', alignItems: 'center' }}>
                      <div className="jaldi-loading" style={{ width: '16px', height: '16px' }}></div>
                    </div>
                  )}
                </div>
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
              <div style={fieldRowStyle}>
                <label style={labelStyle}>
                  {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
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
            <div style={fieldRowStyle}>
              <label style={labelStyle}>
                {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
              </label>
              <div style={{ flex: 1 }}>
                <div style={inputGroupStyle}>
                  <select
                    name={field.id}
                    value={value}
                    onChange={(e) => handleChange(fieldId, e.target.value)}
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
  const oneTickUpsells = config.upsells?.oneTick || [];
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

  // Auto-select first eligible rate or free shipping as default
  useEffect(() => {
    if (eligibleShippingRates.length > 0 && !selectedShippingRate) {
      setSelectedShippingRate(eligibleShippingRates[0]);
    } else if (eligibleShippingRates.length === 0 && !selectedShippingRate) {
      // Default to free shipping if no rates match
      setSelectedShippingRate({ id: 'free', name: 'Free Shipping', price: 0 });
    }
  }, [eligibleShippingRates.length, subtotal, cartWeight, totalQuantity]);

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
        }}>
          {config.formConfig.formTitle}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="jaldi-form-scrollable-content" style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0',
      }}>
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
              What would you like to order?
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
              <option value="current+cart">Current product + Cart items ({1 + fullCartItemCount} items)</option>
              <option value="current">Current product only</option>
            </select>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px 24px' }}>
        {visibleSections.map((section) => {
          switch (section.type) {
            case 'orderSummary':
              return (
                <div key={section.id} style={{
                  marginBottom: '20px',
                  borderTop: '1px solid #E5E7EB',
                  borderBottom: '1px solid #E5E7EB',
                  padding: '16px 0',
                }}>
                  {cart.items.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      gap: '12px',
                      marginBottom: idx === cart.items.length - 1 ? '0' : '16px',
                      position: 'relative',
                    }}>
                      {/* Product Image with Quantity Badge */}
                      {item.image && (
                        <div style={{
                          width: '64px',
                          height: '64px',
                          flexShrink: 0,
                          borderRadius: '8px',
                          overflow: 'visible',
                          backgroundColor: '#F3F4F6',
                          position: 'relative',
                          border: '1px solid #E5E7EB',
                        }}>
                          <img
                            src={item.image}
                            alt={item.title}
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'cover',
                              borderRadius: '7px',
                            }}
                          />
                          {/* Quantity Badge - Top Left */}
                          <div style={{
                            position: 'absolute',
                            top: '-8px',
                            left: '-8px',
                            backgroundColor: '#6B7280',
                            color: '#fff',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontWeight: '600',
                            border: '2px solid #fff',
                          }}>
                            {item.quantity}
                          </div>
                        </div>
                      )}

                      {/* Product Details */}
                      <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        minWidth: 0,
                      }}>
                        <div style={{
                          fontSize: '16px',
                          fontWeight: '700',
                          color: '#000000',
                          marginBottom: '4px',
                          lineHeight: '1.4',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}>
                          {item.title}
                          {item.isUpsell && (
                            <span style={{
                              backgroundColor: '#10b981',
                              color: '#ffffff',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: '600',
                              textTransform: 'uppercase',
                            }}>
                              Upsell
                            </span>
                          )}
                        </div>
                        {item.variant && (
                          <div style={{
                            fontSize: '13px',
                            color: '#6B7280',
                            lineHeight: '1.4',
                          }}>
                            {item.variant}
                          </div>
                        )}
                                              </div>

                      {/* Price - show original price for upsell items since discount is in totals */}
                      {/* For bundle discounts (Pumper Bundles), show both prices */}
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '700',
                        color: '#000000',
                        whiteSpace: 'nowrap',
                        alignSelf: 'center',
                        textAlign: 'right',
                      }}>
                        {item.hasBundleDiscount && item.originalPrice ? (
                          <>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: '400',
                              color: '#9CA3AF',
                              textDecoration: 'line-through',
                            }}>
                              {currencySymbol}{(item.displayOriginalPrice != null ? item.displayOriginalPrice : item.originalPrice).toFixed(2)}
                            </div>
                            <div style={{ color: '#10b981' }}>
                              {currencySymbol}{(item.displayPrice != null ? item.displayPrice : item.price).toFixed(2)}
                            </div>
                          </>
                        ) : item.hasCartDiscount && item.originalPrice ? (
                          <>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: '400',
                              color: '#9CA3AF',
                              textDecoration: 'line-through',
                            }}>
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

                      {/* Remove Button (X) - Top Right - Only show in popup mode */}
                      {mode === 'popup' && onRemoveItem && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            onRemoveItem(item.variantId);
                          }}
                          style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-4px',
                            background: '#6B7280',
                            border: 'none',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            color: '#fff',
                            fontSize: '12px',
                            lineHeight: '1',
                            padding: '0',
                            fontWeight: '600',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );

            case 'totals':
              return (
                <div key={section.id} style={{
                  marginBottom: '20px',
                  padding: '8px 12px',
                  backgroundColor: '#F3F4F6',
                  borderRadius: '4px',
                  border: '1px solid #E5E7EB',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '2.5px 0',
                    fontSize: '16px',
                    fontWeight: '400',
                    color: '#000000',
                  }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: '600' }}>{currencySymbol}{displaySubtotal.toFixed(2)}</span>
                  </div>
                  {/* Show bundle discount line if there's a bundle discount from Pumper Bundles */}
                  {bundleDiscount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2.5px 0',
                      fontSize: '16px',
                      fontWeight: '400',
                      color: '#000000',
                    }}>
                      <span>Bundle Discount</span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayBundleDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Show discount line if there's an upsell discount */}
                  {upsellDiscount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2.5px 0',
                      fontSize: '16px',
                      fontWeight: '400',
                      color: '#000000',
                    }}>
                      <span>Upsell Discount</span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayUpsellDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Show recovery discount line if there's a recovery discount from downsell */}
                  {recoveryDiscount && recoveryDiscountAmount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2.5px 0',
                      fontSize: '16px',
                      fontWeight: '400',
                      color: '#000000',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px' }}>⊘</span>
                        Recovery Discount
                      </span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayRecoveryDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Show user discount code line if a discount code is applied */}
                  {appliedDiscount && userDiscountAmount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '2.5px 0',
                      fontSize: '16px',
                      fontWeight: '400',
                      color: '#000000',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px' }}>&#x25C7;</span>
                        {appliedDiscount.code}
                      </span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{currencySymbol}{displayUserDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    padding: '2.5px 0',
                    fontSize: '16px',
                    fontWeight: '400',
                    color: '#000000',
                  }}>
                    <span>Shipping</span>
                    <span style={{
                      fontWeight: '600',
                    }}>
                      {shippingCost === 0 ? 'Free' : `${currencySymbol}${displayShippingCost.toFixed(2)}`}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    marginTop: '4px',
                    borderTop: '1px solid #D1D5DB',
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#000000',
                  }}>
                    <span>Total</span>
                    <span>{currencySymbol}{displayTotal.toFixed(2)}</span>
                  </div>
                </div>
              );

            case 'shippingMethod':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    marginBottom: '8px',
                    color: '#000',
                  }}>
                    Shipping Options
                  </h3>

                  {eligibleShippingRates.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {eligibleShippingRates.map(rate => (
                        <label
                          key={rate.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 16px',
                            border: selectedShippingRate?.id === rate.id
                              ? '1px solid #000'
                              : '1px solid #D1D5DB',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: '#FFFFFF',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="radio"
                              name="shippingRate"
                              checked={selectedShippingRate?.id === rate.id}
                              onChange={() => setSelectedShippingRate(rate)}
                              style={{
                                width: '16px',
                                height: '16px',
                                accentColor: '#000',
                              }}
                            />
                            <span style={{ fontSize: '16px', color: '#000000' }}>
                              {rate.name}
                            </span>
                          </div>
                          <span style={{
                            fontSize: '16px',
                            fontWeight: '700',
                            color: '#000000',
                          }}>
                            {rate.price === 0 ? 'Free' : `${currencySymbol}${(hasDisplayPrice ? parseFloat((rate.price * displayExchangeRate).toFixed(2)) : rate.price).toFixed(2)}`}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    // Fallback to free shipping
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
                        <span style={{ fontSize: '16px', color: '#000000' }}>Free shipping</span>
                      </div>
                      <span style={{ fontSize: '16px', fontWeight: '700', color: '#000000' }}>Free</span>
                    </label>
                  )}
                </div>
              );

            case 'shippingAddress':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '700',
                    marginBottom: '16px',
                    color: '#000',
                  }}>
                    Enter your shipping address
                  </h3>

                  {/* Country Selector - Only show in multi-country mode with more than 1 country */}
                  {config.shop?.enableMultiCountry && supportedCountries.length > 1 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '16px',
                    }}>
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#000000',
                        width: '100px',
                        minWidth: '100px',
                        flexShrink: 0,
                        lineHeight: '1.3',
                      }}>
                        Country
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
                              fontSize: '16px',
                              backgroundColor: '#fff',
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
                            Auto-detected based on your location
                          </small>
                        )}
                      </div>
                    </div>
                  )}

                  {visibleFields.map(renderField)}
                </div>
              );

            default:
              return null;
          }
        })}

        {/* One-Tick Upsells */}
        {oneTickUpsells.length > 0 && oneTickUpsells.map((upsell) => {
          const isSelected = selectedUpsells[upsell.id] || false;

          // Replace placeholders in checkbox text (use converted price if available)
          const oneTickPrice = hasDisplayPrice && displayExchangeRate
            ? parseFloat((upsell.upsellPrice * displayExchangeRate).toFixed(2))
            : upsell.upsellPrice;
          const oneTickCurrency = hasDisplayPrice ? currencySymbol : getCurrencyCode(config.shop?.country);
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
                      const currency = getCurrencyCode(config.shop?.country);
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
            Please remove out of stock item(s) from your bundle selection
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
              fontSize: `${config.formConfig?.submitButtonFontSize || 14}px`,
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
                <span>Processing...</span>
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
                {`COMPLETE ORDER - ${currencySymbol}${displayTotal.toFixed(2)}`}
              </>
            )}
          </button>
        )}

        {/* Pay with Card Button - Only show if enabled */}
        {config.settings?.enableCartPermalink && (
          <button
            type="button"
            onClick={handlePayWithCard}
            disabled={isRedirectingToCheckout || isSubmitting || variantMixOosError}
            style={{
              width: '100%',
              padding: '14px 20px',
              marginTop: config.settings?.hideCompleteOrderButton ? '0' : '12px',
              backgroundColor: config.settings?.cardButtonBgColor || '#FFFFFF',
              color: config.settings?.cardButtonTextColor || '#000000',
              border: '2px solid #000000',
              borderRadius: '4px',
              fontSize: `${config.settings?.cardButtonFontSize || 14}px`,
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
                <span>Redirecting...</span>
              </>
            ) : (
              <>
                {/* Credit Card Icon */}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                <span>{config.settings?.cardButtonText || 'PAY WITH CARD'}</span>
              </>
            )}
          </button>
        )}
      </form>
      </div>

      {/* OTP Verification Overlay */}
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
          {/* Shield Icon with animated ring */}
          <div style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            backgroundColor: '#F0F9FF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            border: '2px solid #DBEAFE',
          }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>

          <h3 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#111827',
            marginBottom: '6px',
            textAlign: 'center',
          }}>
            Verify Your Phone
          </h3>

          <p style={{
            fontSize: '14px',
            color: '#6B7280',
            marginBottom: '4px',
            textAlign: 'center',
          }}>
            Enter the 6-digit code sent to
          </p>
          <p style={{
            fontSize: '15px',
            color: '#111827',
            fontWeight: '600',
            marginBottom: '28px',
            textAlign: 'center',
            letterSpacing: '0.5px',
          }}>
            {formData.phone}
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
                    // Fill any gaps with empty strings
                    for (let i = 0; i < 6; i++) {
                      if (!newCode[i]) newCode[i] = '';
                    }
                    const joined = newCode.join('').replace(/\s/g, '');
                    setOtpCode(joined);
                    setOtpError('');
                    // Auto-focus next box
                    if (index < 5 && otpInputRefs.current[index + 1]) {
                      otpInputRefs.current[index + 1].focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    // On backspace, clear current and go to previous
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
                    // Arrow keys navigation
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
                <span>Verifying...</span>
              </div>
            ) : 'VERIFY & PLACE ORDER'}
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
                  Resend code in <strong style={{ color: '#6B7280' }}>{otpCountdown}s</strong>
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '13px', color: '#6B7280' }}>Didn't receive the code?</span>
                <button
                  type="button"
                  onClick={handleSendOtp}
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
                  {isSendingOtp ? 'Sending...' : 'Resend'}
                </button>
              </>
            )}
          </div>

          {/* Back / Change phone */}
          <button
            type="button"
            onClick={() => {
              setOtpStep('form');
              setOtpCode('');
              setOtpError('');
              setFocusedOtpIndex(-1);
              setIsSubmitting(false);
              setPendingOrderData(null);
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
            Change phone number
          </button>
        </div>
      )}
    </div>
  );
}
