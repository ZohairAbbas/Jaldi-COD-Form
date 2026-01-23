import { createShopifyOrder, validateOrderData } from "../lib/order.server";
import { getShopByDomain } from "../lib/db.server";
import { generateCartPermalink } from "../lib/checkout.server";
import prisma from "../db.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const action = async ({ request }) => {
  // Handle OPTIONS requests for CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: corsHeaders });
  }

  try {
    const orderData = await request.json();

    if (!orderData.shop) {
      return Response.json({ error: "Shop parameter is required" }, { status: 400, headers: corsHeaders });
    }

    // Validate order data
    const validation = validateOrderData(orderData);
    if (!validation.isValid) {
      return Response.json({
        success: false,
        error: validation.errors.join(", ")
      }, { status: 400, headers: corsHeaders });
    }

    // Get shop from database
    const shop = await getShopByDomain(orderData.shop);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404, headers: corsHeaders });
    }

    // Calculate totals from items if not provided
    const items = orderData.items || [];
    const calculatedSubtotal = items.reduce((sum, item) => {
      return sum + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);
    const shippingCost = parseFloat(orderData.shipping || 0);
    const calculatedTotal = calculatedSubtotal + shippingCost;

    // Check order creation mode
    const orderMode = shop.settings?.orderCreationMode || "checkout";

    if (orderMode === "checkout") {
      // === CHECKOUT MODE (Shopify Compliant) ===
      // NO DATABASE SAVE - Just generate cart permalink and redirect
      // Order will be created by webhook when customer completes checkout
      const checkoutUrl = generateCartPermalink(shop.shopifyDomain, {
        items: items,
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
      });

      return Response.json({
        success: true,
        mode: "checkout",
        redirect: checkoutUrl,
      }, { headers: corsHeaders });
    }

    // === DRAFT MODE (Direct Order Creation) ===
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
          mode: "draft",
          orderId: dbOrder.id,
          shopifyOrderId: shopifyResult.orderId,
          shopifyOrderNumber: shopifyResult.orderNumber,
        }, { headers: corsHeaders });
      } else {
        // Shopify order creation failed, but we have the DB order
        console.error("Shopify order creation failed:", shopifyResult.error);
        return Response.json({
          success: true,
          mode: "draft",
          orderId: dbOrder.id,
          warning: "Order saved but Shopify sync failed",
        }, { headers: corsHeaders });
      }
    } catch (shopifyError) {
      console.error("Shopify API error:", shopifyError);
      // Return the actual error so we can debug
      return Response.json({
        success: false,
        error: `Shopify order creation failed: ${shopifyError.message}`,
        orderId: dbOrder.id,
        details: "Order saved to database but failed to sync with Shopify"
      }, { status: 500, headers: corsHeaders });
    }
  } catch (error) {
    console.error("Order submission error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to create order"
    }, { status: 500, headers: corsHeaders });
  }
};
