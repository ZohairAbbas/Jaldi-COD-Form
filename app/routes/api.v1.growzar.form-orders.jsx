import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate, tombstones } from "../lib/growzar-feed.server";
import { orderRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/form-orders — one row per order placed through the COD
 * form (pack G-PRV5-1). Tombstones: deletedFormOrderIds.
 *
 * updatedAt moves when anything this feed returns changes. A Postgres trigger
 * (growzar_order_keep_updated_at) keeps it still on writes that change nothing
 * returned here, such as the fulfillment sync's fulfillmentSyncedAt.
 */
export const loader = feedLoader("form-orders", async ({ shop, facts, query }) => {
  const rows = await db.order.findMany({
    where: { shopId: shop.id, ...pageWhere(query) },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    select: {
      id: true,
      shopifyOrderId: true,
      shopifyOrderNumber: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      paymentMethod: true,
      verificationMethod: true,
      riskLevel: true,
      subtotal: true,
      shipping: true,
      total: true,
      discounts: true,
      items: true,
      phone: true,
      city: true,
      province: true,
      country: true,
    },
  });
  const { page, pagination } = paginate(rows, query.limit);
  const deleted = await tombstones({ shopId: shop.id, entity: "order", updatedSince: query.updatedSince });

  return envelope({
    shop,
    facts,
    data: page.map((order) => orderRow(order, facts)),
    pagination,
    extra: { deletedFormOrderIds: deleted.ids, deletedFormOrderIdsTruncated: deleted.truncated },
  });
});

export const action = feedAction;
