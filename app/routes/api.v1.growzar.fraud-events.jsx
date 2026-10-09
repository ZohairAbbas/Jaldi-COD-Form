import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate, tombstones } from "../lib/growzar-feed.server";
import { fraudEventRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/fraud-events — refusals and verification steps (pack
 * G-PRV5-4): blocked, quantity_gate, repeat_order_gate, otp_sent,
 * otp_verified, otp_failed, otp_expired. History starts at deploy.
 * Append-only; tombstones (deletedFraudEventIds) when GDPR redaction removes a
 * buyer's events.
 */
export const loader = feedLoader("fraud-events", async ({ shop, facts, query }) => {
  const rows = await db.fraudEvent.findMany({
    where: { shopId: shop.id, ...pageWhere(query) },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
  });
  const { page, pagination } = paginate(rows, query.limit);
  const deleted = await tombstones({ shopId: shop.id, entity: "fraud_event", updatedSince: query.updatedSince });
  return envelope({
    shop,
    facts,
    data: page.map((event) => fraudEventRow(event, facts)),
    pagination,
    extra: { deletedFraudEventIds: deleted.ids, deletedFraudEventIdsTruncated: deleted.truncated },
  });
});

export const action = feedAction;
