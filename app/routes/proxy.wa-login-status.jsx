import { checkWhatsAppLoginStatus } from "../lib/whatsapp.server";
import { recordFraudEvent } from "../lib/growzar-events.server";
import db from "../db.server";
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

    // Polled every few seconds, so each outcome is keyed to the login token
    // and logged once. An unknown token is ignored: it has no session behind it.
    if (result.status === "verified" || result.status === "expired") {
      logLoginOutcome(shopDomain, token, result);
    }

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

async function logLoginOutcome(shopDomain, token, result) {
  const session = await db.whatsAppLoginSession
    .findUnique({ where: { token }, select: { phone: true } })
    .catch(() => null);
  if (!session) return;
  await recordFraudEvent({
    shopDomain,
    kind: result.status === "verified" ? "otp_verified" : "otp_expired",
    channel: "whatsapp_login",
    phone: session.phone,
    dedupeKey: `login:${token}:${result.status}`,
  });
}
