import { getShopByDomain, createOrder, updateOrderWithShopifyDetails } from "../lib/db.server";
import { createShopifyOrder, validateOrderData, calculateOrderTotals } from "../lib/order.server";

export const action = async ({ request }) => {
  try {
    const orderData = await request.json();

    // Validate required fields
    const validation = validateOrderData(orderData);
    if (!validation.isValid) {
      return Response.json({
        success: false,
        errors: validation.errors,
      }, { status: 400 });
    }

    // Get shop data
    const shopData = await getShopByDomain(orderData.shop);
    if (!shopData) {
      return Response.json({
        success: false,
        error: "Shop not found",
      }, { status: 404 });
    }

    // Calculate totals
    const totals = calculateOrderTotals(orderData.items, orderData.shippingCost || 0);

    // Create order in database
    const dbOrder = await createOrder(shopData.id, {
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || null,
      phone: orderData.phone,
      address: orderData.address,
      address2: orderData.address2 || null,
      city: orderData.city,
      province: orderData.province,
      postalCode: orderData.postalCode || null,
      country: orderData.country || "Pakistan",
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      total: totals.total,
      customFields: JSON.stringify(orderData.customFields || {}),
      items: JSON.stringify(orderData.items),
      status: "pending",
    });

    // Create admin API client manually with graphql method and access token
    const admin = {
      accessToken: shopData.accessToken,
      graphql: async (query, options) => {
        const response = await fetch(
          `https://${shopData.shopifyDomain}/admin/api/2025-01/graphql.json`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': shopData.accessToken,
            },
            body: JSON.stringify({
              query: query,
              variables: options?.variables,
            }),
          }
        );
        return response;
      },
    };

    // Get field labels from formConfig for custom fields
    const fieldLabels = shopData.formConfig?.fields
      ? JSON.parse(shopData.formConfig.fields).reduce((acc, field) => {
          acc[field.id] = field.label;
          return acc;
        }, {})
      : {};

    const shopifyOrderResult = await createShopifyOrder(admin, {
      customerInfo: {
        firstName: orderData.firstName,
        lastName: orderData.lastName,
        email: orderData.email,
        phone: orderData.phone,
      },
      address: {
        address: orderData.address,
        address2: orderData.address2,
        city: orderData.city,
        province: orderData.province,
        country: orderData.country || "Pakistan",
        postalCode: orderData.postalCode,
      },
      items: orderData.items,
      subtotal: totals.subtotal,
      shipping: totals.shipping,
      total: totals.total,
      customFields: orderData.customFields || {},
      fieldLabels: fieldLabels,
      countryCode: orderData.countryCode,
    }, shopData.shopifyDomain);

    if (shopifyOrderResult.success) {
      // Update database order with Shopify order details
      await updateOrderWithShopifyDetails(
        dbOrder.id,
        shopifyOrderResult.orderId,
        shopifyOrderResult.orderNumber
      );

      return Response.json({
        success: true,
        orderId: dbOrder.id,
        shopifyOrderId: shopifyOrderResult.orderId,
        shopifyOrderNumber: shopifyOrderResult.orderNumber,
      });
    } else {
      // Order created in DB but failed in Shopify
      console.error("Shopify order creation failed:", shopifyOrderResult.error);
      return Response.json({
        success: true,
        orderId: dbOrder.id,
        warning: "Order saved but Shopify sync failed. Please create order manually.",
      });
    }
  } catch (error) {
    console.error("Order submission error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to submit order",
    }, { status: 500 });
  }
};
