import { checkWhatsAppLoginStatus } from "../lib/whatsapp.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Polled by the storefront while the buyer completes WhatsApp login. The
    // token is the secret here; the signature keeps polling to real storefronts.
    const { data, errorResponse } = await authenticateJsonProxyRequest(request, {
      requireShopRecord: false,
    });
    if (errorResponse) return errorResponse;

    const { token } = data;

    if (!token) {
      return Response.json({ status: "expired" });
    }

    const result = await checkWhatsAppLoginStatus(token);

    return Response.json(result);
  } catch (error) {
    console.error("WhatsApp login status error:", error);
    return Response.json({ status: "expired" });
  }
};
