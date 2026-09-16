import { verifyOTP } from "../lib/sms.server";
import { markBuyerVerified } from "../lib/buyer.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";
import { issueVerificationToken, VERIFICATION_TAGS } from "../lib/verification.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Success here marks the buyer globally verified, which is what PRV-6 will
    // treat as proof of verification — so the caller must be a real storefront.
    const { data, shop: shopData, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone, otp } = data;

    if (!phone || !otp) {
      return Response.json({ error: "Phone and OTP are required" }, { status: 400 });
    }

    const result = await verifyOTP(shopData.id, phone, otp);

    // On successful OTP verification, mark buyer as globally verified
    if (result.success) {
      try {
        await markBuyerVerified(phone);
      } catch (err) {
        console.error("Failed to mark buyer verified:", err);
      }

      // The token is what later releases this buyer's saved details. Issued
      // only here and on WhatsApp login — the two points where the server has
      // actually seen proof the caller controls this number.
      return Response.json({
        ...result,
        verificationToken: issueVerificationToken({
          phone,
          shopDomain: shopData.shopifyDomain,
          method: VERIFICATION_TAGS.WHATSAPP_OTP,
        }),
      });
    }

    return Response.json(result);
  } catch (error) {
    console.error("OTP verify error:", error);
    return Response.json(
      { error: error.message || "Failed to verify OTP" },
      { status: 500 }
    );
  }
};
