import { validatePhone, getCurrencySymbol, normalizePrice } from './constants.js';

// Map country names to country codes for currency lookup
const COUNTRY_NAME_TO_CODE = {
  'Pakistan': 'PAK',
  'United Arab Emirates': 'UAE',
  'Qatar': 'QATAR',
  'Kuwait': 'KUWAIT',
  'Saudi Arabia': 'KSA',
};

/**
 * Create a Shopify order directly (not draft order)
 */
export async function createShopifyOrder(admin, orderData, shopDomain) {
  const { customerInfo, address, items, total, recoveryDiscount, userDiscount, shippingCost = 0, shippingRateName = 'Standard Shipping', utmData = {}, countryCode: passedCountryCode, presentmentCurrencyCode, verificationMethod, riskData, _financialStatus, _paymentGateway, _orderTags, _orderNote } = orderData;

  // Clean phone number (remove all non-digit characters except +).
  // Phone may be empty/undefined when the field is hidden in the Form Designer.
  const cleanedPhone = (customerInfo.phone || '').replace(/[^\d+]/g, '');

  // Calculate total discount for one-tick upsells
  let oneTickDiscount = 0;
  items.forEach((item) => {
    if (item.isOneTickUpsell && item.price !== undefined && item.productPrice !== undefined) {
      const productPrice = normalizePrice(item.productPrice);
      const upsellPrice = normalizePrice(item.price);
      const discountAmount = productPrice - upsellPrice;
      if (discountAmount > 0) {
        oneTickDiscount += discountAmount * (item.quantity || 1);
      }
    }
  });

  // Calculate total discount for bundle items (Pumper Bundles)
  let bundleDiscount = 0;
  items.forEach((item) => {
    if (item.bundleDiscount && item.bundleDiscount > 0) {
      bundleDiscount += normalizePrice(item.bundleDiscount);
    }
  });

  // When a core field is hidden in the Form Designer, its value arrives empty.
  // Shopify enforces non-blank address fields per country, so a blank
  // first_name / address1 / city makes POST /orders.json 400. Substitute a
  // neutral placeholder ONLY in the Shopify payload — the DB record (saved by
  // the caller from the original orderData) keeps the real empty value.
  const ADDRESS_PLACEHOLDER = "-";
  const fillCore = (val) => (val && String(val).trim() !== "" ? val : ADDRESS_PLACEHOLDER);

  // Prepare shipping address
  const shippingAddress = {
    firstName: fillCore(customerInfo.firstName),
    lastName: customerInfo.lastName,
    address1: fillCore(address.address),
    address2: address.address2 || "",
    city: fillCore(address.city),
    province: address.province,
    country: address.country || "Pakistan",
    zip: address.postalCode || "",
    phone: cleanedPhone,
  };

  // Prepare billing address (same as shipping for COD)
  const billingAddress = { ...shippingAddress };

  try {
    // Convert GraphQL variant IDs to REST API format (numeric IDs)
    // GraphQL format: "gid://shopify/ProductVariant/12345" -> REST format: 12345
    // Also calculate the correct subtotal using original prices for one-tick upsells
    let calculatedSubtotal = 0;
    const restLineItems = items.map((item) => {
      const variantId = item.variantId.includes('/')
        ? item.variantId.split('/').pop()
        : item.variantId;

      // For one-tick upsells, use the original product price
      // The discount will be applied separately to show the actual upsell price
      const lineItemPrice = item.isOneTickUpsell && item.productPrice
        ? normalizePrice(item.productPrice)
        : normalizePrice(item.price);

      calculatedSubtotal += lineItemPrice * item.quantity;

      return {
        variant_id: parseInt(variantId, 10),
        quantity: item.quantity,
        price: lineItemPrice.toString(),
      };
    });

    // Phone is validated for FORMAT by Shopify, so a placeholder would 400.
    // When the phone field is hidden (empty), omit the key entirely instead.
    const hasPhone = !!cleanedPhone && cleanedPhone.trim() !== "";

    // Convert GraphQL address format to REST API format
    const restShippingAddress = {
      first_name: shippingAddress.firstName,
      last_name: shippingAddress.lastName,
      address1: shippingAddress.address1,
      address2: shippingAddress.address2,
      city: shippingAddress.city,
      province: shippingAddress.province,
      country: shippingAddress.country,
      zip: shippingAddress.zip,
      ...(hasPhone ? { phone: shippingAddress.phone } : {}),
    };

    const restBillingAddress = {
      first_name: billingAddress.firstName,
      last_name: billingAddress.lastName,
      address1: billingAddress.address1,
      address2: billingAddress.address2,
      city: billingAddress.city,
      province: billingAddress.province,
      country: billingAddress.country,
      zip: billingAddress.zip,
      ...(hasPhone ? { phone: billingAddress.phone } : {}),
    };

    // Calculate recovery discount amount (from downsell)
    const recoveryDiscountAmount = recoveryDiscount?.amount || 0;

    // User-entered discount code amount
    const userDiscountAmount = userDiscount?.amount || 0;

    // Get currency symbol based on country
    const countryCode = passedCountryCode || COUNTRY_NAME_TO_CODE[shippingAddress.country] || 'PAK';
    const currencySymbol = getCurrencySymbol(countryCode);

    // Build order note with all discounts and shipping
    let orderNote = "Payment Method: Cash on Delivery (COD)";
    if (shippingCost > 0) {
      orderNote += `\nShipping: ${shippingRateName} - ${currencySymbol}${shippingCost.toFixed(2)}`;
    }
    if (oneTickDiscount > 0) {
      orderNote += `\nOne-Tick Upsell Discount: -${currencySymbol}${oneTickDiscount.toFixed(2)}`;
    }
    if (recoveryDiscountAmount > 0) {
      orderNote += `\nRecovery Discount: -${currencySymbol}${recoveryDiscountAmount.toFixed(2)}`;
    }
    if (userDiscountAmount > 0 && userDiscount?.code) {
      orderNote += `\nDiscount Code: ${userDiscount.code} -${currencySymbol}${userDiscountAmount.toFixed(2)}`;
    }
    if (oneTickDiscount > 0 || recoveryDiscountAmount > 0 || userDiscountAmount > 0) {
      orderNote += `\nActual Total: ${currencySymbol}${total.toFixed(2)}`;
    }
    if (riskData && riskData.riskLevel !== "UNKNOWN") {
      orderNote += `\nPreventify Risk: ${riskData.riskLevel} — ${riskData.riskNote}`;
    }

    // Prepare REST API order payload
    const restOrder = {
      email: customerInfo.email || `noreply+${cleanedPhone || Date.now()}@example.com`,
      ...(hasPhone ? { phone: cleanedPhone } : {}),
      line_items: restLineItems,
      shipping_address: restShippingAddress,
      billing_address: restBillingAddress,
      financial_status: _financialStatus || "pending",
      note: _orderNote || orderNote,
      tags: [
        _orderTags || "preventify_cod_form",
        verificationMethod,
        riskData?.riskLevel === "HIGH" ? "preventify-high-risk" : null,
        riskData?.riskLevel === "MEDIUM" ? "preventify-medium-risk" : null,
        riskData?.riskLevel === "LOW" ? "preventify-trusted-buyer" : null,
      ].filter(Boolean).join(", "),
      // Shopify Markets: set order currency to the presentment (customer-facing) currency.
      // Only set when presentmentCurrencyCode is provided (i.e., Shopify Markets is active).
      // For non-Markets stores this is undefined and Shopify uses the shop's base currency.
      ...(presentmentCurrencyCode ? {
        currency: presentmentCurrencyCode,
        presentment_currency: presentmentCurrencyCode,
      } : {}),
      // Add shipping lines if shipping cost exists
      ...(shippingCost > 0 ? {
        shipping_lines: [{
          title: shippingRateName,
          price: shippingCost.toString(),
          code: 'COD_SHIPPING',
        }]
      } : {}),
      note_attributes: [
        {
          name: "payment_method",
          value: "Cash on Delivery (COD)"
        },
        {
          name: "_payment_pending",
          value: "true"
        },
        ...(oneTickDiscount > 0 ? [{
          name: "_one_tick_discount",
          value: oneTickDiscount.toString()
        }] : []),
        ...(recoveryDiscountAmount > 0 ? [{
          name: "_recovery_discount",
          value: recoveryDiscountAmount.toString()
        }] : []),
        ...(userDiscountAmount > 0 && userDiscount?.code ? [{
          name: "_user_discount_code",
          value: userDiscount.code,
        }, {
          name: "_user_discount_amount",
          value: userDiscountAmount.toString(),
        }] : []),
        // Add custom fields to note_attributes
        ...(orderData.customFields && Object.keys(orderData.customFields).length > 0
          ? Object.entries(orderData.customFields).map(([fieldId, fieldValue]) => {
              // Get field label from formConfig if available, otherwise use fieldId
              const fieldLabel = orderData.fieldLabels?.[fieldId] || fieldId.replace(/custom-/g, '').replace(/-/g, ' ');
              return {
                name: fieldLabel,
                value: String(fieldValue || '')
              };
            })
          : []),
        // Add risk intelligence data
        ...(riskData && riskData.riskLevel !== "UNKNOWN" ? [{
          name: "_preventify_risk_level",
          value: riskData.riskLevel,
        }] : []),
        // Add UTM attribution data to note_attributes
        ...Object.entries(utmData)
          .filter(([, value]) => value)
          .map(([key, value]) => ({
            name: key,
            value: String(value),
          })),
      ],
      transactions: [
        {
          kind: "sale",
          status: _financialStatus === "paid" ? "success" : "pending",
          amount: total.toString(),
          gateway: _paymentGateway || "manual",
        }
      ],
    };

    // Build discount codes array
    // IMPORTANT: Shopify REST API only supports ONE discount code per order.
    // If both user discount and synthetic discounts exist, combine them into a single entry.
    const syntheticDiscount = bundleDiscount + oneTickDiscount + recoveryDiscountAmount;
    const totalDiscountAmount = syntheticDiscount + userDiscountAmount;

    if (totalDiscountAmount > 0) {
      const codeCountryCode = passedCountryCode || COUNTRY_NAME_TO_CODE[address.country] || 'PAK';
      const codeCurrencySymbol = getCurrencySymbol(codeCountryCode);

      // Build descriptive code name that includes all discount sources
      const discountParts = [];
      if (userDiscountAmount > 0 && userDiscount?.code) {
        discountParts.push(`${userDiscount.code}: ${codeCurrencySymbol}${userDiscountAmount.toFixed(2)}`);
      }
      if (bundleDiscount > 0) discountParts.push(`BUNDLE: ${codeCurrencySymbol}${bundleDiscount.toFixed(2)}`);
      if (oneTickDiscount > 0) discountParts.push(`1-TICK: ${codeCurrencySymbol}${oneTickDiscount.toFixed(2)}`);
      if (recoveryDiscountAmount > 0) discountParts.push(`RECOVERY: ${codeCurrencySymbol}${recoveryDiscountAmount.toFixed(2)}`);

      // Use the user's discount code name if it's the only discount, otherwise create a combined name
      const codeName = discountParts.length === 1 && userDiscountAmount > 0 && userDiscount?.code
        ? userDiscount.code
        : `DISCOUNT (${discountParts.join(", ")})`;

      restOrder.discount_codes = [{
        code: codeName,
        amount: totalDiscountAmount.toString(),
        type: "fixed_amount",
      }];
    }

    console.log('[Preventify]', 'shopify-rest-order', JSON.stringify({
      shopDomain: shopDomain,
      currency: restOrder.currency || '(not set - shop default)',
      presentment_currency: restOrder.presentment_currency || '(not set - shop default)',
      inputPresentmentCurrencyCode: presentmentCurrencyCode || null,
      lineItemCount: restLineItems.length,
      lineItems: restLineItems.map(li => ({ variant_id: li.variant_id, price: li.price, quantity: li.quantity })),
      phoneLast4: cleanedPhone?.slice(-4),
    }));

    // Create order using REST API
    const orderResponse = await fetch(
      `https://${shopDomain}/admin/api/2025-01/orders.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': admin.accessToken || '',
        },
        body: JSON.stringify({ order: restOrder }),
      }
    );

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error("REST API order creation failed:", errorText);
      throw new Error(`Order creation failed: ${errorText}`);
    }

    const orderResult = await orderResponse.json();
    const order = orderResult.order;

    if (!order?.id) {
      console.error("Full order result:", JSON.stringify(orderResult, null, 2));
      throw new Error("Failed to create order - no order ID returned");
    }

    console.log('[Preventify]', 'order-created', JSON.stringify({
      orderId: order.id,
      orderName: order.name,
      orderCurrency: order.currency,
      orderPresentmentCurrency: order.presentment_currency,
      totalPrice: order.total_price,
      phoneLast4: cleanedPhone?.slice(-4),
      shopDomain: shopDomain,
    }));

    return {
      success: true,
      orderId: `gid://shopify/Order/${order.id}`, // Convert to GraphQL format for consistency
      orderNumber: order.name,
      confirmationNumber: order.confirmation_number || order.order_number?.toString(),
      financialStatus: order.financial_status,
      orderStatusUrl: order.order_status_url,
    };
  } catch (error) {
    console.error("Shopify order creation error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Calculate order totals
 */
export function calculateOrderTotals(items, shippingCost = 0) {
  const subtotal = items.reduce(
    (sum, item) => sum + normalizePrice(item.price) * item.quantity,
    0,
  );
  const shipping = normalizePrice(shippingCost);
  const total = subtotal + shipping;

  return {
    subtotal: parseFloat(subtotal.toFixed(2)),
    shipping: parseFloat(shipping.toFixed(2)),
    total: parseFloat(total.toFixed(2)),
  };
}

/**
 * Validate order data
 */
export function validateOrderData(orderData, options = {}) {
  const errors = [];
  const fieldErrors = {};

  // Core fields the merchant has hidden in the Form Designer. Hidden fields
  // arrive empty by design, so skip the "required" check for them — the Shopify
  // payload substitutes a placeholder (createShopifyOrder) so the order still
  // succeeds. `hiddenCoreFields` is a Set of form field ids (e.g. "city").
  const hiddenCoreFields = options.hiddenCoreFields || new Set();
  const isHidden = (fieldId) => hiddenCoreFields.has(fieldId);

  // Validate customer info
  if (!isHidden("first-name") && (!orderData.firstName || orderData.firstName.trim() === "")) {
    errors.push("First name is required");
    fieldErrors.firstName = "First name is required";
  }

  // lastName is optional now - will be duplicated from firstName if empty

  // Email is now optional - no validation needed

  if (isHidden("phone")) {
    // Phone field hidden — no value expected, skip entirely
  } else if (!orderData.phone || orderData.phone.trim() === "") {
    errors.push("Phone number is required");
    fieldErrors.phone = "Phone number is required";
  } else {
    // Validate phone format (use countryCode, not country name)
    const phoneValidation = validatePhone(orderData.phone, orderData.countryCode || "PAK");
    if (!phoneValidation.isValid) {
      errors.push(phoneValidation.message);
      fieldErrors.phone = phoneValidation.message;
    }
  }

  // Validate address
  if (!isHidden("address") && (!orderData.address || orderData.address.trim() === "")) {
    errors.push("Address is required");
    fieldErrors.address = "Address is required";
  }

  if (!isHidden("city") && (!orderData.city || orderData.city.trim() === "")) {
    errors.push("City is required");
    fieldErrors.city = "City is required";
  }

  // Province, country, postal code are optional - not validated

  // Validate items
  if (!orderData.items || orderData.items.length === 0) {
    errors.push("At least one item is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
    fieldErrors,
  };
}
