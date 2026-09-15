import prisma from "../db.server.js";

/**
 * Customer profiles and OTP verification.
 *
 * The SMS sending path (smsmobileapi.com) was removed: that provider is no
 * longer used and its route, `proxy/otp-send`, had no live caller. WhatsApp is
 * the only channel now — `sendWhatsAppOTP` in whatsapp.server writes to the
 * same OTPSession table, so `verifyOTP` below still serves it.
 *
 * `hasVerifiedOTP` was removed alongside it: it was never called from anywhere,
 * and the equivalent check now lives in verification.server, which reads both
 * channels rather than only OTPSession.
 */

/**
 * Verify OTP entered by customer
 */
export async function verifyOTP(shopId, phone, otpCode) {
  // Find the most recent unexpired, unverified OTP for this phone
  const otpSession = await prisma.oTPSession.findFirst({
    where: {
      shopId,
      phone,
      verified: false,
      expiresAt: { gte: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpSession) {
    return { success: false, error: "OTP expired or not found. Please request a new one." };
  }

  // Check max attempts (3)
  if (otpSession.attempts >= 3) {
    return { success: false, error: "Too many attempts. Please request a new OTP." };
  }

  // Increment attempts
  await prisma.oTPSession.update({
    where: { id: otpSession.id },
    data: { attempts: { increment: 1 } },
  });

  // Verify OTP
  if (otpSession.otp !== otpCode) {
    const remaining = 2 - otpSession.attempts; // Already incremented
    return {
      success: false,
      error: remaining > 0
        ? `Incorrect OTP. ${remaining} attempt(s) remaining.`
        : "Too many attempts. Please request a new OTP.",
    };
  }

  // Mark as verified
  await prisma.oTPSession.update({
    where: { id: otpSession.id },
    data: { verified: true },
  });

  return { success: true };
}


/**
 * Look up customer profile by phone (for auto-fill on phone blur)
 */
export async function lookupCustomer(shopId, phone) {
  const customer = await prisma.customerProfile.findUnique({
    where: {
      shopId_phone: { shopId, phone },
    },
  });

  if (!customer) {
    return null;
  }

  return {
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    address: customer.address,
    address2: customer.address2,
    city: customer.city,
    province: customer.province,
    postalCode: customer.postalCode,
  };
}

/**
 * Create or update customer profile after successful order
 */
export async function upsertCustomerProfile(shopId, orderData) {
  const phone = orderData.phone;
  if (!phone) return null;

  return await prisma.customerProfile.upsert({
    where: {
      shopId_phone: { shopId, phone },
    },
    update: {
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || undefined,
      address: orderData.address,
      address2: orderData.address2 || undefined,
      city: orderData.city,
      province: orderData.province,
      postalCode: orderData.postalCode || undefined,
      totalOrders: { increment: 1 },
      lastOrderAt: new Date(),
    },
    create: {
      shopId,
      phone,
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || null,
      address: orderData.address,
      address2: orderData.address2 || null,
      city: orderData.city,
      province: orderData.province,
      postalCode: orderData.postalCode || null,
      countryCode: orderData.countryCode || "PAK",
      totalOrders: 1,
      firstOrderAt: new Date(),
      lastOrderAt: new Date(),
    },
  });
}
