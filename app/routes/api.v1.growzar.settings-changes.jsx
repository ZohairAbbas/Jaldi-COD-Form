import db from "../db.server";
import { envelope, feedAction, feedLoader, pageWhere, paginate } from "../lib/growzar-feed.server";
import { settingsChangeRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/settings-changes — the history behind /growzar/settings
 * (pack G-PRV5-7): one row per field change, written by the trigger on
 * "Settings". Starts at deploy with one baseline row per field.
 *
 * Append-only: updatedAt = changedAt, ordered by (changedAt, id). No tombstones.
 */
export const loader = feedLoader("settings-changes", async ({ shop, facts, query }) => {
  const rows = await db.settingsChange.findMany({
    where: { shopId: shop.id, ...pageWhere(query, "changedAt") },
    orderBy: [{ changedAt: "asc" }, { id: "asc" }],
    take: query.limit + 1,
  });
  const { page, pagination } = paginate(rows, query.limit, "changedAt");
  return envelope({ shop, facts, data: page.map(settingsChangeRow), pagination });
});

export const action = feedAction;
