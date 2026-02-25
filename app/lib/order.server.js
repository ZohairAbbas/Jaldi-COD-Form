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
  const { customerInfo, address, items, total, recoveryDiscount, userDiscount, shippingCost = 0, shippingRateName = 'Standard Shipping', utmData = {}, countryCode: passedCountryCode } = orderData;

  // Clean phone number (remove all non-digit characters except +)
  const cleanedPhone = customerInfo.phone.replace(/[^\d+]/g, '');

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

  // Prepare shipping address
  const shippingAddress = {
    firstName: customerInfo.firstName,
    lastName: customerInfo.lastName,
    address1: address.address,
    address2: address.address2 || "",
    city: address.city,
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
      phone: shippingAddress.phone,
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
      phone: billingAddress.phone,
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

    // Prepare REST API order payload
    const restOrder = {
      email: customerInfo.email || `noreply+${cleanedPhone}@example.com`,
      phone: cleanedPhone,
      line_items: restLineItems,
      shipping_address: restShippingAddress,
      billing_address: restBillingAddress,
      financial_status: "pending",
      note: orderNote,
      tags: "preventify_cod_form",
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
          status: "pending",
          amount: total.toString(),
          gateway: "manual",
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
export function validateOrderData(orderData) {
  const errors = [];
  const fieldErrors = {};

  // Validate customer info
  if (!orderData.firstName || orderData.firstName.trim() === "") {
    errors.push("First name is required");
    fieldErrors.firstName = "First name is required";
  }

  // lastName is optional now - will be duplicated from firstName if empty

  // Email is now optional - no validation needed

  if (!orderData.phone || orderData.phone.trim() === "") {
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
  if (!orderData.address || orderData.address.trim() === "") {
    errors.push("Address is required");
    fieldErrors.address = "Address is required";
  }

  if (!orderData.city || orderData.city.trim() === "") {
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
