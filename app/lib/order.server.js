/**
 * Create a Shopify order directly (not draft order)
 */
export async function createShopifyOrder(admin, orderData, shopDomain) {
  const { customerInfo, address, items, total } = orderData;

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
    phone: customerInfo.phone,
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

    // Prepare REST API order payload
    const restOrder = {
      email: customerInfo.email || `noreply+${customerInfo.phone}@example.com`,
      phone: customerInfo.phone,
      line_items: restLineItems,
      shipping_address: restShippingAddress,
      billing_address: restBillingAddress,
      financial_status: "pending",
      note: oneTickDiscount > 0
        ? `Payment Method: Cash on Delivery (COD)\nOne-Tick Upsell Discount: -Rs.${oneTickDiscount.toFixed(2)}\nActual Total: Rs.${total.toFixed(2)}`
        : "Payment Method: Cash on Delivery (COD)",
      tags: "preventify_cod_form",
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

    // Add discount code if one-tick discount exists
    if (oneTickDiscount > 0) {
      restOrder.discount_codes = [
        {
          code: "CUSTOM DISCOUNT (1-TICK)",
          amount: oneTickDiscount.toString(),
          type: "fixed_amount"
        }
      ];
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

  // Validate customer info
  if (!orderData.firstName || orderData.firstName.trim() === "") {
    errors.push("First name is required");
  }

  if (!orderData.lastName || orderData.lastName.trim() === "") {
    errors.push("Last name is required");
  }

  if (!orderData.phone || orderData.phone.trim() === "") {
    errors.push("Phone number is required");
  }

  // Validate address
  if (!orderData.address || orderData.address.trim() === "") {
    errors.push("Address is required");
  }

  if (!orderData.city || orderData.city.trim() === "") {
    errors.push("City is required");
  }

  if (!orderData.province || orderData.province.trim() === "") {
    errors.push("Province is required");
  }

  // Validate items
  if (!orderData.items || orderData.items.length === 0) {
    errors.push("At least one item is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
