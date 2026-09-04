import prisma from "../db.server.js";
import { recalculateBuyerRisk } from "./risk.server.js";

/**
 * Map Shopify FulfillmentDisplayStatus → deliveryOutcome
 */
const STATUS_MAP = {
  // Terminal: delivered
  DELIVERED: "delivered",
  // Terminal: returned
  NOT_DELIVERED: "returned",
  FAILURE: "returned",
  // Terminal: cancelled
  CANCELED: "cancelled",
  // Non-terminal
  ATTEMPTED_DELIVERY: "attempted_delivery",
  DELAYED: "delayed",
  OUT_FOR_DELIVERY: "out_for_delivery",
  IN_TRANSIT: "in_transit",
  PICKED_UP: "in_transit",
  CARRIER_PICKED_UP: "in_transit",
  // Booked
  CONFIRMED: "booked",
  FULFILLED: "booked",
  MARKED_AS_FULFILLED: "booked",
  SUBMITTED: "booked",
  READY_FOR_PICKUP: "booked",
  LABEL_PRINTED: "booked",
  LABEL_PURCHASED: "booked",
  LABEL_VOIDED: "booked",
  SCHEDULED: "booked",
};

const TERMINAL_OUTCOMES = ["delivered", "returned", "cancelled"];

/**
 * Normalize a stored shopifyOrderId to a Shopify global ID.
 *
 * Order.shopifyOrderId is not written uniformly. Orders created through the
 * app store `gid://shopify/Order/N` (order.server.js), while orders captured
 * from the orders/create webhook store the REST payload's bare numeric id
 * (webhooks.orders.create.jsx). The nodes(ids:) query below requires global
 * IDs, and Shopify rejects the ENTIRE query if any single id is malformed —
 * so one bare id used to fail its whole batch of 50 orders.
 *
 * Returns null for anything unrecognized, so a malformed row is skipped
 * rather than being allowed to poison the batch around it.
 */
function toOrderGid(shopifyOrderId) {
  if (!shopifyOrderId) return null;
  if (shopifyOrderId.startsWith("gid://")) return shopifyOrderId;
  if (/^\d+$/.test(shopifyOrderId)) return `gid://shopify/Order/${shopifyOrderId}`;
  return null;
}

// Priority for worst-status when order has multiple fulfillments (lower = worse)
const OUTCOME_PRIORITY = {
  returned: 0,
  attempted_delivery: 1,
  cancelled: 2,
  delayed: 3,
  out_for_delivery: 4,
  in_transit: 5,
  booked: 6,
  delivered: 7,
};

/**
 * Given an order's fulfillments array, pick the worst delivery outcome.
 */
function resolveDeliveryOutcome(fulfillments, orderCancelledAt, orderDisplayFulfillmentStatus) {
  if (orderCancelledAt) return { outcome: "cancelled", rawStatus: "CANCELED" };

  if (!fulfillments || fulfillments.length === 0) {
    if (orderDisplayFulfillmentStatus === "UNFULFILLED") return null;
    return null;
  }

  let worstOutcome = null;
  let worstRawStatus = null;

  for (const f of fulfillments) {
    const raw = f.displayStatus;
    const mapped = STATUS_MAP[raw] || "in_transit";
    if (worstOutcome === null || (OUTCOME_PRIORITY[mapped] ?? 99) < (OUTCOME_PRIORITY[worstOutcome] ?? 99)) {
      worstOutcome = mapped;
      worstRawStatus = raw;
    }
  }

  return worstOutcome ? { outcome: worstOutcome, rawStatus: worstRawStatus } : null;
}

/**
 * Sync fulfillment statuses for a single shop.
 * Queries Shopify for non-terminal orders and updates delivery outcomes.
 */
export async function syncShopFulfillments(shopId, shopDomain, accessToken) {
  const MAX_ORDERS_PER_RUN = 500;
  const BATCH_SIZE = 50;

  // Find Preventify orders that need syncing
  const orders = await prisma.order.findMany({
    where: {
      shopId,
      shopifyOrderId: { not: null },
      OR: [
        { deliveryOutcome: null },
        { deliveryOutcome: { notIn: TERMINAL_OUTCOMES } },
      ],
      // Give 12 hours for fulfillment creation
      createdAt: { lt: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
    select: {
      id: true,
      shopifyOrderId: true,
      phone: true,
      deliveryOutcome: true,
    },
    take: MAX_ORDERS_PER_RUN,
    orderBy: { createdAt: "asc" },
  });

  if (orders.length === 0) return { processed: 0, updated: 0, errors: 0 };

  let totalUpdated = 0;
  let totalErrors = 0;
  const phonesToRecalculate = new Set();

  for (let i = 0; i < orders.length; i += BATCH_SIZE) {
    const batch = orders.slice(i, i + BATCH_SIZE);

    // Map normalized GID → order, so the response can be matched back without
    // re-scanning the batch and without depending on how the id was stored.
    const ordersByGid = new Map();
    const malformed = [];
    for (const o of batch) {
      const gid = toOrderGid(o.shopifyOrderId);
      if (gid) ordersByGid.set(gid, o);
      else malformed.push(o.id);
    }

    if (malformed.length > 0) {
      console.error(
        `[fulfillment-sync] Skipping ${malformed.length} order(s) with unparseable shopifyOrderId for ${shopDomain}:`,
        malformed
      );
      totalErrors += malformed.length;
    }

    const orderGids = [...ordersByGid.keys()];
    if (orderGids.length === 0) continue;

    try {
      const query = `
        query($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Order {
              id
              displayFulfillmentStatus
              cancelledAt
              fulfillments {
                displayStatus
              }
            }
          }
        }
      `;

      const response = await fetch(
        `https://${shopDomain}/admin/api/2025-01/graphql.json`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Shopify-Access-Token": accessToken,
          },
          body: JSON.stringify({ query, variables: { ids: orderGids } }),
        }
      );

      // Detect invalid/expired access token (401 or Shopify auth errors)
      if (response.status === 401 || response.status === 403) {
        console.error(`[fulfillment-sync] Invalid token for ${shopDomain} (HTTP ${response.status}) — marking tokenInvalid`);
        return { processed: 0, updated: 0, errors: 0, invalidToken: true };
      }

      const result = await response.json();

      // Shopify sometimes returns errors as a string (e.g. "Unavailable Shop") or array
      const errorsArray = Array.isArray(result.errors) ? result.errors : [];
      const errorsString = typeof result.errors === "string" ? result.errors.toLowerCase() : "";

      // Mark unavailable/paused/deleted shops as invalid so they get skipped
      // permanently. Shopify returns a bare "Not Found" string for a domain that
      // no longer resolves, which this used to miss — three dead shops were
      // retried every 3 hours for months. "not found" also covers the older
      // "shop not found" wording.
      if (errorsString.includes("unavailable shop") || errorsString.includes("not found")) {
        console.error(`[fulfillment-sync] Shop unavailable for ${shopDomain}: "${result.errors}" — marking tokenInvalid`);
        return { processed: 0, updated: 0, errors: 0, invalidToken: true };
      }

      // Shopify sometimes returns 200 with an auth error in the body, and that
      // body is either an array of error objects or a bare string. Only the
      // array form was checked here, so string-form auth errors — the literal
      // "[API] Invalid API key or access token (unrecognized login or wrong
      // password)" — fell through to the generic handler below and were retried
      // every 3 hours instead of marking the shop invalid.
      const AUTH_PHRASES = ["invalid api key", "access token", "unrecognized login"];
      const authMessage =
        errorsArray.find(e =>
          AUTH_PHRASES.some(p => e.message?.toLowerCase().includes(p))
        )?.message ||
        (AUTH_PHRASES.some(p => errorsString.includes(p)) ? String(result.errors) : null);

      if (authMessage) {
        console.error(`[fulfillment-sync] Auth error for ${shopDomain}: ${authMessage} — marking tokenInvalid`);
        return { processed: 0, updated: 0, errors: 0, invalidToken: true };
      }

      // Check rate limiting
      const throttle = result.extensions?.cost?.throttleStatus;
      if (throttle && throttle.currentlyAvailable < 200) {
        console.log(`[fulfillment-sync] Rate limit low (${throttle.currentlyAvailable} points), pausing 5s`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      if (result.errors) {
        console.error(`[fulfillment-sync] GraphQL errors for ${shopDomain}:`, result.errors);
        totalErrors += batch.length;
        continue;
      }

      const nodes = result.data?.nodes || [];

      for (const node of nodes) {
        if (!node || !node.id) continue;

        const order = ordersByGid.get(node.id);
        if (!order) continue;

        const resolved = resolveDeliveryOutcome(
          node.fulfillments,
          node.cancelledAt,
          node.displayFulfillmentStatus
        );

        if (!resolved) continue;

        if (resolved.outcome !== order.deliveryOutcome) {
          try {
            await prisma.order.update({
              where: { id: order.id },
              data: {
                fulfillmentStatus: resolved.rawStatus,
                deliveryOutcome: resolved.outcome,
                fulfillmentSyncedAt: new Date(),
              },
            });
            totalUpdated++;

            if (TERMINAL_OUTCOMES.includes(resolved.outcome)) {
              phonesToRecalculate.add(order.phone);
            }
          } catch (err) {
            console.error(`[fulfillment-sync] Failed to update order ${order.id}:`, err);
            totalErrors++;
          }
        } else {
          await prisma.order.update({
            where: { id: order.id },
            data: { fulfillmentSyncedAt: new Date() },
          });
        }
      }
    } catch (err) {
      console.error(`[fulfillment-sync] Batch error for ${shopDomain}:`, err);
      totalErrors += batch.length;
    }
  }

  // Recalculate risk for buyers whose orders reached terminal state
  for (const phone of phonesToRecalculate) {
    try {
      await recalculateBuyerRisk(phone);
    } catch (err) {
      console.error(`[fulfillment-sync] Risk recalculation failed for ${phone}:`, err);
    }
  }

  return { processed: orders.length, updated: totalUpdated, errors: totalErrors };
}
