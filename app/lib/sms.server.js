import prisma from "../db.server.js";

/**
 * Generate a random 6-digit OTP
 */
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send OTP via smsmobileapi.com
 */
export async function sendOTP(shopId, phone) {
  const apiKey = process.env.SMS_API_KEY;
  if (!apiKey) {
    throw new Error("SMS_API_KEY is not configured");
  }

  // Rate limit: max 3 OTPs per phone per 15 minutes
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const recentOTPs = await prisma.oTPSession.count({
    where: {
      shopId,
      phone,
      createdAt: { gte: fifteenMinutesAgo },
    },
  });

  if (recentOTPs >= 3) {
    throw new Error("Too many OTP requests. Please try again later.");
  }

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  // Find existing customer profile
  const customer = await prisma.customerProfile.findUnique({
    where: {
      shopId_phone: { shopId, phone },
    },
  });

  // Store OTP in database
  const otpSession = await prisma.oTPSession.create({
    data: {
      shopId,
      phone,
      otp,
      expiresAt,
      customerId: customer?.id || null,
    },
  });

  // Send SMS via smsmobileapi.com
  const message = `Your verification code is: ${otp}. Valid for 5 minutes.`;
  const smsUrl = `https://api.smsmobileapi.com/sendsms/?apikey=${encodeURIComponent(apiKey)}&recipients=${encodeURIComponent(phone)}&message=${encodeURIComponent(message)}`;

  try {
    const response = await fetch(smsUrl);
    if (!response.ok) {
      console.error("SMS API error:", response.status, await response.text());
    }
  } catch (error) {
    console.error("SMS send error:", error);
  }

  return { success: true, sessionId: otpSession.id };
}

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
 * Check if phone has a verified OTP session (for order submission validation)
 */
export async function hasVerifiedOTP(shopId, phone) {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  const verified = await prisma.oTPSession.findFirst({
    where: {
      shopId,
      phone,
      verified: true,
      createdAt: { gte: fiveMinutesAgo },
    },
  });
  return !!verified;
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
