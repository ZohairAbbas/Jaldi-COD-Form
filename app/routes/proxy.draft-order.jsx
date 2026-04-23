import { getShopByDomain, isUserBlocked } from "../lib/db.server";
import { normalizePrice } from "../lib/constants";
import { upsertGlobalBuyer } from "../lib/buyer.server";
import { getRiskDataForOrder } from "../lib/risk.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json();

    if (!data.shop) {
      return Response.json({ error: "Shop parameter is required" }, { status: 400 });
    }

    // Get shop from database
    const shop = await getShopByDomain(data.shop);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    // Check if user is blocked (fraud prevention)
    if (shop.settings?.enableUserBlocking) {
      const blocked = await isUserBlocked(shop.id, data.email, data.phone);
      if (blocked) {
        const message = shop.settings.blockedUserMessage
          || "You are not allowed to place orders. Please contact support.";
        return Response.json({
          success: false,
          error: message,
        }, { status: 403 });
      }
    }

    // Create admin API client
    const admin = {
      accessToken: shop.accessToken,
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

    const items = data.items || [];
    const customerInfo = data.customerInfo || {};
    const address = data.address || {};

    // Risk scoring (non-blocking — always allow order)
    let riskData = null;
    try {
      riskData = await getRiskDataForOrder(customerInfo.phone || data.phone);
    } catch (err) {
      console.error("Risk scoring failed (non-blocking):", err);
    }

    // Build line items for draft order
    const lineItems = items.map(item => {
      const variantId = item.variantId.includes('/')
        ? item.variantId
        : `gid://shopify/ProductVariant/${item.variantId}`;

      const lineItem = {
        variantId: variantId,
        quantity: item.quantity,
      };

      // Apply per-line discount for one-tick upsell items
      if (item.isOneTickUpsell && item.productPrice !== undefined) {
        const originalPrice = normalizePrice(item.productPrice);
        const upsellPrice = normalizePrice(item.price);
        const discountAmount = originalPrice - upsellPrice;
        if (discountAmount > 0) {
          lineItem.appliedDiscount = {
            title: "Upsell Discount",
            value: discountAmount,
            valueType: "FIXED_AMOUNT",
          };
        }
      }

      // Apply per-line discount for pre-purchase upsell items
      if (item.isUpsell && item.originalPrice && item.originalPrice !== item.price) {
        const discountAmount = normalizePrice(item.originalPrice) - normalizePrice(item.price);
        if (discountAmount > 0) {
          lineItem.appliedDiscount = {
            title: "Upsell Discount",
            value: discountAmount,
            valueType: "FIXED_AMOUNT",
          };
        }
      }

      // Apply per-line discount for bundle items from third-party apps (Pumper/Bundler/in-app)
      // bundleDiscount is the TOTAL discount for all units. Shopify line-item
      // FIXED_AMOUNT discounts are per-unit, so we divide by quantity.
      if (item.bundleDiscount && item.bundleDiscount > 0 && !item.hasCartDiscount) {
        const perUnitDiscount = normalizePrice(item.bundleDiscount) / (item.quantity || 1);
        lineItem.appliedDiscount = {
          title: "Bundle Discount",
          value: parseFloat(perUnitDiscount.toFixed(2)),
          valueType: "FIXED_AMOUNT",
        };
      }

      // Apply per-line discount for cart discount items (Shopify automatic discounts).
      // Draft orders do NOT auto-apply Shopify automatic discounts, so we must
      // apply them manually as line-level discounts.
      // originalPrice = per-unit original, price = per-unit discounted
      if (item.hasCartDiscount && item.originalPrice && item.price) {
        const perUnitDiscount = normalizePrice(item.originalPrice) - normalizePrice(item.price);
        if (perUnitDiscount > 0) {
          lineItem.appliedDiscount = {
            title: "Bundle Discount",
            value: parseFloat(perUnitDiscount.toFixed(2)),
            valueType: "FIXED_AMOUNT",
          };
        }
      }

      return lineItem;
    });

    // Calculate total order-level discount
    // NOTE: Bundle discounts are NOT included here because Shopify automatically
    // applies quantity-break / automatic discounts at checkout. Including them
    // would double-count the bundle discount. We only include discounts that
    // Shopify does NOT know about: recovery (downsell) and user discount codes.
    let totalOrderDiscount = 0;
    const discountParts = [];

    // Recovery discount (downsell)
    const recoveryDiscountAmount = normalizePrice(data.recoveryDiscount?.amount || 0);
    if (recoveryDiscountAmount > 0) {
      totalOrderDiscount += recoveryDiscountAmount;
      discountParts.push(`Recovery: ${recoveryDiscountAmount.toFixed(2)}`);
    }

    // User discount code
    const userDiscountAmount = normalizePrice(data.userDiscount?.amount || 0);
    if (userDiscountAmount > 0) {
      totalOrderDiscount += userDiscountAmount;
      const codeName = data.userDiscount?.code || 'DISCOUNT';
      discountParts.push(`${codeName}: ${userDiscountAmount.toFixed(2)}`);
    }

    // Card payment discount
    const cardDiscountAmount = normalizePrice(data.cardDiscount?.amount || 0);
    if (cardDiscountAmount > 0) {
      totalOrderDiscount += cardDiscountAmount;
      discountParts.push(`Card Discount: ${cardDiscountAmount.toFixed(2)}`);
    }

    // Build draft order input
    const draftOrderInput = {
      lineItems: lineItems,
      tags: [
        "preventify_cod_form",
        "draft_order_for_card_checkout",
        data.verificationMethod,
        riskData?.riskLevel === "HIGH" ? "preventify-high-risk" : null,
        riskData?.riskLevel === "MEDIUM" ? "preventify-medium-risk" : null,
        riskData?.riskLevel === "LOW" ? "preventify-trusted-buyer" : null,
      ].filter(Boolean),
      note: riskData && riskData.riskLevel !== "UNKNOWN"
        ? `Pay with Card - Preventify COD Form\nPreventify Risk: ${riskData.riskLevel} — ${riskData.riskNote}`
        : "Pay with Card - Preventify COD Form",
      customAttributes: [
        { key: "_preventify_source", value: "card_checkout" },
        { key: "_preventify_shop", value: data.shop },
        ...(riskData && riskData.riskLevel !== "UNKNOWN" ? [
          { key: "_preventify_risk_level", value: riskData.riskLevel },
        ] : []),
      ],
      // Shopify Markets: create draft order in the presentment currency.
      // Only set when presentmentCurrencyCode is provided (i.e., Shopify Markets is active).
      ...(data.presentmentCurrencyCode ? {
        presentmentCurrencyCode: data.presentmentCurrencyCode,
      } : {}),
    };

    // Add shipping address
    if (address.address) {
      draftOrderInput.shippingAddress = {
        firstName: customerInfo.firstName || '',
        lastName: customerInfo.lastName || '',
        address1: address.address || '',
        address2: address.address2 || '',
        city: address.city || '',
        province: address.province || '',
        country: address.country || 'Pakistan',
        zip: address.postalCode || '',
        phone: customerInfo.phone || '',
      };
      // Use same as billing
      draftOrderInput.billingAddress = { ...draftOrderInput.shippingAddress };
    }

    // Add email — use a no-reply placeholder when email is not provided
    if (customerInfo.email) {
      draftOrderInput.email = customerInfo.email;
    } else if (customerInfo.phone) {
      const digits = customerInfo.phone.replace(/[^\d]/g, '');
      draftOrderInput.email = `noreply-${digits}@preventify.com`;
    }

    // Add phone if available
    if (customerInfo.phone) {
      draftOrderInput.phone = customerInfo.phone.replace(/[^\d+]/g, '');
    }

    // Apply order-level discount if any
    if (totalOrderDiscount > 0) {
      const discountTitle = discountParts.length === 1
        ? discountParts[0].split(':')[0]
        : `AUTOMATIC DISCOUNTS`;

      draftOrderInput.appliedDiscount = {
        title: discountTitle,
        value: totalOrderDiscount,
        valueType: "FIXED_AMOUNT",
      };
    }

    // Add shipping line if provided
    if (data.shippingCost > 0 && data.shippingRateName) {
      draftOrderInput.shippingLine = {
        title: data.shippingRateName,
        price: normalizePrice(data.shippingCost),
      };
    }

    console.log('[Preventify]', 'draft-order-input', JSON.stringify({
      presentmentCurrencyCode: draftOrderInput.presentmentCurrencyCode || '(not set - shop default)',
      inputPresentmentCurrencyCode: data.presentmentCurrencyCode || null,
      currencyDebug: data.currencyDebug || null,
      lineItemCount: lineItems.length,
      hasShippingLine: !!draftOrderInput.shippingLine,
      hasAppliedDiscount: !!draftOrderInput.appliedDiscount,
      phoneLast4: (customerInfo.phone || '').replace(/[^\d]/g, '').slice(-4),
    }));

    // GraphQL mutation to create draft order
    const mutation = `
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
            name
            invoiceUrl
            totalPrice
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const response = await admin.graphql(mutation, {
      variables: { input: draftOrderInput },
    });
    const result = await response.json();

    if (result.errors) {
      console.error("GraphQL errors creating draft order:", result.errors);
      return Response.json({
        success: false,
        error: result.errors[0]?.message || "Failed to create draft order",
      }, { status: 500 });
    }

    const draftOrderResult = result.data.draftOrderCreate;

    if (draftOrderResult.userErrors && draftOrderResult.userErrors.length > 0) {
      console.error("Draft order user errors:", draftOrderResult.userErrors);
      return Response.json({
        success: false,
        error: draftOrderResult.userErrors[0].message,
      }, { status: 400 });
    }

    const draftOrder = draftOrderResult.draftOrder;

    console.log('[Preventify]', 'draft-order-created', JSON.stringify({
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      totalPrice: draftOrder.totalPrice,
      inputPresentmentCurrencyCode: data.presentmentCurrencyCode || null,
      phoneLast4: (customerInfo.phone || '').replace(/[^\d]/g, '').slice(-4),
      shop: data.shop,
    }));

    // Update buyer's preferred payment method to "card" (non-blocking)
    if (customerInfo.phone) {
      upsertGlobalBuyer(shop.id, {
        phone: customerInfo.phone,
        firstName: customerInfo.firstName,
        lastName: customerInfo.lastName,
        email: customerInfo.email,
        address: address.address,
        address2: address.address2,
        city: address.city,
        province: address.province,
        postalCode: address.postalCode,
        country: address.country,
        countryCode: data.countryCode || "PAK",
        paymentMethod: "card",
      }).catch((err) =>
        console.error("[draft-order] Failed to update global buyer:", err)
      );
    }

    return Response.json({
      success: true,
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
      invoiceUrl: draftOrder.invoiceUrl,
      totalPrice: draftOrder.totalPrice,
    });
  } catch (error) {
    console.error("Draft order creation error:", error);
    return Response.json({
      success: false,
      error: error.message || "Failed to create draft order",
    }, { status: 500 });
  }
};
