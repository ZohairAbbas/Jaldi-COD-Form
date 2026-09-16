import { lookupGlobalBuyer, normalizePhone } from "../lib/buyer.server";
import prisma from "../db.server";
import { authenticateJsonProxyRequest } from "../lib/proxy-auth.server";
import { verifyVerificationToken, resolveTrustedBypass } from "../lib/verification.server";

export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    // Returns cross-merchant buyer PII — full name, email, and every saved
    // address from every Preventify store — keyed on a phone number alone.
    // Knowing a phone number is not proof of owning it, so this now requires a
    // verification token: server-issued, short-lived, and only handed out after
    // the buyer completes WhatsApp login or an OTP for that exact number.
    //
    // Without a valid token the answer is `{exists}` and nothing else. That is
    // enough for the storefront to say "welcome back, verify to autofill"
    // without disclosing anything about who the buyer is. `exists` does leak
    // whether a phone is in the network at all, which is why this route still
    // requires a valid app-proxy signature on top.
    const { data, shopDomain, errorResponse } =
      await authenticateJsonProxyRequest(request);
    if (errorResponse) return errorResponse;

    const { phone, fingerprintId, verificationToken } = data;

    if (!phone) {
      return Response.json({ exists: false, buyer: null, fingerprintMatch: false });
    }

    // Require at least 7 digits for a valid phone lookup
    const digitsOnly = phone.replace(/\D/g, "");
    if (digitsOnly.length < 7) {
      return Response.json({ exists: false, buyer: null, fingerprintMatch: false });
    }

    const verified = Boolean(
      verifyVerificationToken(verificationToken, { phone, shopDomain })
    );

    if (!verified) {
      // Existence only. Deliberately no name, city, order count or trust level:
      // each of those is a fact about a person that an unverified caller has no
      // claim to, and together they identify someone.
      const normalized = normalizePhone(phone);
      const exists = normalized
        ? Boolean(
            await prisma.globalBuyer.findUnique({
              where: { phone: normalized },
              select: { id: true },
            })
          )
        : false;

      // Whether this buyer may skip verification — a trusted buyer on a device
      // we have seen them use before. A bare boolean, so it tells the form what
      // to do without disclosing anything about who the buyer is.
      //
      // Both halves matter: trust alone would let anyone who knows the number
      // skip, and a fingerprint alone is not secret. The skip still produces
      // `trusted_buyer_verified` and no token, so it unlocks the flow — never
      // the saved details.
      let canSkipVerification = false;
      if (exists && fingerprintId && normalized) {
        const [trusted, deviceRecord] = await Promise.all([
          resolveTrustedBypass(normalized),
          prisma.deviceFingerprint.findUnique({
            where: { fingerprintId_phone: { fingerprintId, phone: normalized } },
            select: { id: true },
          }),
        ]);
        canSkipVerification = trusted && Boolean(deviceRecord);
      }

      return Response.json({
        exists,
        canSkipVerification,
        buyer: null,
        fingerprintMatch: false,
      });
    }

    // Verified: the buyer has proved they control this number, so they get
    // their own details back — including addresses saved at other Preventify
    // stores, which is the point of the shared address book.
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

    return Response.json({ exists: Boolean(buyer), buyer, fingerprintMatch });
  } catch (error) {
    console.error("Buyer lookup error:", error);
    return Response.json({ buyer: null, fingerprintMatch: false });
  }
};
