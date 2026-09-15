import { lookupCustomer } from "../lib/sms.server";
import { normalizePhone } from "../lib/buyer.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Returns a per-shop customer profile including their address. The shop is
    // now the signature's, not the body's, so a caller can only read profiles
    // belonging to the storefront the request actually came through.
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
      return Response.json({ customer: null });
    }

    const customer = await lookupCustomer(shopData.id, normalizedPhone);
    return Response.json({ customer });
  } catch (error) {
    console.error("Customer lookup error:", error);
    return Response.json({ customer: null });
  }
};
