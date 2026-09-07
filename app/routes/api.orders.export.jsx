import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import { buildOrdersCsv, exportFilename } from "../lib/orders-export.server";

const VALID_TYPES = ["normal", "abandoned", "both"];

/**
 * GET /api/orders/export?type=normal&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Streams the shop's orders back as a CSV download. Scoped to the authenticated
 * shop — the shopId comes from the session, never from a query parameter, so a
 * merchant cannot request another shop's orders.
 */
export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const url = new URL(request.url);
  const type = url.searchParams.get("type") || "normal";
  if (!VALID_TYPES.includes(type)) {
    return Response.json({ error: "Invalid type" }, { status: 400 });
  }

  const from = parseDate(url.searchParams.get("from"));
  // `to` is inclusive of the chosen day, so advance to the following midnight.
  const toParam = parseDate(url.searchParams.get("to"));
  const to = toParam ? new Date(toParam.getTime() + 24 * 60 * 60 * 1000) : null;

  if (from && to && from >= to) {
    return Response.json({ error: "Start date must be before end date" }, { status: 400 });
  }

  try {
    const { csv, rowCount, truncated } = await buildOrdersCsv({
      shopId: shop.id,
      type,
      from,
      to,
    });

    return new Response(
      // A UTF-8 BOM makes Excel read the file as UTF-8. Without it, Urdu and
      // Arabic names in a COD export open as mojibake on Windows.
      "﻿" + csv,
      {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${exportFilename(type)}"`,
          "Cache-Control": "no-store",
          "X-Export-Rows": String(rowCount),
          "X-Export-Truncated": String(truncated),
        },
      }
    );
  } catch (error) {
    console.error("[orders-export] failed:", error);
    return Response.json(
      { error: "Could not build the export. Please try again." },
      { status: 500 }
    );
  }
};

/** Accepts YYYY-MM-DD; returns null for absent or unparseable input. */
function parseDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
