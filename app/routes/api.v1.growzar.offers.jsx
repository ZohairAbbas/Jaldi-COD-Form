import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate, tombstones } from "../lib/growzar-feed.server";
import { offerRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/offers — every upsell, one-tick, downsell and bundle the
 * shop has (pack G-PRV5-3), from three tables as one list. Tombstones:
 * deletedOfferIds (offers are hard-deleted from the Sales Booster screens; the
 * order lines that used them keep the id).
 *
 * updatedAt is each table's own @updatedAt, so it also moves when a lifetime
 * counter increments. A shop has tens of offers, so the re-sends stay small.
 */
const SELECT = {
  upsell: {
    id: true, name: true, enabled: true, upsellType: true, discountType: true, discountValue: true, upsellPrice: true,
    impressions: true, accepts: true, declines: true, createdAt: true, updatedAt: true,
  },
  downsell: {
    id: true, name: true, enabled: true, discountType: true, discountValue: true,
    impressions: true, accepts: true, declines: true, createdAt: true, updatedAt: true,
  },
  bundle: {
    id: true, name: true, enabled: true, status: true, bundleType: true, comboDiscountType: true, comboDiscountValue: true,
    impressions: true, accepts: true, createdAt: true, updatedAt: true,
  },
};

export const loader = feedLoader("offers", async ({ shop, facts, query }) => {
  // Each table returns at most limit+1 rows past the cursor; merged and cut
  // in the same (updatedAt, id) order, that is exactly the next page.
  const lists = await Promise.all(
    Object.entries(SELECT).map(async ([source, select]) =>
      (
        await db[source].findMany({
          where: { shopId: shop.id, ...pageWhere(query) },
          orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
          take: query.limit + 1,
          select,
        })
      ).map((offer) => ({ source, offer, updatedAt: offer.updatedAt, id: offer.id })),
    ),
  );
  const merged = lists
    .flat()
    .sort((a, b) => a.updatedAt - b.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const { page, pagination } = paginate(merged, query.limit);
  const deleted = await tombstones({ shopId: shop.id, entity: "offer", updatedSince: query.updatedSince });
  return envelope({
    shop,
    facts,
    data: page.map(({ source, offer }) => offerRow(source, offer, facts)),
    pagination,
    extra: { deletedOfferIds: deleted.ids, deletedOfferIdsTruncated: deleted.truncated },
  });
});

export const action = feedAction;
