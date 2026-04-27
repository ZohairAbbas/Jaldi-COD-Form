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
    const orderGids = batch.map(o => o.shopifyOrderId);

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

      // Shopify sometimes returns 200 with an auth error in the body
      const authError = result.errors?.find(e =>
        e.message?.toLowerCase().includes("invalid api key") ||
        e.message?.toLowerCase().includes("access token") ||
        e.message?.toLowerCase().includes("unrecognized login")
      );
      if (authError) {
        console.error(`[fulfillment-sync] Auth error for ${shopDomain}: ${authError.message} — marking tokenInvalid`);
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

        const order = batch.find(o => o.shopifyOrderId === node.id);
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
