import prisma from "../db.server";
import { lookupGlobalBuyer } from "../lib/buyer.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";
import { verifyVerificationToken } from "../lib/verification.server";

/**
 * Device-based buyer lookup (Layer 2 fallback when localStorage is empty)
 *
 * POST /proxy/device-lookup
 * Body: { fingerprintId: string }
 * Returns: { phone: string, buyer: {...} } | { phone: null }
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Turns a device fingerprint into a phone number, and a trusted buyer's
    // full profile. The fingerprint is not a secret — it is derived from
    // browser characteristics and is guessable in principle — so it cannot
    // stand in for proof of identity.
    //
    // The phone number alone is returned for a fingerprint match, which is what
    // makes returning-buyer prefill work on a known device. The buyer's saved
    // details require a verification token for that same number, exactly as in
    // buyer-lookup.
    const { data, shopDomain, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { fingerprintId, verificationToken } = data;

    if (!fingerprintId || typeof fingerprintId !== "string") {
      return Response.json({ phone: null });
    }

    const deviceRecord = await prisma.deviceFingerprint.findFirst({
      where: { fingerprintId },
      orderBy: { lastSeenAt: "desc" },
    });

    if (!deviceRecord) {
      return Response.json({ phone: null });
    }

    // Update lastSeenAt non-blocking
    prisma.deviceFingerprint
      .update({
        where: { id: deviceRecord.id },
        data: { lastSeenAt: new Date() },
      })
      .catch((err) =>
        console.error("[device-lookup] Failed to update lastSeenAt:", err)
      );

    // Without a token proving control of this number, the phone is all the
    // caller gets — enough to prefill the field they were going to type anyway,
    // and enough for the form to offer verification.
    const verified = Boolean(
      verifyVerificationToken(verificationToken, {
        phone: deviceRecord.phone,
        shopDomain,
      })
    );

    if (!verified) {
      return Response.json({ phone: deviceRecord.phone });
    }

    const buyer = await lookupGlobalBuyer(deviceRecord.phone);

    if (!buyer) {
      return Response.json({ phone: deviceRecord.phone });
    }

    // Trusted → full data; recognized → phone only for prefill
    if (buyer.trustLevel === "trusted") {
      return Response.json({ phone: deviceRecord.phone, buyer });
    } else {
      return Response.json({ phone: deviceRecord.phone });
    }
  } catch (error) {
    console.error("[device-lookup] Error:", error);
    return Response.json({ phone: null });
  }
};
