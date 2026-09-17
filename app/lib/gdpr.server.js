/**
 * GDPR erasure.
 *
 * The redact webhooks previously only logged, so Preventify was answering 200
 * to erasure requests — an affirmative claim it had handled them — while
 * deleting nothing.
 *
 * Preventify holds two kinds of data, and they are erased differently:
 *
 *   Shop-scoped — Order, OrderSession, AbandonedCart, CustomerProfile,
 *     BlockedUser. These belong to one merchant. A redaction from that merchant
 *     deletes them outright.
 *
 *   Network-scoped — GlobalBuyer, BuyerAddress, DeviceFingerprint,
 *     ShopBuyerProfile. These are shared across every shop the buyer has used.
 *     A redaction from one shop removes only that shop's contribution; the
 *     buyer's record survives as long as another shop still links to them.
 *
 * So a buyer active at several stores stays whole when one store redacts them,
 * and only loses their record when the last link goes. At that point no shop in
 * the network has any relationship with them, so nothing is preserved by
 * keeping it — and an anonymised row that can no longer be joined to anything
 * would only add noise to network aggregates.
 */

import prisma from "../db.server.js";
import { normalizePhone } from "./buyer.server.js";

/** Delete in chunks so a large shop cannot blow up a single statement. */
const CHUNK_SIZE = 1000;

/**
 * Erase one customer's data for one shop.
 *
 * Scoped to the requesting shop: this is not a network-wide erasure, and the
 * payload has no authority over other merchants' records.
 *
 * @param {object} params
 * @param {string} params.shopDomain The shop the request came from.
 * @param {string|null} [params.email]
 * @param {string|null} [params.phone]
 * @param {Array<string|number>} [params.orderIds] Shopify order ids from the payload.
 * @returns {Promise<object>} Counts, for the audit log.
 */
export async function redactCustomer({ shopDomain, email, phone, orderIds = [] }) {
  const normalizedPhone = normalizePhone(phone);
  const cleanEmail = email?.trim()?.toLowerCase() || null;

  // Refuse to act without at least one identifier. Otherwise the match below
  // would be an empty OR, which matches every row in the shop.
  if (!cleanEmail && !normalizedPhone && orderIds.length === 0) {
    return { skipped: true, reason: "no_identifiers" };
  }

  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true },
  });

  if (!shop) return { skipped: true, reason: "shop_not_found" };

  const counts = {};

  // Match on any identifier we were given. Phone is stored un-normalised on
  // some rows and normalised on others, so try both spellings.
  const phoneVariants = [phone, normalizedPhone].filter(Boolean);
  const orderMatch = {
    shopId: shop.id,
    OR: [
      ...(cleanEmail ? [{ email: cleanEmail }] : []),
      ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
      ...(orderIds.length
        ? [{ shopifyOrderId: { in: orderIds.map((id) => String(id)) } }]
        : []),
    ],
  };

  counts.orders = (await prisma.order.deleteMany({ where: orderMatch })).count;

  if (phoneVariants.length || cleanEmail) {
    counts.orderSessions = (
      await prisma.orderSession.deleteMany({
        where: {
          shopId: shop.id,
          OR: [
            ...(cleanEmail ? [{ userEmail: cleanEmail }] : []),
            ...(phoneVariants.length ? [{ userPhone: { in: phoneVariants } }] : []),
          ],
        },
      })
    ).count;

    counts.abandonedCarts = (
      await prisma.abandonedCart.deleteMany({
        where: {
          shopId: shop.id,
          OR: [
            ...(cleanEmail ? [{ customerEmail: cleanEmail }] : []),
            ...(phoneVariants.length ? [{ customerPhone: { in: phoneVariants } }] : []),
          ],
        },
      })
    ).count;

    counts.customerProfiles = (
      await prisma.customerProfile.deleteMany({
        where: {
          shopId: shop.id,
          OR: [
            ...(cleanEmail ? [{ email: cleanEmail }] : []),
            ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
          ],
        },
      })
    ).count;

    // BlockedUser stores the identifier in a generic `value` column.
    counts.blockedUsers = (
      await prisma.blockedUser.deleteMany({
        where: {
          shopId: shop.id,
          value: { in: [...phoneVariants, ...(cleanEmail ? [cleanEmail] : [])] },
        },
      })
    ).count;
  }

  // Network-scoped: remove this shop's link, then decide whether the buyer
  // still has a reason to exist in the network.
  if (normalizedPhone) {
    const buyer = await prisma.globalBuyer.findUnique({
      where: { phone: normalizedPhone },
      select: { id: true },
    });

    if (buyer) {
      counts.shopBuyerProfiles = (
        await prisma.shopBuyerProfile.deleteMany({
          where: { shopId: shop.id, buyerId: buyer.id },
        })
      ).count;

      const remainingLinks = await prisma.shopBuyerProfile.count({
        where: { buyerId: buyer.id },
      });

      if (remainingLinks === 0) {
        // No shop still knows this buyer. Addresses cascade from GlobalBuyer;
        // fingerprints are keyed by phone and must go explicitly.
        counts.deviceFingerprints = (
          await prisma.deviceFingerprint.deleteMany({
            where: { phone: normalizedPhone },
          })
        ).count;

        await prisma.globalBuyer.delete({ where: { id: buyer.id } });
        counts.globalBuyerDeleted = true;
      } else {
        counts.globalBuyerDeleted = false;
        counts.remainingShopLinks = remainingLinks;
      }
    }
  }

  return { skipped: false, ...counts };
}

/**
 * Erase everything belonging to one shop. Fires 48h after uninstall.
 *
 * Deletes the shop's own rows, then removes network buyers left with no shop
 * links at all. A buyer who also shops elsewhere keeps their record and their
 * autofill — this shop's departure is not their erasure request.
 *
 * @param {object} params
 * @param {string} params.shopDomain
 * @returns {Promise<object>} Counts, for the audit log.
 */
export async function redactShop({ shopDomain }) {
  const shop = await prisma.shop.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true },
  });

  if (!shop) return { skipped: true, reason: "shop_not_found" };

  const counts = {};

  // Buyers this shop knew, captured before the links are removed.
  const linkedBuyerIds = (
    await prisma.shopBuyerProfile.findMany({
      where: { shopId: shop.id },
      select: { buyerId: true },
    })
  ).map((p) => p.buyerId);

  // ShopBuyerProfile.shopId has NO foreign key to Shop (unlike every other
  // shop-scoped model), so deleting the Shop row would leave these orphaned
  // rather than cascading. Delete them explicitly.
  counts.shopBuyerProfiles = (
    await prisma.shopBuyerProfile.deleteMany({ where: { shopId: shop.id } })
  ).count;

  // These do cascade from Shop, but deleting them in chunks first keeps the
  // final statement small enough to avoid a long lock on a large shop.
  for (const [key, model] of [
    ["orders", prisma.order],
    ["orderSessions", prisma.orderSession],
    ["abandonedCarts", prisma.abandonedCart],
    ["customerProfiles", prisma.customerProfile],
    ["blockedUsers", prisma.blockedUser],
  ]) {
    counts[key] = await deleteInChunks(model, { shopId: shop.id });
  }

  // Buyers left with no link to any shop have nothing to preserve them.
  counts.globalBuyersDeleted = 0;
  for (const buyerId of linkedBuyerIds) {
    const remaining = await prisma.shopBuyerProfile.count({ where: { buyerId } });
    if (remaining > 0) continue;

    const buyer = await prisma.globalBuyer.findUnique({
      where: { id: buyerId },
      select: { phone: true },
    });
    if (!buyer) continue;

    await prisma.deviceFingerprint.deleteMany({ where: { phone: buyer.phone } });
    await prisma.globalBuyer.delete({ where: { id: buyerId } });
    counts.globalBuyersDeleted++;
  }

  return { skipped: false, ...counts };
}

/**
 * Delete rows in batches, so one statement never targets an unbounded set.
 */
async function deleteInChunks(model, where) {
  let total = 0;
  for (;;) {
    const batch = await model.findMany({
      where,
      select: { id: true },
      take: CHUNK_SIZE,
    });
    if (batch.length === 0) break;

    const { count } = await model.deleteMany({
      where: { id: { in: batch.map((r) => r.id) } },
    });
    total += count;

    if (batch.length < CHUNK_SIZE) break;
  }
  return total;
}
