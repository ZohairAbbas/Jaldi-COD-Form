import { sendOTP } from "../lib/sms.server";
import { normalizePhone } from "../lib/buyer.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Sends a real SMS billed to the merchant's account. Unauthenticated, this
    // was an SMS-bombing vector chargeable to any named shop.
    const { data, shop: shopData, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone } = data;

    if (!phone) {
      return Response.json({ error: "Phone is required" }, { status: 400 });
    }

    const normalizedPhone = normalizePhone(phone) || phone;
    // Validate phone format (Pakistan: +92 followed by 10 digits)
    if (!normalizedPhone.startsWith("+92") || normalizedPhone.length < 13) {
      return Response.json({ error: "Invalid phone number format" }, { status: 400 });
    }

    const result = await sendOTP(shopData.id, normalizedPhone);
    return Response.json(result);
  } catch (error) {
    console.error("OTP send error:", error);
    return Response.json(
      { error: error.message || "Failed to send OTP" },
      { status: 400 }
    );
  }
};
