import { getShopByDomain, getEnabledPixels, isUserBlocked } from "../lib/db.server";
import { buildHmac, executeTransaction, getTransactionStatus, isPayfastSuccess, isPayfastPending } from "../lib/payfast.server";
import { createShopifyOrder } from "../lib/order.server";
import { firePurchaseEvent, getCurrencyFromCountry, fireTikTokEvents } from "../lib/pixels.server";
import { normalizePrice } from "../lib/constants";
import { upsertGlobalBuyer, normalizePhone } from "../lib/buyer.server";
import { getRiskDataForOrder } from "../lib/risk.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const data = await request.json();

    if (!data.shop) {
      return Response.json({ error: "Shop parameter is required" }, { status: 400 });
    }

    const shop = await getShopByDomain(data.shop);
    if (!shop) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    if (data.phone) data.phone = normalizePhone(data.phone);

    if (!shop.settings?.payfastEnabled || !shop.settings?.payfastMerchantId || !shop.settings?.payfastSecuredKey) {
      return Response.json({ error: "PayFast is not configured for this shop" }, { status: 400 });
    }

    // Fraud check (non-blocking if already passed initiate, but double-check)
    if (shop.settings?.enableUserBlocking) {
      const blocked = await isUserBlocked(shop.id, data.email, data.phone);
      if (blocked) {
        const message = shop.settings.blockedUserMessage
          || "You are not allowed to place orders. Please contact support.";
        return Response.json({ success: false, error: message }, { status: 403 });
      }
    }

    const securedKey = shop.settings.payfastSecuredKey;
    const accessToken = data.access_token;
    const basketId = data.basket_id;
    const txnamt = data.txnamt;
    const otp = data.otp || "";
    const cardNumber = (data.cardNumber || "").replace(/\s+/g, "");
    const expiryMonth = String(data.expiryMonth || "").padStart(2, "0");
    const expiryYear = String(data.expiryYear || "");
    const cvv = String(data.cvv || "");

    if (!accessToken || !basketId || !txnamt) {
      return Response.json({ success: false, error: "Missing transaction session data. Please restart payment." }, { status: 400 });
    }

    // Build HMAC for transaction: basket_id + txnamt + card_number + expiry_month + expiry_year + cvv + otp
    const securedHash = buildHmac(
      [basketId, txnamt, cardNumber, expiryMonth, expiryYear, cvv, otp],
      securedKey
    );

    const customerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "0.0.0.0";
    const orderDate = new Date().toISOString().replace("T", " ").slice(0, 19);
    const customerMobile = formatPayfastPhone(data.phone || "");
    const customerEmail = data.email || `noreply+${(data.phone || "").slice(-4)}@example.com`;

    const transactPayload = {
      merchant_id: shop.settings.payfastMerchantId,
      basket_id: basketId,
      txnamt,
      order_date: orderDate,
      customer_mobile_no: customerMobile,
      customer_email_address: customerEmail,
      account_type_id: "1",
      card_number: cardNumber,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      cvv,
      customer_ip: customerIp,
      otp,
      eci: data.eci || "",
      transaction_id: data.transaction_id || "",
      secured_hash: securedHash,
      ...(data.paresData ? { data_3ds_pares: data.paresData } : {}),
    };

    console.log("[PayFast] Executing transaction for basket:", basketId);

    let txnResponse;
    try {
      txnResponse = await executeTransaction(accessToken, transactPayload);
    } catch (txnErr) {
      console.error("[PayFast] Transaction execute error:", txnErr.message);
      return Response.json({ success: false, error: "Payment processing failed. Please try again." }, { status: 502 });
    }

    console.log("[PayFast] Transaction response:", JSON.stringify({
      status_code: txnResponse.status_code,
      status_msg: txnResponse.status_msg,
      transaction_id: txnResponse.transaction_id,
    }));

    // Handle pending — poll up to 3 times
    if (isPayfastPending(txnResponse.status_code)) {
      const txnId = txnResponse.transaction_id || data.transaction_id;
      for (let i = 0; i < 3; i++) {
        await sleep(2000);
        try {
          txnResponse = await getTransactionStatus(accessToken, txnId);
          console.log(`[PayFast] Poll ${i + 1} status:`, txnResponse.status_code);
          if (!isPayfastPending(txnResponse.status_code)) break;
        } catch (pollErr) {
          console.error("[PayFast] Poll error:", pollErr.message);
          break;
        }
      }
    }

    // Final check
    if (!isPayfastSuccess(txnResponse.status_code)) {
      const errMsg = txnResponse.status_msg || txnResponse.rdv_message_key || "Payment was not successful. Please try again.";
      return Response.json({ success: false, error: errMsg });
    }

    // ── Payment confirmed — create Shopify order ──────────────────────────────

    // Risk scoring (non-blocking)
    let riskData = null;
    try {
      riskData = await getRiskDataForOrder(data.phone);
    } catch (riskErr) {
      console.error("[PayFast] Risk scoring failed (non-blocking):", riskErr);
    }

    const admin = {
      accessToken: shop.accessToken,
      graphql: async (query, options) => {
        const res = await fetch(
          `https://${shop.shopifyDomain}/admin/api/2025-01/graphql.json`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Shopify-Access-Token": shop.accessToken,
            },
            body: JSON.stringify({ query, variables: options?.variables }),
          }
        );
        return res;
      },
    };

    const items = data.items || [];
    const shippingCost = normalizePrice(data.shippingCost || 0);
    const calculatedSubtotal = items.reduce(
      (sum, item) => sum + normalizePrice(item.price) * parseInt(item.quantity),
      0
    );
    const calculatedTotal = calculatedSubtotal + shippingCost;

    const shopifyResult = await createShopifyOrder(
      admin,
      {
        customerInfo: {
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
        },
        address: {
          address: data.address,
          address2: data.address2,
          city: data.city,
          province: data.province,
          postalCode: data.postalCode,
          country: data.country || "Pakistan",
        },
        items,
        subtotal: calculatedSubtotal,
        shipping: shippingCost,
        total: calculatedTotal,
        recoveryDiscount: data.recoveryDiscount,
        userDiscount: data.userDiscount,
        shippingCost,
        shippingRateName: data.shippingRateName || "Standard Shipping",
        utmData: data.pixelAttribution || {},
        countryCode: data.countryCode,
        presentmentCurrencyCode: data.presentmentCurrencyCode,
        verificationMethod: data.verificationMethod,
        riskData,
        // PayFast-specific overrides (applied inside createShopifyOrder via spread)
        _financialStatus: "paid",
        _paymentGateway: "PayFast",
        _orderTags: "preventify_payfast",
        _orderNote: `Payment Method: PayFast (Online Payment)\nPayFast Transaction ID: ${txnResponse.transaction_id || basketId}`,
      },
      shop.shopifyDomain
    );

    if (!shopifyResult.success) {
      console.error("[PayFast] Shopify order creation failed after successful payment:", shopifyResult.error);
      // Payment was taken — log but still return the PayFast transaction ID so merchant can manually reconcile
      return Response.json({
        success: false,
        paymentConfirmed: true,
        payfastTransactionId: txnResponse.transaction_id || basketId,
        error: "Payment was successful but order creation failed. Please contact support with your transaction ID.",
      }, { status: 500 });
    }

    // Save to Preventify DB
    const dbOrder = await prisma.order.create({
      data: {
        shop: { connect: { id: shop.id } },
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || "",
        phone: data.phone,
        address: data.address,
        address2: data.address2 || "",
        city: data.city,
        province: data.province,
        postalCode: data.postalCode || "",
        country: data.country || "Pakistan",
        items: JSON.stringify(items),
        subtotal: calculatedSubtotal,
        shipping: shippingCost,
        total: calculatedTotal,
        status: "pending",
        paymentMethod: "payfast",
        riskLevel: riskData?.riskLevel || null,
        shopifyOrderId: shopifyResult.orderId,
        shopifyOrderNumber: shopifyResult.orderNumber,
        verificationMethod: data.verificationMethod || null,
        customFields: JSON.stringify({
          ...(typeof data.customFields === "string"
            ? JSON.parse(data.customFields || "{}")
            : (data.customFields || {})),
          payfastTransactionId: txnResponse.transaction_id || basketId,
          payfastBasketId: basketId,
          shippingRateId: data.shippingRateId,
          shippingRateName: data.shippingRateName,
          ...(data.pixelAttribution?.utm_source && { utm_source: data.pixelAttribution.utm_source }),
          ...(data.pixelAttribution?.utm_medium && { utm_medium: data.pixelAttribution.utm_medium }),
          ...(data.pixelAttribution?.utm_campaign && { utm_campaign: data.pixelAttribution.utm_campaign }),
        }),
      },
    });

    // Update global buyer — prefer payfast as payment method
    try {
      await upsertGlobalBuyer(shop.id, {
        phone: data.phone,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        address: data.address,
        address2: data.address2,
        city: data.city,
        province: data.province,
        postalCode: data.postalCode,
        country: data.country,
        countryCode: data.countryCode || "PAK",
        paymentMethod: "payfast",
      });
    } catch (buyerErr) {
      console.error("[PayFast] Failed to upsert global buyer:", buyerErr);
    }

    // Mark session as completed
    if (data.sessionId) {
      try {
        await prisma.orderSession.updateMany({
          where: { sessionId: data.sessionId },
          data: { status: "completed", completedAt: new Date() },
        });
        await prisma.abandonedCart.updateMany({
          where: { sessionId: data.sessionId, recovered: false },
          data: { recovered: true, recoveredAt: new Date() },
        });
      } catch (sessionErr) {
        console.error("[PayFast] Session update failed:", sessionErr);
      }
    }

    // Fire pixel Purchase events (async, non-blocking)
    try {
      const pixels = await getEnabledPixels(shop.id);
      if (pixels && pixels.length > 0) {
        const currency = getCurrencyFromCountry(shop.country);
        const clientIpAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
        const clientUserAgent = request.headers.get("user-agent") || "";
        const utmData = {
          ...(data.pixelAttribution?.utm_source && { utm_source: data.pixelAttribution.utm_source }),
          ...(data.pixelAttribution?.utm_medium && { utm_medium: data.pixelAttribution.utm_medium }),
          ...(data.pixelAttribution?.utm_campaign && { utm_campaign: data.pixelAttribution.utm_campaign }),
        };

        firePurchaseEvent(pixels, {
          orderId: dbOrder.id,
          orderNumber: shopifyResult.orderNumber,
          total: calculatedTotal,
          items,
          currency,
          customerInfo: { firstName: data.firstName, lastName: data.lastName, email: data.email, phone: data.phone },
          address: { city: data.city, province: data.province, country: data.country || "Pakistan" },
          eventId: data.pixelEventId,
          eventSourceUrl: request.headers.get("referer") || "",
          clientIpAddress,
          clientUserAgent,
          ...data.pixelAttribution,
          utmData,
        }).catch(err => console.error("[PayFast] Pixel error:", err));

        fireTikTokEvents(pixels, {
          orderId: dbOrder.id,
          orderNumber: shopifyResult.orderNumber,
          total: calculatedTotal,
          items,
          currency,
          customerInfo: { email: data.email, phone: data.phone },
          eventId: data.pixelEventId,
          eventSourceUrl: request.headers.get("referer") || "",
          clientIpAddress,
          clientUserAgent,
          utmData,
        }).catch(err => console.error("[PayFast] TikTok pixel error:", err));
      }
    } catch (pixelErr) {
      console.error("[PayFast] Pixel initialization error:", pixelErr);
    }

    return Response.json({
      success: true,
      order: {
        id: shopifyResult.orderId,
        orderNumber: shopifyResult.orderNumber,
        confirmationNumber: shopifyResult.confirmationNumber,
        orderStatusUrl: shopifyResult.orderStatusUrl,
      },
      payfastTransactionId: txnResponse.transaction_id || basketId,
    });

  } catch (err) {
    console.error("[PayFast] Transact error:", err);
    return Response.json({ success: false, error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatPayfastPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length >= 12) return `92-${digits.slice(2)}`;
  if (digits.startsWith("0") && digits.length >= 10) return `92-${digits.slice(1)}`;
  if (digits.length === 10) return `92-${digits}`;
  return `92-${digits}`;
}
