/**
 * Create a Shopify draft order and convert it to an order
 */
export async function createShopifyOrder(admin, orderData) {
  const { customerInfo, address, items, subtotal, shipping, total } = orderData;

  // Prepare line items for Shopify
  const lineItems = items.map((item) => ({
    variantId: item.variantId,
    quantity: item.quantity,
  }));

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

  try {
    // Create draft order
    const draftOrderResponse = await admin.graphql(
      `#graphql
        mutation createDraftOrder($input: DraftOrderInput!) {
          draftOrderCreate(input: $input) {
            draftOrder {
              id
              name
              order {
                id
                name
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          input: {
            lineItems,
            shippingAddress,
            billingAddress: shippingAddress,
            email: customerInfo.email || `noreply+${customerInfo.phone}@example.com`,
            phone: customerInfo.phone,
            note: "COD Order - Cash on Delivery",
            tags: ["COD", "Cash on Delivery"],
            useCustomerDefaultAddress: false,
          },
        },
      },
    );

    const draftOrderResult = await draftOrderResponse.json();

    // Log the full response for debugging
    console.log("Draft order response:", JSON.stringify(draftOrderResult, null, 2));

    if (draftOrderResult.data?.draftOrderCreate?.userErrors?.length > 0) {
      const errors = draftOrderResult.data.draftOrderCreate.userErrors;
      throw new Error(
        `Draft order creation failed: ${errors.map((e) => e.message).join(", ")}`,
      );
    }

    const draftOrder = draftOrderResult.data?.draftOrderCreate?.draftOrder;

    if (!draftOrder?.id) {
      console.error("Full draft order result:", JSON.stringify(draftOrderResult, null, 2));
      throw new Error("Failed to create draft order - no draft order ID returned");
    }

    // Complete the draft order to create an actual order
    const completeResponse = await admin.graphql(
      `#graphql
        mutation completeDraftOrder($id: ID!, $paymentPending: Boolean) {
          draftOrderComplete(id: $id, paymentPending: $paymentPending) {
            draftOrder {
              id
              order {
                id
                name
                displayFinancialStatus
                displayFulfillmentStatus
                totalPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `,
      {
        variables: {
          id: draftOrder.id,
          paymentPending: true,
        },
      },
    );

    const completeResult = await completeResponse.json();

    // Enhanced logging
    console.log("Draft order complete response:", JSON.stringify(completeResult, null, 2));

    if (completeResult.data?.draftOrderComplete?.userErrors?.length > 0) {
      const errors = completeResult.data.draftOrderComplete.userErrors;
      const errorMessage = `Draft order completion failed: ${errors.map((e) => e.message).join(", ")}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    const order = completeResult.data?.draftOrderComplete?.draftOrder?.order;

    if (!order?.id) {
      console.error("No order ID in complete result:", JSON.stringify(completeResult, null, 2));
      throw new Error("Failed to complete draft order - no order ID returned");
    }

    console.log("Order created successfully:", {
      orderId: order.id,
      orderName: order.name,
      financialStatus: order.displayFinancialStatus,
      fulfillmentStatus: order.displayFulfillmentStatus,
    });

    return {
      success: true,
      orderId: order.id,
      orderNumber: order.name,
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
