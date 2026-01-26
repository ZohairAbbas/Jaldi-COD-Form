import { validatePhone } from './constants.js';

/**
 * Create a Shopify order directly (not draft order)
 */
export async function createShopifyOrder(admin, orderData, shopDomain) {
  const { customerInfo, address, items, total, recoveryDiscount, shippingCost = 0, shippingRateName = 'Standard Shipping' } = orderData;

  // Clean phone number (remove all non-digit characters except +)
  const cleanedPhone = customerInfo.phone.replace(/[^\d+]/g, '');

  // Calculate total discount for one-tick upsells
  let oneTickDiscount = 0;
  items.forEach((item) => {
    if (item.isOneTickUpsell && item.price !== undefined && item.productPrice !== undefined) {
      const productPrice = parseFloat(item.productPrice);
      const upsellPrice = parseFloat(item.price);
      const discountAmount = productPrice - upsellPrice;
      if (discountAmount > 0) {
        oneTickDiscount += discountAmount * (item.quantity || 1);
      }
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
        ? parseFloat(item.productPrice)
        : parseFloat(item.price);

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

    // Build order note with all discounts and shipping
    let orderNote = "Payment Method: Cash on Delivery (COD)";
    if (shippingCost > 0) {
      orderNote += `\nShipping: ${shippingRateName} - Rs.${shippingCost.toFixed(2)}`;
    }
    if (oneTickDiscount > 0) {
      orderNote += `\nOne-Tick Upsell Discount: -Rs.${oneTickDiscount.toFixed(2)}`;
    }
    if (recoveryDiscountAmount > 0) {
      orderNote += `\nRecovery Discount: -Rs.${recoveryDiscountAmount.toFixed(2)}`;
    }
    if (oneTickDiscount > 0 || recoveryDiscountAmount > 0) {
      orderNote += `\nActual Total: Rs.${total.toFixed(2)}`;
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
        }] : [])
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

    // Build discount code - Shopify REST API only supports ONE discount code per order
    // So we need to combine all discounts into a single code
    const totalDiscount = oneTickDiscount + recoveryDiscountAmount;
    if (totalDiscount > 0) {
      // Build a descriptive code name showing what discounts are included
      let discountCodeName = "CUSTOM DISCOUNT";
      const discountParts = [];
      if (oneTickDiscount > 0) {
        discountParts.push(`1-TICK: Rs.${oneTickDiscount.toFixed(2)}`);
      }
      if (recoveryDiscountAmount > 0) {
        discountParts.push(`RECOVERY: Rs.${recoveryDiscountAmount.toFixed(2)}`);
      }
      if (discountParts.length > 0) {
        discountCodeName += ` (${discountParts.join(' + ')})`;
      }

      restOrder.discount_codes = [{
        code: discountCodeName,
        amount: totalDiscount.toString(),
        type: "fixed_amount"
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

    // Log the full response for debugging
    console.log("Order creation response:", JSON.stringify(orderResult, null, 2));

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
    (sum, item) => sum + parseFloat(item.price) * item.quantity,
    0,
  );
  const shipping = parseFloat(shippingCost);
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

  if (!orderData.lastName || orderData.lastName.trim() === "") {
    errors.push("Last name is required");
    fieldErrors.lastName = "Last name is required";
  }

  if (!orderData.phone || orderData.phone.trim() === "") {
    errors.push("Phone number is required");
    fieldErrors.phone = "Phone number is required";
  } else {
    // Validate phone format
    const phoneValidation = validatePhone(orderData.phone, orderData.country || "PAK");
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

  if (!orderData.province || orderData.province.trim() === "") {
    errors.push("Province is required");
    fieldErrors.province = "Province is required";
  }

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
