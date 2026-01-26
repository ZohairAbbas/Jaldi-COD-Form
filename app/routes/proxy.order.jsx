import { createShopifyOrder, validateOrderData } from "../lib/order.server";
import { getShopByDomain, getUpsells, getEnabledPixels } from "../lib/db.server";
import { firePurchaseEvent, getCurrencyFromCountry } from "../lib/pixels.server";
import prisma from "../db.server";

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
        error: validation.errors.join(", "),
        fieldErrors: validation.fieldErrors || {}
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
    const shippingCost = parseFloat(orderData.shippingCost || orderData.shipping || 0);
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
        customFields: JSON.stringify({
          ...(typeof orderData.customFields === 'string'
              ? JSON.parse(orderData.customFields || '{}')
              : (orderData.customFields || {})),
          shippingRateId: orderData.shippingRateId,
          shippingRateName: orderData.shippingRateName,
        }),
      },
    });

    // Create order in Shopify
    try {
      // Create admin API client manually with graphql method and access token
      const admin = {
        accessToken: shop.accessToken, // Add access token for REST API calls
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

      const shopifyResult = await createShopifyOrder(
        admin,
        {
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
          recoveryDiscount: orderData.recoveryDiscount, // Pass recovery discount from downsell
          shippingCost: shippingCost,
          shippingRateName: orderData.shippingRateName || 'Standard Shipping',
        },
        shop.shopifyDomain // Pass shop domain for REST API call
      );

      if (shopifyResult.success) {
        // Update database order with Shopify order details
        await prisma.order.update({
          where: { id: dbOrder.id },
          data: {
            shopifyOrderId: shopifyResult.orderId,
            shopifyOrderNumber: shopifyResult.orderNumber,
          },
        });

        // Mark session as completed if sessionId is provided
        if (orderData.sessionId) {
          try {
            await prisma.orderSession.updateMany({
              where: { sessionId: orderData.sessionId },
              data: {
                status: "completed",
                completedAt: new Date(),
              },
            });
          } catch (sessionError) {
            console.error("Failed to mark session as completed:", sessionError);
          }
        }

        // Fire Facebook CAPI Purchase event (async, don't block response)
        try {
          const pixels = await getEnabledPixels(shop.id);
          if (pixels && pixels.length > 0) {
            const currency = getCurrencyFromCountry(shop.country);

            // Get client IP and user agent from request headers
            const clientIpAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
              || request.headers.get('x-real-ip')
              || '';
            const clientUserAgent = request.headers.get('user-agent') || '';

            // Fire purchase event to all enabled CAPI pixels
            firePurchaseEvent(pixels, {
              orderId: dbOrder.id,
              orderNumber: shopifyResult.orderNumber,
              total: calculatedTotal,
              items: items,
              currency,
              customerInfo: {
                firstName: orderData.firstName,
                lastName: orderData.lastName,
                email: orderData.email,
                phone: orderData.phone,
              },
              address: {
                city: orderData.city,
                province: orderData.province,
                country: orderData.country || "Pakistan",
              },
              eventId: orderData.pixelEventId, // From client
              eventSourceUrl: request.headers.get('referer') || '',
              clientIpAddress,
              clientUserAgent,
              ...orderData.pixelAttribution, // fbp, fbc, fbclid from client
            }).catch(err => {
              console.error('Pixel tracking error:', err);
              // Don't fail the order if pixel tracking fails
            });
          }
        } catch (pixelError) {
          console.error('Pixel initialization error:', pixelError);
          // Don't fail the order if pixel tracking fails
        }

        // Check for active post-purchase upsells
        const allUpsells = await getUpsells(shop.id);
        const postPurchaseUpsells = allUpsells
          .filter(u => u.upsellType === "post-purchase" && u.enabled && u.productId)
          .sort((a, b) => a.priority - b.priority);

        // Get the first active post-purchase upsell
        const activePostPurchaseUpsell = postPurchaseUpsells[0] || null;

        // Format upsell data for frontend
        let postPurchaseUpsell = null;
        if (activePostPurchaseUpsell) {
          postPurchaseUpsell = {
            id: activePostPurchaseUpsell.id,
            name: activePostPurchaseUpsell.name,
            product: {
              id: activePostPurchaseUpsell.productId,
              title: activePostPurchaseUpsell.productTitle,
              image: activePostPurchaseUpsell.productImage,
              price: activePostPurchaseUpsell.productPrice,
              variantId: activePostPurchaseUpsell.variantId,
            },
            discount: {
              type: activePostPurchaseUpsell.discountType,
              value: activePostPurchaseUpsell.discountValue,
            },
            customization: {
              modalTitle: activePostPurchaseUpsell.modalTitle,
              acceptButtonText: activePostPurchaseUpsell.acceptButtonText,
              declineButtonText: activePostPurchaseUpsell.declineButtonText,
              acceptButtonBgColor: activePostPurchaseUpsell.acceptButtonBgColor,
              acceptButtonTextColor: activePostPurchaseUpsell.acceptButtonTextColor,
              declineButtonBgColor: activePostPurchaseUpsell.declineButtonBgColor,
              declineButtonTextColor: activePostPurchaseUpsell.declineButtonTextColor,
            },
          };
        }

        return Response.json({
          success: true,
          orderId: dbOrder.id,
          shopifyOrderId: shopifyResult.orderId,
          shopifyOrderNumber: shopifyResult.orderNumber,
          orderStatusUrl: shopifyResult.orderStatusUrl,
          postPurchaseUpsell: postPurchaseUpsell,
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
