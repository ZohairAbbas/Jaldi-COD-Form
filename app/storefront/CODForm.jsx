import React, { useState, useEffect } from 'react';
import { trackInitiateCheckout, trackAddPaymentInfo, trackAddToCart, getEventId, getAttributionData } from './pixels';
import { getCurrencyCode } from '../lib/constants';

// Country data - must match server-side constants
const COUNTRIES = {
  PAK: {
    code: 'PAK',
    phoneCode: '+92',
    name: 'Pakistan',
    currencySymbol: 'Rs.',
    provinces: ['Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan', 'Gilgit-Baltistan', 'Azad Jammu & Kashmir', 'Islamabad Capital Territory']
  },
  UAE: {
    code: 'UAE',
    phoneCode: '+971',
    name: 'United Arab Emirates',
    currencySymbol: 'Dhs.',
    provinces: ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah']
  },
  QATAR: {
    code: 'QATAR',
    phoneCode: '+974',
    name: 'Qatar',
    currencySymbol: 'QR',
    provinces: ['Doha', 'Al Rayyan', 'Al Wakrah', 'Al Khor', 'Al Daayen', 'Umm Salal', 'Al Shamal', 'Al Shahaniya']
  },
  KUWAIT: {
    code: 'KUWAIT',
    phoneCode: '+965',
    name: 'Kuwait',
    currencySymbol: 'KD',
    provinces: ['Al Asimah', 'Hawalli', 'Farwaniya', 'Mubarak Al-Kabeer', 'Ahmadi', 'Jahra']
  },
  KSA: {
    code: 'KSA',
    phoneCode: '+966',
    name: 'Saudi Arabia',
    currencySymbol: 'SAR',
    provinces: ['Riyadh', 'Makkah', 'Madinah', 'Eastern Province', 'Asir', 'Tabuk', 'Qassim', 'Ha\'il', 'Northern Borders', 'Jizan', 'Najran', 'Al Bahah', 'Al Jawf']
  }
};

export default function CODForm({ config, cart, onSubmit, onClose, onRemoveItem, mode = 'popup', showProductSelection = false, productSelection, onProductSelectionChange, fullCartItemCount = 0, recoveryDiscount = null, detectedCountry = null, appPath = '/apps/preventify/' }) {
  // Manual country selection state (for user override)
  const [selectedCountry, setSelectedCountry] = useState(null);

  // Priority: user-selected > detected > shop default
  const countryCode = selectedCountry || detectedCountry || config.shop?.country || 'PAK';
  const country = COUNTRIES[countryCode] || COUNTRIES.PAK;

  // Get supported countries for dropdown (only in multi-country mode)
  const supportedCountries = config.shop?.enableMultiCountry
    ? (config.shop.supportedCountries || []).map(code => COUNTRIES[code]).filter(Boolean)
    : [country];

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRedirectingToCheckout, setIsRedirectingToCheckout] = useState(false);

  // One-Tick Upsells state
  const [selectedUpsells, setSelectedUpsells] = useState(() => {
    // Initialize with preselected upsells
    const oneTickUpsells = config.upsells?.oneTick || [];
    return oneTickUpsells
      .filter(u => u.preselectUpsell)
      .reduce((acc, u) => ({ ...acc, [u.id]: true }), {});
  });

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

  const formStyle = {
    backgroundColor: config.formConfig.backgroundColor,
    color: config.formConfig.textColor,
    fontSize: `${config.formConfig.fontSize}px`,
    borderRadius: mode === 'popup' ? `${config.formConfig.borderRadius}px` : '0',
    border: mode === 'popup' ? 'none' : `${config.formConfig.borderWidth}px solid ${config.formConfig.borderColor}`,
    boxShadow: mode === 'popup' ? 'none' : `0 ${config.formConfig.shadowIntensity}px ${config.formConfig.shadowIntensity * 2}px rgba(0,0,0,0.1)`,
    padding: '0',
    maxWidth: mode === 'popup' ? '500px' : '100%',
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

  const validate = () => {
    const newErrors = {};

    visibleFields.forEach(field => {
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

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

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
    let derivedFirstName = formData.firstName || formData.firstname || '';
    let derivedLastName = formData.lastName || formData.lastname || '';

    // If last name is empty, duplicate first name (Shopify requires both)
    if (!derivedLastName || derivedLastName.trim() === '') {
      derivedLastName = derivedFirstName;
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
      // Pixel tracking data for server-side CAPI
      pixelEventId,
      pixelAttribution: attributionData,
    };

    try {
      await onSubmit(orderData);
    } catch (error) {
      console.error('Order submission error:', error);

      // If server returned field-specific errors, display them
      if (error.fieldErrors && Object.keys(error.fieldErrors).length > 0) {
        setErrors(error.fieldErrors);
        // Scroll to first error field
        const firstErrorField = Object.keys(error.fieldErrors)[0];
        const errorElement = document.querySelector(`[name="${firstErrorField}"]`);
        if (errorElement) {
          errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          errorElement.focus();
        }
      } else {
        // Generic error message if no field-specific errors
        alert('Failed to submit order: ' + error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Pay with Card - redirects to Shopify checkout via cart permalink
  const handlePayWithCard = () => {
    if (!validate()) {
      return;
    }

    setIsRedirectingToCheckout(true);

    // Build cart items string: variant_id:quantity,variant_id:quantity
    const cartItemsString = cart.items
      .filter(item => item.variantId) // Only include items with variant IDs
      .map(item => {
        const variantId = item.variantId.includes('/')
          ? item.variantId.split('/').pop()
          : item.variantId;
        return `${variantId}:${item.quantity}`;
      })
      .join(',');

    if (!cartItemsString) {
      alert('No valid items to checkout');
      setIsRedirectingToCheckout(false);
      return;
    }

    // Build checkout query parameters for pre-filling customer info
    const checkoutParams = new URLSearchParams();

    // Parse full name into first/last name for checkout
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
    const phone = formData.phone || '';
    const address1 = formData.address || '';
    const address2 = formData.address2 || '';
    const city = formData.city || '';
    const province = formData.province || '';
    const postalCode = formData.postalcode || formData.postalCode || '';

    // Customer email
    if (formData.email) {
      checkoutParams.set('checkout[email]', formData.email);
    }

    // Shipping address
    checkoutParams.set('checkout[shipping_address][first_name]', firstName);
    checkoutParams.set('checkout[shipping_address][last_name]', lastName);
    checkoutParams.set('checkout[shipping_address][phone]', phone);
    checkoutParams.set('checkout[shipping_address][address1]', address1);
    checkoutParams.set('checkout[shipping_address][address2]', address2);
    checkoutParams.set('checkout[shipping_address][city]', city);
    checkoutParams.set('checkout[shipping_address][province]', province);
    checkoutParams.set('checkout[shipping_address][country]', country.name || 'Pakistan');
    checkoutParams.set('checkout[shipping_address][zip]', postalCode);

    // Add cart attributes to identify this order came from our app
    checkoutParams.set('attributes[_preventify_source]', 'card_checkout');
    checkoutParams.set('attributes[_preventify_shop]', config.shopDomain || '');

    // Build the cart permalink URL
    const cartPermalinkUrl = `/cart/${cartItemsString}?${checkoutParams.toString()}`;

    // Redirect to cart permalink (which will redirect to checkout)
    window.location.href = cartPermalinkUrl;
  };

  // Icon components - position changes based on RTL
  const iconPosition = isRTL ? { right: '12px' } : { left: '12px' };

  const PersonIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', ...iconPosition, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );

  const PhoneIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', ...iconPosition, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );

  const EmailIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', ...iconPosition, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );

  const LocationIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', ...iconPosition, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );

  const renderField = (field) => {
    const fieldId = field.id.replace(/-/g, '');
    const value = formData[fieldId] || '';
    const error = errors[field.id];

    const hasIcon = ['full-name', 'first-name', 'last-name', 'email', 'phone', 'address', 'city'].includes(field.id);

    const inputStyle = {
      width: '100%',
      padding: hasIcon
        ? (isRTL ? '10px 42px 10px 12px' : '10px 12px 10px 42px')
        : '10px 12px',
      borderRadius: '4px',
      border: error ? '1px solid #EF4444' : '1px solid #D1D5DB',
      fontSize: '14px',
      color: '#111827',
      backgroundColor: '#FFFFFF',
      outline: 'none',
      textAlign: isRTL ? 'right' : 'left',
    };

    const labelStyle = {
      display: 'block',
      marginBottom: '6px',
      fontSize: '14px',
      fontWeight: '500',
      color: '#111827',
      textAlign: isRTL ? 'right' : 'left',
    };

    const errorStyle = {
      color: '#EF4444',
      fontSize: '12px',
      marginTop: '4px',
      textAlign: isRTL ? 'right' : 'left',
    };

    const getFieldIcon = (fieldId) => {
      if (fieldId === 'full-name' || fieldId === 'first-name' || fieldId === 'last-name') return <PersonIcon />;
      if (fieldId === 'email') return <EmailIcon />;
      if (fieldId === 'phone') return <PhoneIcon />;
      if (fieldId === 'address' || fieldId === 'city') return <LocationIcon />;
      return null;
    };

    switch (field.type) {
      case 'text':
        return (
          <div key={field.id} style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <div style={{ position: 'relative' }}>
              {getFieldIcon(field.id)}
              <input
                type={field.id === 'phone' ? 'tel' : field.id === 'email' ? 'email' : 'text'}
                value={value}
                onChange={(e) => handleChange(fieldId, e.target.value)}
                placeholder={field.id === 'phone' ? `${country.phoneCode}3001234567` : field.id === 'email' ? 'email@example.com' : field.placeholder}
                maxLength={field.id === 'phone' ? 15 : undefined}
                style={inputStyle}
              />
            </div>
            {error && <div style={errorStyle}>{error}</div>}
          </div>
        );

      case 'dropdown':
        // Use country-based provinces for province field
        const options = field.id === 'province' ? country.provinces : field.options;
        return (
          <div key={field.id} style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              {field.label} {field.required && <span style={{ color: '#EF4444' }}>*</span>}
            </label>
            <select
              value={value}
              onChange={(e) => handleChange(fieldId, e.target.value)}
              style={inputStyle}
            >
              <option value="">{field.placeholder || 'Select...'}</option>
              {options?.map((opt, idx) => (
                <option key={idx} value={opt}>{opt}</option>
              ))}
            </select>
            {error && <div style={errorStyle}>{error}</div>}
          </div>
        );

      default:
        return null;
    }
  };

  // Calculate subtotal using original prices for upsell items and bundle items, regular price for others
  // Note: For bundle items (Pumper Bundles), the price is already the total bundle price, not per-unit
  const subtotal = cart.items.reduce((sum, item) => {
    if (item.hasBundleDiscount && item.originalPrice) {
      // Bundle price is already the total for all units, don't multiply by quantity
      return sum + item.originalPrice;
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

  // Calculate bundle discount (from Pumper Bundles or similar apps)
  // Note: Bundle prices are already totals, not per-unit prices
  const bundleDiscount = cart.items.reduce((sum, item) => {
    if (item.hasBundleDiscount && item.originalPrice && item.originalPrice !== item.price) {
      return sum + (item.originalPrice - item.price);
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

  // Calculate recovery discount amount (from downsell)
  const recoveryDiscountAmount = recoveryDiscount
    ? (recoveryDiscount.type === 'percentage'
        ? subtotal * (recoveryDiscount.value / 100)
        : Math.min(recoveryDiscount.value, subtotal))
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

  // Final total after discount + one-tick upsells - recovery discount + shipping
  const total = subtotal - bundleDiscount - upsellDiscount + oneTickTotal - recoveryDiscountAmount + shippingCost;

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
          fontWeight: '600',
          letterSpacing: '0.5px',
          color: '#000',
          textAlign: isRTL ? 'right' : 'left',
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
              textAlign: isRTL ? 'right' : 'left',
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
                textAlign: isRTL ? 'right' : 'left',
                direction: isRTL ? 'rtl' : 'ltr',
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
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  {/* <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '12px',
                    color: '#000',
                  }}>
                    Order Summary
                  </h3> */}
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
                          fontSize: '14px',
                          fontWeight: '500',
                          color: '#111827',
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
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#111827',
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
                              {country.currencySymbol}{(item.originalPrice).toFixed(2)}
                            </div>
                            <div style={{ color: '#10b981' }}>
                              {country.currencySymbol}{(item.price).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <>{country.currencySymbol}{((item.isUpsell && item.originalPrice ? item.originalPrice : item.price) * item.quantity).toFixed(2)}</>
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
                  padding: '16px',
                  backgroundColor: '#F3F4F6',
                  borderRadius: '6px',
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#374151',
                  }}>
                    <span>Subtotal</span>
                    <span style={{ color: '#111827', fontWeight: '600' }}>{country.currencySymbol}{subtotal.toFixed(2)}</span>
                  </div>
                  {/* Show bundle discount line if there's a bundle discount from Pumper Bundles */}
                  {bundleDiscount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#374151',
                    }}>
                      <span>Bundle Discount</span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{country.currencySymbol}{bundleDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Show discount line if there's an upsell discount */}
                  {upsellDiscount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#374151',
                    }}>
                      <span>Upsell Discount</span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{country.currencySymbol}{upsellDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {/* Show recovery discount line if there's a recovery discount from downsell */}
                  {recoveryDiscount && recoveryDiscountAmount > 0 && (
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '10px',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#374151',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '12px' }}>⊘</span>
                        RECOVERY DISCOUNT
                      </span>
                      <span style={{ color: '#10B981', fontWeight: '600' }}>-{country.currencySymbol}{recoveryDiscountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '10px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: '#374151',
                  }}>
                    <span>Shipping</span>
                    <span style={{
                      color: shippingCost === 0 ? '#10B981' : '#111827',
                      fontWeight: '600'
                    }}>
                      {shippingCost === 0 ? 'Free' : `${country.currencySymbol}${shippingCost.toFixed(2)}`}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '12px',
                    borderTop: '1px solid #D1D5DB',
                    fontSize: '16px',
                    fontWeight: '700',
                    color: '#111827',
                  }}>
                    <span>Total</span>
                    <span>{country.currencySymbol}{total.toFixed(2)}</span>
                  </div>
                </div>
              );

            case 'shippingMethod':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '12px',
                    color: '#000',
                  }}>
                    Shipping Method
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
                            padding: '12px',
                            border: selectedShippingRate?.id === rate.id
                              ? '2px solid #000'
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
                            <div>
                              <span style={{ fontSize: '14px', color: '#111827' }}>
                                {rate.name}
                              </span>
                              {rate.description && (
                                <div style={{ fontSize: '12px', color: '#6B7280' }}>
                                  {rate.description}
                                </div>
                              )}
                            </div>
                          </div>
                          <span style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: rate.price === 0 ? '#10B981' : '#111827'
                          }}>
                            {rate.price === 0 ? 'Free' : `${country.currencySymbol}${rate.price.toFixed(2)}`}
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
                      padding: '12px',
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
                        <span style={{ fontSize: '14px', color: '#111827' }}>Free shipping</span>
                      </div>
                      <span style={{ fontSize: '14px', fontWeight: '500', color: '#10B981' }}>Free</span>
                    </label>
                  )}
                </div>
              );

            case 'shippingAddress':
              return (
                <div key={section.id} style={{ marginBottom: '20px' }}>
                  <h3 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '16px',
                    color: '#000',
                  }}>
                    Enter your shipping address
                  </h3>

                  {/* Country Selector - Only show in multi-country mode with more than 1 country */}
                  {config.shop?.enableMultiCountry && supportedCountries.length > 1 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label style={{
                        display: 'block',
                        marginBottom: '8px',
                        fontWeight: 500,
                        fontSize: `${config.formConfig?.fontSize || 14}px`,
                        color: config.formConfig?.textColor || '#333',
                        textAlign: isRTL ? 'right' : 'left',
                      }}>
                        Country <span style={{ color: '#EF4444' }}>*</span>
                      </label>
                      <select
                        value={countryCode}
                        onChange={(e) => {
                          setSelectedCountry(e.target.value);
                          // Reset province and update phone when country changes
                          const newCountry = COUNTRIES[e.target.value];
                          setFormData(prev => ({
                            ...prev,
                            province: '',
                            phone: newCountry?.phoneCode || '',
                          }));
                        }}
                        style={{
                          width: '100%',
                          padding: '10px',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: `${config.formConfig?.fontSize || 14}px`,
                          backgroundColor: '#fff',
                          cursor: 'pointer',
                          textAlign: isRTL ? 'right' : 'left',
                          direction: isRTL ? 'rtl' : 'ltr',
                        }}
                      >
                        {supportedCountries.map(c => (
                          <option key={c.code} value={c.code}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {detectedCountry && !selectedCountry && (
                        <small style={{
                          display: 'block',
                          marginTop: '4px',
                          color: '#666',
                          fontSize: '12px',
                          textAlign: isRTL ? 'right' : 'left',
                        }}>
                          Auto-detected based on your location
                        </small>
                      )}
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
          const getCurrency = () => {
            return getCurrencyCode(config.shop?.country);
          };

          // Replace placeholders in checkbox text
          const checkboxText = upsell.checkboxText
            .replace('{title}', upsell.upsellTitle || '')
            .replace('{price}', `${getCurrency()} ${upsell.upsellPrice?.toFixed(2) || '0.00'}`);

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
                      fontSize: '14px',
                      fontWeight: '500',
                      color: upsell.textColor || '#000000',
                      marginBottom: upsell.descriptionText ? '4px' : '0',
                    }}
                  >
                    {checkboxText}
                  </div>
                  {upsell.descriptionText && (
                    <div
                      style={{
                        fontSize: '13px',
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

        <button
          type="submit"
          disabled={isSubmitting}
          style={{
            width: '100%',
            padding: '14px 20px',
            backgroundColor: '#000000',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: isSubmitting ? 'not-allowed' : 'pointer',
            opacity: isSubmitting ? 0.7 : 1,
            transition: 'opacity 0.2s',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
        >
          {isSubmitting ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <div className="jaldi-loading"></div>
              <span>Processing...</span>
            </div>
          ) : (
            `COMPLETE ORDER - ${country.currencySymbol}${total.toFixed(2)}`
          )}
        </button>

        {/* Pay with Card Button - Only show if enabled */}
        {config.settings?.enableCartPermalink && (
          <button
            type="button"
            onClick={handlePayWithCard}
            disabled={isRedirectingToCheckout || isSubmitting}
            style={{
              width: '100%',
              padding: '14px 20px',
              marginTop: '12px',
              backgroundColor: config.settings?.cardButtonBgColor || '#FFFFFF',
              color: config.settings?.cardButtonTextColor || '#000000',
              border: '2px solid #000000',
              borderRadius: '4px',
              fontSize: `${config.settings?.cardButtonFontSize || 14}px`,
              fontWeight: '600',
              cursor: (isRedirectingToCheckout || isSubmitting) ? 'not-allowed' : 'pointer',
              opacity: (isRedirectingToCheckout || isSubmitting) ? 0.7 : 1,
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
    </div>
  );
}
