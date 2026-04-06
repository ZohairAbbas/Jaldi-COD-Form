import { lookupGlobalBuyer, normalizePhone } from "../lib/buyer.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const { phone, fingerprintId } = await request.json();

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
