import { createHash } from "node:crypto";
import prisma from "../db.server";
import { normalizePhone } from "./buyer.server";

/**
 * Writers for the dated event logs Growzar reads (pack G-PRV5-3, G-PRV5-4).
 *
 * Both are side records next to logic that already exists: they never change a
 * decision, never throw, and callers do not await them, so a logging failure
 * can never refuse or slow down an order.
 */

/** The storefront's per-tab id: random, so anything else is dropped rather than stored. */
export function cleanSid(value) {
  const sid = String(value ?? "").trim();
  return /^[A-Za-z0-9_-]{8,64}$/.test(sid) ? sid : null;
}

/** Upsell.upsellType → the offer type Growzar uses on order lines. */
export function upsellOfferType(upsellType) {
  return upsellType === "one-tick" ? "one_tick" : "upsell";
}

export const OFFER_KINDS = { impressions: "shown", accepts: "accepted", declines: "declined" };

/**
 * One offer event. A repeat of (offerId, kind, sid) is the same event and is
 * absorbed by the unique index.
 */
export async function recordOfferEvent({ shopId, offerType, offerId, kind, sid }, { db = prisma } = {}) {
  try {
    await db.offerEvent.create({ data: { shopId, offerType, offerId, kind, sessionId: cleanSid(sid) } });
  } catch (error) {
    if (error?.code !== "P2002") console.error(`[growzar-events] offer event not recorded (${offerType} ${kind}):`, error.message);
  }
}

/**
 * One fraud/verification event. `shopId` or `shopDomain` identifies the shop;
 * `dedupeKey` (hashed here) makes a step that is observed repeatedly — a polled
 * status — a single event.
 */
export async function recordFraudEvent(
  { shopId, shopDomain, kind, rule = null, channel = null, path = null, riskLevel = null, phone = null, sessionId = null, orderId = null, dedupeKey = null },
  { db = prisma } = {},
) {
  try {
    let id = shopId;
    if (!id && shopDomain) {
      id = (await db.shop.findUnique({ where: { shopifyDomain: shopDomain }, select: { id: true } }))?.id;
    }
    if (!id) return;

    const raw = phone == null || String(phone).trim() === "" ? null : String(phone).trim();
    await db.fraudEvent.create({
      data: {
        shopId: id,
        kind,
        rule,
        channel,
        path,
        riskLevel,
        // Normalised the way the rest of Preventify stores phones, so GDPR
        // redaction finds the row; raw only when it cannot be normalised.
        phone: raw ? normalizePhone(raw) || raw : null,
        sessionId: sessionId ? String(sessionId).slice(0, 100) : null,
        orderId,
        dedupeKey: dedupeKey ? createHash("sha256").update(String(dedupeKey)).digest("hex") : null,
      },
    });
  } catch (error) {
    if (error?.code !== "P2002") console.error(`[growzar-events] fraud event not recorded (${kind}):`, error.message);
  }
}

/**
 * The stat routes' hook: `auth` is requireProxyShop's result, `offer` the row
 * the counter update returned. The counters keep their old behaviour; the
 * dated log only takes calls whose app-proxy signature verified and whose
 * offer belongs to that shop, so one shop's storefront cannot skew another's.
 */
export async function recordOfferStat({ auth, offer, offerType, stat, sid }, { db = prisma } = {}) {
  try {
    const kind = OFFER_KINDS[stat];
    if (!kind || !auth?.verified || !auth.shopDomain || !offer?.shopId) return;
    const shop = await db.shop.findUnique({ where: { shopifyDomain: auth.shopDomain }, select: { id: true } });
    if (shop?.id !== offer.shopId) return;
    await recordOfferEvent({ shopId: offer.shopId, offerType, offerId: offer.id, kind, sid }, { db });
  } catch (error) {
    console.error(`[growzar-events] offer stat not recorded (${offerType}):`, error.message);
  }
}
