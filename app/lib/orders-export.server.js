import prisma from "../db.server.js";
import { buildRows, FIELD_CATALOG, COLUMN_PRESETS } from "./google-sheets.server.js";

/**
 * CSV export of a shop's COD orders.
 *
 * Column mapping is shared with the Google Sheets integration rather than
 * defined separately: a merchant who has configured their sheet columns gets
 * the same columns in the download, and there is one field catalogue to
 * maintain instead of two. Merchants with no Sheets setup fall back to the
 * standard preset.
 */

/** Hard ceiling on a single export, to keep the whole file in memory safely. */
export const EXPORT_ROW_LIMIT = 50000;

/**
 * Escape one cell for CSV.
 *
 * Two separate problems are handled here:
 *
 * 1. Structural — quotes, commas and newlines must be quoted, with embedded
 *    quotes doubled, or the file parses wrongly.
 *
 * 2. Formula injection — Excel and Sheets execute a cell beginning with
 *    = + - @, or with a leading tab/carriage return before one of those. Every
 *    value here is customer-supplied (names, addresses, order notes), so a
 *    hostile value could run a formula on the merchant's machine when they open
 *    the file. Prefixing with an apostrophe makes the cell literal text, which
 *    spreadsheets strip on display.
 */
export function escapeCsvCell(value) {
  let s = value == null ? "" : String(value);

  if (/^[\t\r]*[=+\-@]/.test(s)) {
    s = "'" + s;
  }

  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }

  return s;
}

/** Serialise a header plus rows into a CSV body. */
export function toCsv(header, rows) {
  const lines = [header, ...rows].map((cells) => cells.map(escapeCsvCell).join(","));
  // CRLF is what Excel expects; other tools accept it too.
  return lines.join("\r\n");
}

/** Human label for a column definition, for the header row. */
function columnLabel(colDef) {
  if (colDef.field === "custom_text") return colDef.value || "Custom text";
  const entry = FIELD_CATALOG.find((f) => f.id === colDef.field);
  return entry ? entry.label : colDef.field;
}

/**
 * The column mapping to export with.
 *
 * Uses the merchant's configured Sheets mapping when there is one, so the two
 * exports agree. Falls back to the standard preset otherwise, since an empty
 * mapping would make buildRows return no rows at all.
 */
export function resolveExportMapping(integration) {
  const configured = integration?.columnMapping;
  const parsed = typeof configured === "string" ? safeParse(configured) : configured;

  if (Array.isArray(parsed) && parsed.length > 0) {
    return { mapping: parsed, source: "sheets" };
  }

  return {
    mapping: COLUMN_PRESETS.standard.map((field) => ({ field })),
    source: "default",
  };
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * Build the CSV for one shop.
 *
 * `type` is "normal" (orders), "abandoned" (carts), or "both". Date bounds are
 * inclusive of `from` and exclusive of the day after `to`, so a merchant
 * picking the same date twice gets that whole day.
 */
export async function buildOrdersCsv({ shopId, type = "normal", from = null, to = null }) {
  const integration = await prisma.googleSheetsIntegration.findUnique({
    where: { shopId },
    select: { columnMapping: true, oneProductPerLine: true },
  });

  const { mapping, source } = resolveExportMapping(integration);

  // buildRows reads only these two fields, so a synthetic integration is enough
  // and avoids needing a real row for merchants who never connected Sheets.
  const effective = {
    columnMapping: mapping,
    oneProductPerLine: Boolean(integration?.oneProductPerLine),
  };

  const where = { shopId };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = from;
    if (to) where.createdAt.lt = to;
  }

  const rows = [];
  let truncated = false;

  if (type === "normal" || type === "both") {
    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: EXPORT_ROW_LIMIT + 1,
    });
    if (orders.length > EXPORT_ROW_LIMIT) {
      truncated = true;
      orders.length = EXPORT_ROW_LIMIT;
    }
    rows.push(...buildRows(effective, orders, "normal"));
  }

  if (type === "abandoned" || type === "both") {
    const remaining = Math.max(0, EXPORT_ROW_LIMIT - rows.length);
    if (remaining > 0) {
      const carts = await prisma.abandonedCart.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: remaining + 1,
      });
      if (carts.length > remaining) {
        truncated = true;
        carts.length = remaining;
      }
      rows.push(...buildRows(effective, carts, "abandoned"));
    }
  }

  const header = mapping.map(columnLabel);

  return {
    csv: toCsv(header, rows),
    rowCount: rows.length,
    columnSource: source,
    truncated,
  };
}

/** Filename for the download, e.g. preventify-orders-2026-09-07.csv */
export function exportFilename(type, now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const label = type === "abandoned" ? "abandoned-carts" : type === "both" ? "orders-and-carts" : "orders";
  return `preventify-${label}-${date}.csv`;
}
