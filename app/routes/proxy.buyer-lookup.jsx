import { lookupGlobalBuyer, normalizePhone } from "../lib/buyer.server";
import prisma from "../db.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // This route returns cross-merchant buyer PII for a bare phone number, so
    // until now anyone could enumerate the address book without naming a shop at
    // all. Requiring a verified proxy signature limits callers to real
    // storefronts; it does NOT limit *which* buyer a storefront may read.
    //
    // NOTE (PRV-2): the PII exposure itself is unchanged here — gating autofill
    // on a verified OTP session is a separate change, deliberately kept out of
    // this one so the auth rollout doesn't also alter checkout UX. The
    // cross-merchant address book is intended behaviour and stays.
    const { data, errorResponse } = await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone, fingerprintId } = data;

    if (!phone) {
      return Response.json({ buyer: null, fingerprintMatch: false });
    }

    // Require at least 7 digits for a valid phone lookup
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return Response.json({ buyer: null, fingerprintMatch: false });
    }

    // Server determines trust level and returns appropriate data
    const buyer = await lookupGlobalBuyer(phone);

    // Check if the device fingerprint matches this phone (for OTP gating)
    let fingerprintMatch = false;
    if (fingerprintId && buyer) {
      const normalized = normalizePhone(phone);
      if (normalized) {
        const deviceRecord = await prisma.deviceFingerprint.findUnique({
          where: { fingerprintId_phone: { fingerprintId, phone: normalized } },
        });
        fingerprintMatch = !!deviceRecord;
      }
    }

    return Response.json({ buyer, fingerprintMatch });
  } catch (error) {
    console.error("Buyer lookup error:", error);
    return Response.json({ buyer: null, fingerprintMatch: false });
  }
};
