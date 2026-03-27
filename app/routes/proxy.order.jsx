import { createShopifyOrder, validateOrderData } from "../lib/order.server";
import { getShopByDomain, getUpsells, getEnabledPixels, isUserBlocked } from "../lib/db.server";
import { firePurchaseEvent, getCurrencyFromCountry, fireTikTokEvents } from "../lib/pixels.server";
import { normalizePrice } from "../lib/constants";
import prisma from "../db.server";
import { upsertCustomerProfile } from "../lib/sms.server";
import { upsertGlobalBuyer, normalizePhone } from "../lib/buyer.server";
import { sendWhatsAppReply } from "../lib/whatsapp.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const orderData = await request.json();

    console.log('[Preventify]', 'order-received', JSON.stringify({
      shop: orderData.shop,
      presentmentCurrencyCode: orderData.presentmentCurrencyCode || null,
      currencyDebug: orderData.currencyDebug || null,
      countryCode: orderData.countryCode || null,
      country: orderData.country || null,
      phoneLast4: orderData.phone?.slice(-4),
      itemCount: (orderData.items || []).length,
      items: (orderData.items || []).map(item => ({
        variantId: item.variantId,
        price: item.price,
        isShopifyMarkets: item.isShopifyMarkets || false,
        displayCurrencyCode: item.displayCurrencyCode || null,
      })),
    }));

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

    // Check if user is blocked (fraud prevention)
    if (shop.settings?.enableUserBlocking) {
      const blocked = await isUserBlocked(shop.id, orderData.email, orderData.phone);
      if (blocked) {
        const message = shop.settings.blockedUserMessage
          || "You are not allowed to place orders. Please contact support.";
        return Response.json({
          success: false,
          error: message,
          fieldErrors: {},
        }, { status: 403 });
      }
    }

    // Calculate totals from items if not provided
    const items = orderData.items || [];
    const calculatedSubtotal = items.reduce((sum, item) => {
      return sum + (normalizePrice(item.price) * parseInt(item.quantity));
    }, 0);
    const shippingCost = normalizePrice(orderData.shippingCost || orderData.shipping || 0);
    const calculatedTotal = calculatedSubtotal + shippingCost;

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

    // Log UTM debug info to identify missing attribution cases
    console.log('[UTM Debug]', JSON.stringify({
      hasPixelAttribution: !!orderData.pixelAttribution,
      utmKeys: orderData.pixelAttribution ? Object.keys(orderData.pixelAttribution).filter(k => k.startsWith('utm_')) : [],
      pixelAttribution: orderData.pixelAttribution || null,
      phone: orderData.phone?.slice(-4), // last 4 digits for matching to order
    }));

    // Extract UTM data from pixel attribution for Shopify note_attributes
    const utmAttribution = {
      ...(orderData.pixelAttribution?.utm_source && { utm_source: orderData.pixelAttribution.utm_source }),
      ...(orderData.pixelAttribution?.utm_medium && { utm_medium: orderData.pixelAttribution.utm_medium }),
      ...(orderData.pixelAttribution?.utm_campaign && { utm_campaign: orderData.pixelAttribution.utm_campaign }),
      ...(orderData.pixelAttribution?.utm_term && { utm_term: orderData.pixelAttribution.utm_term }),
      ...(orderData.pixelAttribution?.utm_content && { utm_content: orderData.pixelAttribution.utm_content }),
    };

    // Create order in Shopify FIRST
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
        userDiscount: orderData.userDiscount, // User-entered discount code
        shippingCost: shippingCost,
        shippingRateName: orderData.shippingRateName || 'Standard Shipping',
        utmData: utmAttribution, // UTM parameters for note_attributes
        countryCode: orderData.countryCode, // Country code for currency symbol lookup
        presentmentCurrencyCode: orderData.presentmentCurrencyCode, // Shopify Markets currency
      },
      shop.shopifyDomain // Pass shop domain for REST API call
    );

    // If Shopify order creation failed, return error to frontend
    if (!shopifyResult.success) {
      console.error("Shopify order creation failed:", shopifyResult.error);

      // Parse Shopify error to extract field-specific errors
      const fieldErrors = {};
      try {
        const errorMatch = shopifyResult.error.match(/\{.*\}/);
        if (errorMatch) {
          const errorObj = JSON.parse(errorMatch[0]);
          if (errorObj.errors && errorObj.errors.phone) {
            fieldErrors.phone = `Phone number format is invalid. Please check the format.`;
          }
        }
      } catch (parseError) {
        // If we can't parse, just use generic error
      }

      return Response.json({
        success: false,
        error: shopifyResult.error || "Failed to create order in Shopify",
        fieldErrors: fieldErrors
      }, { status: 400 });
    }

    // Only save to database AFTER Shopify accepts it
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
        shopifyOrderId: shopifyResult.orderId,
        shopifyOrderNumber: shopifyResult.orderNumber,
        customFields: JSON.stringify({
          ...(typeof orderData.customFields === 'string'
              ? JSON.parse(orderData.customFields || '{}')
              : (orderData.customFields || {})),
          shippingRateId: orderData.shippingRateId,
          shippingRateName: orderData.shippingRateName,
          // UTM attribution data
          ...(orderData.pixelAttribution?.utm_source && { utm_source: orderData.pixelAttribution.utm_source }),
          ...(orderData.pixelAttribution?.utm_medium && { utm_medium: orderData.pixelAttribution.utm_medium }),
          ...(orderData.pixelAttribution?.utm_campaign && { utm_campaign: orderData.pixelAttribution.utm_campaign }),
          ...(orderData.pixelAttribution?.utm_term && { utm_term: orderData.pixelAttribution.utm_term }),
          ...(orderData.pixelAttribution?.utm_content && { utm_content: orderData.pixelAttribution.utm_content }),
        }),
      },
    });

    // Save/update customer profile for OTP auto-fill on future orders
    try {
      await upsertCustomerProfile(shop.id, {
        phone: orderData.phone,
        firstName: orderData.firstName,
        lastName: orderData.lastName,
        email: orderData.email,
        address: orderData.address,
        address2: orderData.address2,
        city: orderData.city,
        province: orderData.province,
        postalCode: orderData.postalCode,
        countryCode: orderData.countryCode || "PAK",
      });
    } catch (profileError) {
      console.error("Failed to upsert customer profile:", profileError);
    }

    // Save/update global buyer profile for cross-merchant recognition
    try {
      await upsertGlobalBuyer(shop.id, {
        phone: orderData.phone,
        firstName: orderData.firstName,
        lastName: orderData.lastName,
        email: orderData.email,
        address: orderData.address,
        address2: orderData.address2,
        city: orderData.city,
        province: orderData.province,
        postalCode: orderData.postalCode,
        country: orderData.country,
        countryCode: orderData.countryCode || "PAK",
      });
    } catch (globalBuyerError) {
      console.error("Failed to upsert global buyer:", globalBuyerError);
    }

    // Send WhatsApp order confirmation if buyer verified via WhatsApp login channel
    try {
      const normalized = normalizePhone(orderData.phone);
      if (normalized) {
        const recentVerified = await prisma.whatsAppLoginSession.findFirst({
          where: {
            phone: normalized,
            status: "verified",
            verifiedAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }, // within last 10 minutes
          },
          orderBy: { verifiedAt: "desc" },
        });
        if (recentVerified) {
          await sendWhatsAppReply(
            normalized,
            `🎉 Your order has been placed successfully! Our team will call you shortly to confirm the delivery details. Thank you for shopping with us!`
          );
        }
      }
    } catch (waNotifyError) {
      console.error("Failed to send WhatsApp order confirmation:", waNotifyError);
    }

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

        // Extract UTM data from pixel attribution
        const utmData = {
          ...(orderData.pixelAttribution?.utm_source && { utm_source: orderData.pixelAttribution.utm_source }),
          ...(orderData.pixelAttribution?.utm_medium && { utm_medium: orderData.pixelAttribution.utm_medium }),
          ...(orderData.pixelAttribution?.utm_campaign && { utm_campaign: orderData.pixelAttribution.utm_campaign }),
          ...(orderData.pixelAttribution?.utm_term && { utm_term: orderData.pixelAttribution.utm_term }),
          ...(orderData.pixelAttribution?.utm_content && { utm_content: orderData.pixelAttribution.utm_content }),
        };

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
          utmData, // UTM parameters for custom_data
        }).catch(err => {
          console.error('Pixel tracking error:', err);
          // Don't fail the order if pixel tracking fails
        });

        // Fire TikTok Events API (PlaceAnOrder and CompletePayment)
        fireTikTokEvents(pixels, {
          orderId: dbOrder.id,
          orderNumber: shopifyResult.orderNumber,
          total: calculatedTotal,
          items: items,
          currency,
          customerInfo: {
            email: orderData.email,
            phone: orderData.phone,
          },
          eventId: orderData.pixelEventId,
          eventSourceUrl: request.headers.get('referer') || '',
          clientIpAddress,
          clientUserAgent,
          utmData, // UTM parameters for custom properties
        }).catch(err => {
          console.error('TikTok Events API error:', err);
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
      total: calculatedTotal,
      postPurchaseUpsell: postPurchaseUpsell,
    });
  } catch (error) {
    console.error("Order submission error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to create order"
    }, { status: 500 });
  }
};
