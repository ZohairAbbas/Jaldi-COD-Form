import { createShopifyOrder, validateOrderData } from "../lib/order.server";
import { getShopByDomain } from "../lib/db.server";
import prisma from "../db.server";
import shopify from "../shopify.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const orderData = await request.json();

    if (!orderData.shop) {
      return Response.json({ error: "Shop parameter is required" }, { status: 400 });
    }

    // Validate order data
    const validation = validateOrderData(orderData);
    if (!validation.isValid) {
      return Response.json({
        success: false,
        error: validation.errors.join(", ")
      }, { status: 400 });
    }

    // Get shop from database
    const shop = await getShopByDomain(orderData.shop);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    // Calculate totals from items if not provided
    const items = orderData.items || [];
    const calculatedSubtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);
    const shippingCost = parseFloat(orderData.shipping || 0);
    const calculatedTotal = calculatedSubtotal + shippingCost;

    // Save order to database first
    const dbOrder = await prisma.order.create({
      data: {
        shop: {
          connect: { id: shop.id }
        },
        firstName: orderData.firstName,
        lastName: orderData.lastName,
        email: orderData.email || "",
        phone: orderData.phone,
        address: orderData.address,
        address2: orderData.address2 || "",
        city: orderData.city,
        province: orderData.province,
        postalCode: orderData.postalCode || "",
        country: orderData.country || "Pakistan",
        items: JSON.stringify(items),
        subtotal: calculatedSubtotal,
        shipping: shippingCost,
        total: calculatedTotal,
        status: "pending",
      },
    });

    // Create order in Shopify
    try {
      // Create admin API client manually with graphql method
      const admin = {
        graphql: async (query, options) => {
          const response = await fetch(
            `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': shop.accessToken,
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

      const shopifyResult = await createShopifyOrder(admin, {
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
          postalCode: orderData.postalCode,
          country: orderData.country || "Pakistan",
        },
        items: items,
        subtotal: calculatedSubtotal,
        shipping: shippingCost,
        total: calculatedTotal,
      });

      if (shopifyResult.success) {
        // Update database order with Shopify order details
        await prisma.order.update({
          where: { id: dbOrder.id },
          data: {
            shopifyOrderId: shopifyResult.orderId,
            shopifyOrderNumber: shopifyResult.orderNumber,
          },
        });

        return Response.json({
          success: true,
          orderId: dbOrder.id,
          shopifyOrderId: shopifyResult.orderId,
          shopifyOrderNumber: shopifyResult.orderNumber,
        });
      } else {
        // Shopify order creation failed, but we have the DB order
        console.error("Shopify order creation failed:", shopifyResult.error);
        return Response.json({
          success: true,
          orderId: dbOrder.id,
          warning: "Order saved but Shopify sync failed",
        });
      }
    } catch (shopifyError) {
      console.error("Shopify API error:", shopifyError);
      // Order is saved in DB even if Shopify fails
      return Response.json({
        success: true,
        orderId: dbOrder.id,
        warning: "Order saved but Shopify sync failed",
      });
    }
  } catch (error) {
    console.error("Order submission error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to create order"
    }, { status: 500 });
  }
};
