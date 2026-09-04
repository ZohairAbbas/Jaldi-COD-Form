import prisma from "../db.server.js";
import {
  getAuthorizedClientForShop,
  appendRows,
  buildRows,
} from "./google-sheets.server.js";

const BATCH_LIMIT = 500; // max records per type per run, per shop

/**
 * Push new orders / abandoned orders to each enabled shop's Google Sheet.
 *
 * Cursor-based ("only new orders"): each integration tracks lastSyncedOrderAt and
 * lastSyncedAbandonedAt. We read records created after the cursor (ascending),
 * append them, and advance the cursor to the newest record written. Idempotent —
 * a failed run simply retries from the same cursor next tick.
 *
 * @returns {{ shops: number, processed: number, errors: number, byShop: object }}
 */
export async function runGoogleSheetsSync() {
  const integrations = await prisma.googleSheetsIntegration.findMany({
    where: {
      enabled: true,
      refreshToken: { not: null },
      spreadsheetId: { not: null },
    },
  });

  const summary = { shops: integrations.length, processed: 0, errors: 0, byShop: {} };

  for (const integration of integrations) {
    const shopResult = { orders: 0, abandoned: 0, error: null };
    try {
      const { oauth2 } = await getAuthorizedClientForShop(integration.shopId);
      const filter = integration.orderTypeFilter || "normal";

      // ---- Normal orders ----
      if (filter === "normal" || filter === "both") {
        const written = await syncNormalOrders(integration, oauth2);
        shopResult.orders = written;
        summary.processed += written;
      }

      // ---- Abandoned orders ----
      if (filter === "abandoned" || filter === "both") {
        const written = await syncAbandonedOrders(integration, oauth2);
        shopResult.abandoned = written;
        summary.processed += written;
      }

      // lastSuccessAt is only ever written here, on the success path. That is
      // what makes it usable as a health signal — unlike lastSyncedAt, which
      // the failure path below also updates.
      const now = new Date();
      await prisma.googleSheetsIntegration.update({
        where: { id: integration.id },
        data: { lastSyncedAt: now, lastSuccessAt: now, lastSyncError: null },
      });
    } catch (error) {
      const details =
        error?.response?.data?.error ||
        error?.response?.data ||
        error?.errors ||
        null;
      const fullMsg = details ? `${error.message} :: ${JSON.stringify(details)}` : error.message;
      console.error(`[GoogleSheets] sync failed for shop ${integration.shopId}:`, fullMsg);
      shopResult.error = fullMsg;
      summary.errors++;
      try {
        await prisma.googleSheetsIntegration.update({
          where: { id: integration.id },
          data: { lastSyncedAt: new Date(), lastSyncError: fullMsg.slice(0, 500) },
        });
      } catch {
        /* ignore */
      }
    }
    summary.byShop[integration.shopId] = shopResult;
  }

  return summary;
}

async function syncNormalOrders(integration, oauth2) {
  const where = { shopId: integration.shopId };
  if (integration.lastSyncedOrderAt) {
    where.createdAt = { gt: integration.lastSyncedOrderAt };
  }

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: BATCH_LIMIT,
  });
  if (orders.length === 0) return 0;

  const rows = buildRows(integration, orders, "normal");
  await appendRows(oauth2, integration.spreadsheetId, integration.ordersSheetName, rows);

  const newest = orders[orders.length - 1].createdAt;
  await prisma.googleSheetsIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedOrderAt: newest },
  });
  return orders.length;
}

async function syncAbandonedOrders(integration, oauth2) {
  const where = { shopId: integration.shopId };
  if (integration.lastSyncedAbandonedAt) {
    where.createdAt = { gt: integration.lastSyncedAbandonedAt };
  }

  const carts = await prisma.abandonedCart.findMany({
    where,
    orderBy: { createdAt: "asc" },
    take: BATCH_LIMIT,
  });
  if (carts.length === 0) return 0;

  const rows = buildRows(integration, carts, "abandoned");
  // Use the separate abandoned tab if configured, otherwise the orders tab.
  const targetTab = integration.importAbandonedSeparate
    ? integration.abandonedSheetName
    : integration.ordersSheetName;
  await appendRows(oauth2, integration.spreadsheetId, targetTab, rows);

  const newest = carts[carts.length - 1].createdAt;
  await prisma.googleSheetsIntegration.update({
    where: { id: integration.id },
    data: { lastSyncedAbandonedAt: newest },
  });
  return carts.length;
}
