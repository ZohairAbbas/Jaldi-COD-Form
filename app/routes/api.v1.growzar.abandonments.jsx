import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate, tombstones } from "../lib/growzar-feed.server";
import { abandonmentRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/abandonments — COD-form sessions the cron marked
 * abandoned (pack G-PRV5-2). Tombstones: deletedAbandonmentIds.
 *
 * updatedAt moves when anything returned here changes; the draft-order retry
 * bookkeeping (lastError, lastFailedAt, the draft order id) does not move it
 * (trigger growzar_abandoned_cart_keep_updated_at).
 */
export const loader = feedLoader("abandonments", async ({ shop, facts, query }) => {
  const rows = await db.abandonedCart.findMany({
    where: { shopId: shop.id, ...pageWhere(query) },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
    select: {
      id: true,
      sessionId: true,
      abandonedAt: true,
      totalAmount: true,
      cartItems: true,
      customerPhone: true,
      customerEmail: true,
      recovered: true,
      recoveredAt: true,
      recoveredOrderId: true,
      retryCount: true,
      updatedAt: true,
    },
  });
  const { page, pagination } = paginate(rows, query.limit);
  const deleted = await tombstones({ shopId: shop.id, entity: "abandoned_cart", updatedSince: query.updatedSince });

  return envelope({
    shop,
    facts,
    data: page.map((cart) => abandonmentRow(cart, facts)),
    pagination,
    extra: { deletedAbandonmentIds: deleted.ids, deletedAbandonmentIdsTruncated: deleted.truncated },
  });
});

export const action = feedAction;
