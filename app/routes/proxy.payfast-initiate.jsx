import { getShopByDomain, isUserBlocked } from "../lib/db.server";
import { getPayfastToken, buildHmac, validateCustomer } from "../lib/payfast.server";
import { normalizePrice } from "../lib/constants";
import { normalizePhone } from "../lib/buyer.server";

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

    // Verify PayFast is configured for this merchant
    if (!shop.settings?.payfastEnabled) {
      return Response.json({ error: "PayFast is not enabled for this shop" }, { status: 400 });
    }
    if (!shop.settings?.payfastMerchantId || !shop.settings?.payfastSecuredKey) {
      return Response.json({ error: "PayFast credentials are not configured" }, { status: 400 });
    }

    // Fraud check
    if (shop.settings?.enableUserBlocking) {
      const blocked = await isUserBlocked(shop.id, data.email, data.phone);
      if (blocked) {
        const message = shop.settings.blockedUserMessage
          || "You are not allowed to place orders. Please contact support.";
        return Response.json({ success: false, error: message }, { status: 403 });
      }
    }

    const merchantId = shop.settings.payfastMerchantId;
    const securedKey = shop.settings.payfastSecuredKey;

    // Get customer IP from request headers
    const customerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "0.0.0.0";

    // Get bearer token
    let accessToken;
    try {
      const tokenResponse = await getPayfastToken(merchantId, securedKey, customerIp);
      accessToken = tokenResponse.token;
    } catch (tokenErr) {
      console.error("[PayFast] Token error:", tokenErr.message);
      return Response.json({ success: false, error: "Failed to connect to PayFast. Please try again." }, { status: 502 });
    }

    // Prepare fields
    const basketId = data.basketId || `PVF-${Date.now()}-${(data.phone || "").slice(-4)}`;
    const cardNumber = (data.cardNumber || "").replace(/\s+/g, "");
    const expiryMonth = String(data.expiryMonth || "").padStart(2, "0");
    const expiryYear = String(data.expiryYear || "");
    const cvv = String(data.cvv || "");
    // txnamt: PayFast expects amount in smallest currency unit (paisa for PKR)
    const txnamt = String(Math.round(normalizePrice(data.total) * 100));
    const orderDate = new Date().toISOString().replace("T", " ").slice(0, 19); // YYYY-MM-DD HH:mm:ss
    const customerMobile = formatPayfastPhone(data.phone || "");
    const customerEmail = data.email || `noreply+${(data.phone || "").slice(-4)}@example.com`;

    // Build HMAC for validation: basket_id + txnamt + card_number + expiry_month + expiry_year + cvv
    const securedHash = buildHmac(
      [basketId, txnamt, cardNumber, expiryMonth, expiryYear, cvv],
      securedKey
    );

    const validatePayload = {
      merchant_id: merchantId,
      basket_id: basketId,
      txnamt,
      order_date: orderDate,
      customer_mobile_no: customerMobile,
      customer_email_address: customerEmail,
      account_type_id: "1", // Card
      card_number: cardNumber,
      expiry_month: expiryMonth,
      expiry_year: expiryYear,
      cvv,
      customer_ip: customerIp,
      secured_hash: securedHash,
      // 3DS configuration
      data_3ds_pagemode: "SIMPLE",
      data_3ds_callback_url: data.threeDsCallbackUrl || "",
    };

    console.log("[PayFast] Calling customer/validate for basket:", basketId);

    let validateResponse;
    try {
      validateResponse = await validateCustomer(accessToken, validatePayload);
    } catch (validateErr) {
      console.error("[PayFast] Validate error:", validateErr.message);
      return Response.json({ success: false, error: "Payment validation failed. Please try again." }, { status: 502 });
    }

    console.log("[PayFast] Validate response:", JSON.stringify({
      status_code: validateResponse.status_code,
      otp_required: validateResponse.otp_required,
      has_3ds: !!validateResponse.data_3ds_html,
      eci: validateResponse.eci,
    }));

    // 3DS required — return HTML to render in iframe
    if (validateResponse.data_3ds_html) {
      return Response.json({
        success: true,
        needs3ds: true,
        data_3ds_html: validateResponse.data_3ds_html,
        transaction_id: validateResponse.transaction_id,
        eci: validateResponse.eci,
        access_token: accessToken,
        basket_id: basketId,
        txnamt,
      });
    }

    // OTP required (bank SMS)
    if (validateResponse.otp_required) {
      return Response.json({
        success: true,
        needsOtp: true,
        transaction_id: validateResponse.transaction_id,
        eci: validateResponse.eci,
        access_token: accessToken,
        basket_id: basketId,
        txnamt,
      });
    }

    // Some banks manage OTP internally (status 850) — treat as OTP-not-required, proceed directly
    if (validateResponse.status_code === "00" || validateResponse.status_code === "79" || validateResponse.code === "850") {
      return Response.json({
        success: true,
        needsOtp: false,
        transaction_id: validateResponse.transaction_id,
        eci: validateResponse.eci,
        access_token: accessToken,
        basket_id: basketId,
        txnamt,
      });
    }

    // Validation failed
    const errMsg = validateResponse.status_msg || validateResponse.rdv_message_key || "Card validation failed. Please check your card details.";
    return Response.json({ success: false, error: errMsg });

  } catch (err) {
    console.error("[PayFast] Initiate error:", err);
    return Response.json({ success: false, error: "An unexpected error occurred. Please try again." }, { status: 500 });
  }
};

/**
 * Format phone number for PayFast: 92-XXXXXXXXXX
 * Accepts local Pakistani format (03xx) or international (+92xx)
 */
function formatPayfastPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("92") && digits.length >= 12) {
    return `92-${digits.slice(2)}`;
  }
  if (digits.startsWith("0") && digits.length >= 10) {
    return `92-${digits.slice(1)}`;
  }
  // Already numeric without prefix
  if (digits.length === 10) {
    return `92-${digits}`;
  }
  return `92-${digits}`;
}
