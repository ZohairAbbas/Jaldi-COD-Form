import { createWhatsAppLoginSession } from "../lib/whatsapp.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Mints a login session whose completion marks a phone verified. No shop
    // record is needed — the session is global — but the caller must still be a
    // real storefront.
    const { data, errorResponse } = await authenticateJsonProxyRequest(request, {
      requireShopRecord: false,
    });
    if (errorResponse) return errorResponse;

    const { phone } = data;

    if (!phone) {
      return Response.json({ error: "Phone is required" }, { status: 400 });
    }

    const { token, deepLink } = await createWhatsAppLoginSession(phone);

    return Response.json({ token, deepLink });
  } catch (error) {
    console.error("WhatsApp login init error:", error);
    return Response.json(
      { error: error.message || "Failed to create login session" },
      { status: 500 }
    );
  }
};
