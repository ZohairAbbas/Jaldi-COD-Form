import { checkWhatsAppLoginStatus } from "../lib/whatsapp.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";
import { issueVerificationToken, VERIFICATION_TAGS } from "../lib/verification.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Polled by the storefront while the buyer completes WhatsApp login. The
    // login token is the secret here; the signature keeps polling to real
    // storefronts. The shop record is needed because a successful login issues
    // a verification token, which is bound to a shop domain.
    const { data, shopDomain, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { token } = data;

    if (!token) {
      return Response.json({ status: "expired" });
    }

    const result = await checkWhatsAppLoginStatus(token);

    // A completed login is proof the buyer controls the number — they messaged
    // from it. Issue the token that releases their saved details.
    if (result.status === "verified" && result.phone) {
      return Response.json({
        ...result,
        verificationToken: issueVerificationToken({
          phone: result.phone,
          shopDomain,
          method: VERIFICATION_TAGS.WHATSAPP_LOGIN,
        }),
      });
    }

    return Response.json(result);
  } catch (error) {
    console.error("WhatsApp login status error:", error);
    return Response.json({ status: "expired" });
  }
};
