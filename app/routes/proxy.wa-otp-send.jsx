import { sendWhatsAppOTP } from "../lib/whatsapp.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Sends a WhatsApp message from Preventify's business number. Unauthenticated,
    // this let anyone send template messages to arbitrary phone numbers.
    const { data, shop: shopData, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone } = data;

    if (!phone) {
      return Response.json({ error: "Phone is required" }, { status: 400 });
    }

    const result = await sendWhatsAppOTP(shopData.id, phone);

    return Response.json(result);
  } catch (error) {
    console.error("WhatsApp OTP send error:", error);
    return Response.json(
      { error: error.message || "Failed to send WhatsApp OTP" },
      { status: 500 }
    );
  }
};
