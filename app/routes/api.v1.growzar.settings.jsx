import db from "../db.server";
import { envelope, feedAction, feedLoader, paginate } from "../lib/growzar-feed.server";
import { settingsRow } from "../lib/growzar-rows";

/**
 * GET /api/v1/growzar/settings — the shop's verification settings, one row
 * (pack G-PRV5-7). Their history is /growzar/settings-changes.
 *
 * updatedAt is the latest SettingsChange for the shop, so it moves only when a
 * field returned here changes. No tombstones: the row is deleted only with the
 * shop, which then answers 410.
 */
export const loader = feedLoader("settings", async ({ shop, facts, query }) => {
  const settings = await db.settings.findUnique({ where: { shopId: shop.id } });
  let rows = [];
  if (settings) {
    const last = await db.settingsChange.findFirst({
      where: { shopId: shop.id },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      select: { changedAt: true },
    });
    const row = settingsRow(settings, last?.changedAt);
    const at = new Date(row.updatedAt);
    const after = query.cursor
      ? at > query.cursor.updatedAt || (at.getTime() === query.cursor.updatedAt.getTime() && row.id > query.cursor.id)
      : !query.updatedSince || at >= query.updatedSince;
    if (after) rows = [row];
  }
  const { page, pagination } = paginate(rows, query.limit);
  return envelope({ shop, facts, data: page, pagination });
});

export const action = feedAction;
