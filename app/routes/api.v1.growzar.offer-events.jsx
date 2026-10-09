import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate, tombstones } from "../lib/growzar-feed.server";
import { offerEventRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/offer-events — dated shown / accepted / declined events
 * (pack G-PRV5-3), one per offer, kind and storefront tab. History starts at
 * deploy. `accepted` is a click, not a purchase. The stat routes stay
 * unauthenticated beyond the app-proxy signature, so treat `shown` counts as
 * indicative. Append-only; tombstones (deletedOfferEventIds) only for a shop purge.
 */
export const loader = feedLoader("offer-events", async ({ shop, facts, query }) => {
  const rows = await db.offerEvent.findMany({
    where: { shopId: shop.id, ...pageWhere(query) },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
  });
  const { page, pagination } = paginate(rows, query.limit);
  const deleted = await tombstones({ shopId: shop.id, entity: "offer_event", updatedSince: query.updatedSince });
  return envelope({
    shop,
    facts,
    data: page.map(offerEventRow),
    pagination,
    extra: { deletedOfferEventIds: deleted.ids, deletedOfferEventIdsTruncated: deleted.truncated },
  });
});

export const action = feedAction;
