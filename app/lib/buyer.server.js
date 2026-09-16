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
  // Strip trunk zero after country code (e.g. +920300... → +92300...)
  if (cleaned.startsWith("+92") && /^\+920\d/.test(cleaned)) {
    cleaned = cleaned.replace("+920", "+92");
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
 *
 * Returns trust-appropriate data:
 * - Trusted: full name, email, complete address
 * - Recognized: firstName, city, province only
 * - Unknown: null
 *
 * IMPORTANT: this returns cross-merchant PII and performs no authorisation of
 * its own. Knowing a phone number is not proof of owning it, so every caller
 * that can be reached from a storefront must establish that separately — see
 * `proxy.buyer-lookup`, which requires a verification token before calling this
 * at all. Kept as a pure data function so the authorisation decision lives at
 * the route, in one place, rather than being half-enforced here.
 */
export async function lookupGlobalBuyer(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  const buyer = await prisma.globalBuyer.findUnique({
    where: { phone: normalized },
    include: {
      addresses: {
        orderBy: [{ isDefault: "desc" }, { lastUsedAt: "desc" }],
        take: 5,
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
      preferredPaymentMethod: buyer.preferredPaymentMethod || null,
      lastCity: buyer.lastCity || null,
      lastProvince: buyer.lastProvince || null,
      // All saved addresses (for address picker dropdown)
      addresses: buyer.addresses.map((a) => ({
        id: a.id,
        label: a.label,
        address: a.address,
        address2: a.address2,
        city: a.city,
        province: a.province,
        postalCode: a.postalCode,
        country: a.country,
        isDefault: a.isDefault,
      })),
      // Convenience: first address as single object (keeps existing callers working)
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
 * Updates lastVerifiedAt, which promotes them to "trusted" if they have orders.
 *
 * Upserts rather than updates. A first-time buyer verifies *before* placing
 * their first order, so there is no row yet; the previous version swallowed
 * that case and returned null, discarding the verification. It didn't show
 * because upsertGlobalBuyer then stamped lastVerifiedAt on the order anyway —
 * now that it only does so for genuinely verified orders, losing this write
 * would mean a buyer who verified never became trusted.
 */
export async function markBuyerVerified(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;

  return prisma.globalBuyer.upsert({
    where: { phone: normalized },
    update: { lastVerifiedAt: new Date() },
    create: { phone: normalized, lastVerifiedAt: new Date() },
  });
}

/**
 * Create or update GlobalBuyer + BuyerAddress + ShopBuyerProfile.
 * Called after successful order creation (dual-write alongside CustomerProfile).
 *
 * `lastVerifiedAt` is written ONLY when this order was genuinely verified.
 * It used to be stamped on every order regardless, which — combined with the
 * `totalOrdersGlobal >= 1` half of the trust test — made essentially every
 * buyer who had ever ordered "trusted", and so released full name, email and
 * the entire cross-merchant address book to anyone who knew their phone number.
 * The trust gate was effectively no gate.
 *
 * A verified order also refreshes the window, so an active buyer who keeps
 * verifying never falls out of it.
 *
 * @param {string} shopId
 * @param {object} orderData
 * @param {boolean} [orderData.verified] Whether this order carried genuine
 *   verification. Callers pass the server-resolved value, never the client's claim.
 */
export async function upsertGlobalBuyer(shopId, orderData) {
  const phone = normalizePhone(orderData.phone);
  if (!phone) return null;

  // Only a genuine verification moves the window. `undefined` rather than a
  // date leaves the stored value untouched on update.
  const verifiedAt = orderData.verified ? new Date() : undefined;

  // 1. Upsert GlobalBuyer
  const buyer = await prisma.globalBuyer.upsert({
    where: { phone },
    update: {
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || undefined,
      totalOrdersGlobal: { increment: 1 },
      ...(verifiedAt && { lastVerifiedAt: verifiedAt }),
      // Smart defaults: track last-used city/province and payment method
      ...(orderData.city && { lastCity: orderData.city }),
      ...(orderData.province && { lastProvince: orderData.province }),
      ...(orderData.paymentMethod && {
        preferredPaymentMethod: orderData.paymentMethod,
      }),
    },
    create: {
      phone,
      firstName: orderData.firstName,
      lastName: orderData.lastName,
      email: orderData.email || null,
      totalOrdersGlobal: 1,
      lastVerifiedAt: verifiedAt || null,
      lastCity: orderData.city || null,
      lastProvince: orderData.province || null,
      preferredPaymentMethod: orderData.paymentMethod || null,
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

      // Auto-label: "Address 1", "Address 2", etc. based on existing count
      const addressCount = await prisma.buyerAddress.count({
        where: { buyerId: buyer.id },
      });
      const autoLabel = `Address ${addressCount + 1}`;

      await prisma.buyerAddress.create({
        data: {
          buyerId: buyer.id,
          label: autoLabel,
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
