import prisma from "../db.server.js";

// Trust window: buyers verified within this period get full address autofill
const TRUST_WINDOW_DAYS = 90;

/**
 * Normalize phone number to canonical form for global lookup.
 * Strips spaces/dashes/parens but preserves the + prefix and country code.
 */
export function normalizePhone(phone) {
  if (!phone) return null;
  let cleaned = phone.trim().replace(/[\s\-\(\)]/g, "");
  // Convert 00 prefix to +
  if (!cleaned.startsWith("+") && cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.substring(2);
  }
  return cleaned || null;
}

/**
 * Determine trust level for a GlobalBuyer.
 * - "trusted": has orders AND verified within 90 days → full address autofill
 * - "recognized": exists but no orders or stale → preview only
 */
function getTrustLevel(buyer) {
  if (!buyer) return "unknown";

  if (buyer.totalOrdersGlobal >= 1 && buyer.lastVerifiedAt) {
    const daysSinceVerified =
      (Date.now() - new Date(buyer.lastVerifiedAt).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSinceVerified <= TRUST_WINDOW_DAYS) {
      return "trusted";
    }
  }

  return "recognized";
}

/**
 * Look up a buyer globally by phone number.
 * Returns trust-appropriate data:
 * - Trusted: full name, email, complete address
 * - Recognized: firstName, city, province only
 * - Unknown: null
 */
export async function lookupGlobalBuyer(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const buyer = await prisma.globalBuyer.findUnique({
    where: { phone: normalized },
    include: {
      addresses: {
        orderBy: [{ isDefault: "desc" }, { lastUsedAt: "desc" }],
        take: 1,
      },
    },
  });

  if (!buyer) return null;

  const trustLevel = getTrustLevel(buyer);
  const defaultAddress = buyer.addresses[0] || null;

  if (trustLevel === "trusted") {
    // Full data — buyer is trusted across the network
    return {
      trustLevel: "trusted",
      firstName: buyer.firstName,
      lastName: buyer.lastName,
      email: buyer.email,
      totalOrders: buyer.totalOrdersGlobal,
      address: defaultAddress
        ? {
            address: defaultAddress.address,
            address2: defaultAddress.address2,
            city: defaultAddress.city,
            province: defaultAddress.province,
            postalCode: defaultAddress.postalCode,
            country: defaultAddress.country,
          }
        : null,
    };
  }

  // Recognized/stale — preview only, no full address
  return {
    trustLevel: "recognized",
    firstName: buyer.firstName,
    totalOrders: buyer.totalOrdersGlobal,
    city: defaultAddress?.city || null,
    province: defaultAddress?.province || null,
  };
}

/**
 * Mark a buyer as verified (called after OTP verification or WhatsApp login).
 * Updates lastVerifiedAt which promotes them to "trusted" if they have orders.
 */
export async function markBuyerVerified(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  try {
    return await prisma.globalBuyer.update({
      where: { phone: normalized },
      data: { lastVerifiedAt: new Date() },
    });
  } catch (error) {
    // Buyer might not exist yet (first-time user verifying OTP before any order)
    // That's fine — they'll get created when they place their first order
    if (error.code === "P2025") return null;
    throw error;
  }
}

/**
 * Create or update GlobalBuyer + BuyerAddress + ShopBuyerProfile.
 * Called after successful order creation (dual-write alongside CustomerProfile).
 */
export async function upsertGlobalBuyer(shopId, orderData) {
  const phone = normalizePhone(orderData.phone);
  if (!phone) return null;

  // 1. Upsert GlobalBuyer
  const buyer = await prisma.globalBuyer.upsert({
    where: { phone },
    update: {
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || undefined,
      totalOrdersGlobal: { increment: 1 },
      lastVerifiedAt: new Date(),
    },
    create: {
      phone,
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || null,
      totalOrdersGlobal: 1,
      lastVerifiedAt: new Date(),
    },
  });

  // 2. Upsert BuyerAddress (match on buyerId + address + city to detect same address)
  if (orderData.address && orderData.city) {
    const existingAddress = await prisma.buyerAddress.findFirst({
      where: {
        buyerId: buyer.id,
        address: orderData.address,
        city: orderData.city,
      },
    });

    if (existingAddress) {
      // Update existing address: bump usage count and lastUsedAt
      await prisma.buyerAddress.update({
        where: { id: existingAddress.id },
        data: {
          address2: orderData.address2 || existingAddress.address2,
          province: orderData.province || existingAddress.province,
          postalCode: orderData.postalCode || existingAddress.postalCode,
          country: orderData.country || existingAddress.country,
          countryCode: orderData.countryCode || existingAddress.countryCode,
          lastUsedAt: new Date(),
          usageCount: { increment: 1 },
          isDefault: true,
        },
      });

      // Unset default on other addresses
      await prisma.buyerAddress.updateMany({
        where: { buyerId: buyer.id, id: { not: existingAddress.id } },
        data: { isDefault: false },
      });
    } else {
      // New address — unset default on existing, create new as default
      await prisma.buyerAddress.updateMany({
        where: { buyerId: buyer.id },
        data: { isDefault: false },
      });

      await prisma.buyerAddress.create({
        data: {
          buyerId: buyer.id,
          label: "Home",
          address: orderData.address,
          address2: orderData.address2 || null,
          city: orderData.city,
          province: orderData.province,
          postalCode: orderData.postalCode || null,
          country: orderData.country || "Pakistan",
          countryCode: orderData.countryCode || "PAK",
          isDefault: true,
          lastUsedAt: new Date(),
          usageCount: 1,
        },
      });
    }
  }

  // 3. Upsert ShopBuyerProfile
  await prisma.shopBuyerProfile.upsert({
    where: {
      shopId_buyerId: { shopId, buyerId: buyer.id },
    },
    update: {
      totalOrders: { increment: 1 },
      lastOrderAt: new Date(),
    },
    create: {
      shopId,
      buyerId: buyer.id,
      totalOrders: 1,
      firstOrderAt: new Date(),
      lastOrderAt: new Date(),
    },
  });

  return buyer;
}
