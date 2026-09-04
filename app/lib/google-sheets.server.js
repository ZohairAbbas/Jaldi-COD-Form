import { google } from "googleapis";
import prisma from "../db.server.js";

/**
 * Google Sheets integration — per-merchant OAuth, Drive picker, and Sheets append.
 *
 * Each merchant connects their own Google account (offline access → refresh token).
 * The cron sync (see proxy.$.jsx) reads new Order / AbandonedCart records and appends
 * them as rows into the merchant's chosen spreadsheet, mapped per `columnMapping`.
 */

const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ============================================================
// FIELD CATALOG — drives both the column-mapping UI dropdown
// and the row builder. Mirrors Releasit's field list.
// ============================================================
export const FIELD_CATALOG = [
  { id: "empty", label: "Empty" },
  { id: "custom_text", label: "Custom text", hasValue: true },
  { id: "creation_date_full", label: "Creation date (YYYY-MM-DD HH:MM:SS)" },
  { id: "creation_date_iso", label: "Creation date (YYYY-MM-DDTHH:MM:SSZ)" },
  { id: "creation_date", label: "Creation date (YYYY-MM-DD)" },
  { id: "first_name", label: "First name" },
  { id: "last_name", label: "Last name" },
  { id: "full_name", label: "Full name" },
  { id: "company", label: "Company" },
  { id: "email", label: "Email" },
  { id: "phone", label: "Phone number" },
  { id: "order_note", label: "Order note" },
  { id: "order_type", label: "Order type (abandoned or normal)" },
  { id: "order_number", label: "Order number" },
  { id: "order_id", label: "Order ID" },
  { id: "address", label: "Address" },
  { id: "address2", label: "Address 2" },
  { id: "city", label: "City" },
  { id: "province", label: "Province" },
  { id: "postal_code", label: "Postal code" },
  { id: "country", label: "Country" },
  { id: "subtotal", label: "Subtotal" },
  { id: "shipping", label: "Shipping" },
  { id: "total", label: "Total" },
  { id: "currency", label: "Currency" },
  { id: "payment_method", label: "Payment method" },
  { id: "risk_level", label: "Risk level" },
  { id: "products", label: "Products (all in one cell)" },
  { id: "product_title", label: "Product title (per line)" },
  { id: "product_variant", label: "Product variant (per line)" },
  { id: "product_sku", label: "Product SKU (per line)" },
  { id: "product_quantity", label: "Product quantity (per line)" },
  { id: "product_price", label: "Product price (per line)" },
];

// Ready-made column presets the merchant can pick from.
export const COLUMN_PRESETS = {
  standard: [
    "order_number",
    "creation_date",
    "full_name",
    "phone",
    "email",
    "address",
    "city",
    "province",
    "products",
    "total",
  ],
  detailed: [
    "order_number",
    "order_id",
    "creation_date_full",
    "first_name",
    "last_name",
    "phone",
    "email",
    "address",
    "address2",
    "city",
    "province",
    "postal_code",
    "country",
    "products",
    "subtotal",
    "shipping",
    "total",
    "currency",
    "payment_method",
    "order_type",
    "risk_level",
    "order_note",
  ],
};

// ============================================================
// OAuth
// ============================================================
export function getOAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI)"
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Build the consent URL. `state` carries the shop domain so the callback can
 * associate the returned tokens with the right shop.
 */
export function getAuthUrl(shopDomain) {
  const oauth2 = getOAuthClient();
  return oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // force a refresh_token every time
    scope: SCOPES,
    state: encodeURIComponent(shopDomain),
    include_granted_scopes: true,
  });
}

/**
 * Exchange the auth code for tokens and read the connected account email.
 * @returns {{ access_token, refresh_token, expiry_date, email }}
 */
export async function exchangeCodeForTokens(code) {
  const oauth2 = getOAuthClient();
  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  let email = null;
  try {
    const oauth2Api = google.oauth2({ version: "v2", auth: oauth2 });
    const { data } = await oauth2Api.userinfo.get();
    email = data.email || null;
  } catch (err) {
    console.error("[GoogleSheets] Failed to read userinfo email:", err.message);
  }

  return {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
    email,
  };
}

/**
 * Load the shop's integration and return an authorized OAuth2 client.
 * The googleapis library auto-refreshes the access token using the refresh
 * token; we persist any refreshed access token back to the DB.
 */
export async function getAuthorizedClientForShop(shopId) {
  const integration = await prisma.googleSheetsIntegration.findUnique({
    where: { shopId },
  });
  if (!integration || !integration.refreshToken) {
    throw new Error("Google account not connected for this shop");
  }

  const oauth2 = getOAuthClient();
  oauth2.setCredentials({
    access_token: integration.accessToken || undefined,
    refresh_token: integration.refreshToken,
    expiry_date: integration.tokenExpiry
      ? new Date(integration.tokenExpiry).getTime()
      : undefined,
  });

  // Persist refreshed tokens transparently.
  oauth2.on("tokens", async (tokens) => {
    try {
      await prisma.googleSheetsIntegration.update({
        where: { shopId },
        data: {
          ...(tokens.access_token && { accessToken: tokens.access_token }),
          ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
          ...(tokens.expiry_date && { tokenExpiry: new Date(tokens.expiry_date) }),
        },
      });
    } catch (err) {
      console.error("[GoogleSheets] Failed to persist refreshed token:", err.message);
    }
  });

  return { oauth2, integration };
}

// ============================================================
// Integration health
// ============================================================

/**
 * Health states for a merchant's Google Sheets integration.
 *
 * The distinction that matters is between RECENT_ERROR and NEEDS_RECONNECT.
 * The sync runs every two minutes, so a transient Google blip produces an
 * error that resolves on its own. Alarming a merchant about that trains them
 * to ignore the warning, so only a sustained failure escalates.
 */
export const SHEETS_HEALTH = {
  NOT_CONNECTED: "not_connected",
  HEALTHY: "healthy",
  RECENT_ERROR: "recent_error",
  NEEDS_RECONNECT: "needs_reconnect",
};

/** A failure older than this is treated as needing merchant action. */
export const SHEETS_SUSTAINED_FAILURE_HOURS = 24;

/**
 * Derive integration health from a GoogleSheetsIntegration row.
 *
 * Pure, so it can run against a row the caller already has rather than
 * forcing a second query. Pass the row (or null) exactly as stored.
 *
 * Note this deliberately does NOT consult lastSyncedAt: that field is written
 * on both the success and failure paths, so it stays fresh throughout a total
 * outage. Only lastSuccessAt says whether the thing actually works.
 */
export function deriveSheetsHealth(integration, now = new Date()) {
  if (!integration || !integration.refreshToken) return SHEETS_HEALTH.NOT_CONNECTED;
  if (!integration.enabled) return SHEETS_HEALTH.NOT_CONNECTED;
  if (!integration.lastSyncError) return SHEETS_HEALTH.HEALTHY;

  const cutoff = now.getTime() - SHEETS_SUSTAINED_FAILURE_HOURS * 60 * 60 * 1000;

  // No success on record at all: fall back to how long the integration has
  // existed, so a row predating lastSuccessAt is not branded broken instantly.
  const lastGood = integration.lastSuccessAt
    ? new Date(integration.lastSuccessAt).getTime()
    : integration.createdAt
      ? new Date(integration.createdAt).getTime()
      : null;

  if (lastGood === null) return SHEETS_HEALTH.RECENT_ERROR;

  return lastGood < cutoff ? SHEETS_HEALTH.NEEDS_RECONNECT : SHEETS_HEALTH.RECENT_ERROR;
}

/**
 * Banner-shaped summary for the admin layout. Returns null when there is
 * nothing a merchant could usefully act on, so the caller can skip rendering.
 */
export async function getSheetsAlertForShop(shopId) {
  const integration = await prisma.googleSheetsIntegration.findUnique({
    where: { shopId },
    select: {
      enabled: true,
      refreshToken: true,
      lastSyncError: true,
      lastSuccessAt: true,
      createdAt: true,
      googleEmail: true,
    },
  });

  const health = deriveSheetsHealth(integration);
  if (health !== SHEETS_HEALTH.NEEDS_RECONNECT) return null;

  return {
    health,
    googleEmail: integration.googleEmail || null,
    lastSuccessAt: integration.lastSuccessAt || null,
  };
}

// ============================================================
// Drive / Sheets helpers
// ============================================================

/** List the merchant's existing spreadsheets for the picker dropdown. */
export async function listSpreadsheets(shopId) {
  const { oauth2 } = await getAuthorizedClientForShop(shopId);
  const drive = google.drive({ version: "v3", auth: oauth2 });
  const res = await drive.files.list({
    q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
    fields: "files(id, name)",
    orderBy: "modifiedTime desc",
    pageSize: 100,
    spaces: "drive",
  });
  return (res.data.files || []).map((f) => ({ id: f.id, name: f.name }));
}

/** List tab/sheet names within a spreadsheet ("Select your sheet" dropdown). */
export async function listSheetTabs(shopId, spreadsheetId) {
  const { oauth2 } = await getAuthorizedClientForShop(shopId);
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const res = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))",
  });
  return (res.data.sheets || []).map((s) => s.properties.title);
}

/** Create a new spreadsheet in the merchant's Drive; returns { id, name }. */
export async function createSpreadsheet(shopId, title) {
  const { oauth2 } = await getAuthorizedClientForShop(shopId);
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const res = await sheets.spreadsheets.create({
    requestBody: { properties: { title } },
    fields: "spreadsheetId,properties(title)",
  });
  return { id: res.data.spreadsheetId, name: res.data.properties.title };
}

/**
 * Append rows to a sheet. `sheetName` of "ALL" or empty means the first/default tab.
 * Rows is an array of arrays (each inner array = one row of cell values).
 */
export async function appendRows(oauth2, spreadsheetId, sheetName, rows) {
  if (!rows.length) return;
  const sheets = google.sheets({ version: "v4", auth: oauth2 });
  const tab = sheetName && sheetName !== "ALL" ? sheetName : null;
  const range = tab ? `${tab}!A1` : "A1";
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}

// ============================================================
// Row building — transform Order / AbandonedCart records into
// rows per the merchant's columnMapping.
// ============================================================

function parseJSON(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function formatDate(date, fieldId) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (fieldId === "creation_date") return ymd;
  if (fieldId === "creation_date_iso") return d.toISOString();
  // creation_date_full
  return `${ymd} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Normalize a record (Order row or AbandonedCart row) into a flat shape the
 * field resolver understands.
 */
function normalizeRecord(record, type) {
  if (type === "abandoned") {
    const items = parseJSON(record.cartItems, []);
    const customFields = {};
    return {
      type: "abandoned",
      orderNumber: "",
      orderId: record.id,
      firstName: record.customerFirstName || "",
      lastName: record.customerLastName || "",
      email: record.customerEmail || "",
      phone: record.customerPhone || "",
      address: "",
      address2: "",
      city: "",
      province: "",
      postalCode: "",
      country: "",
      subtotal: "",
      shipping: "",
      total: record.totalAmount ?? "",
      currency: "",
      paymentMethod: "",
      riskLevel: "",
      note: "",
      createdAt: record.createdAt || record.abandonedAt,
      items: Array.isArray(items) ? items : [],
      customFields,
    };
  }

  // normal Order
  const items = parseJSON(record.items, []);
  const customFields = parseJSON(record.customFields, {});
  return {
    type: "normal",
    orderNumber: record.shopifyOrderNumber || "",
    orderId: record.shopifyOrderId || record.id,
    firstName: record.firstName || "",
    lastName: record.lastName || "",
    email: record.email || "",
    phone: record.phone || "",
    address: record.address || "",
    address2: record.address2 || "",
    city: record.city || "",
    province: record.province || "",
    postalCode: record.postalCode || "",
    country: record.country || "",
    subtotal: record.subtotal ?? "",
    shipping: record.shipping ?? "",
    total: record.total ?? "",
    currency: customFields.currency || record.country || "",
    paymentMethod: record.paymentMethod || "",
    riskLevel: record.riskLevel || "",
    note: customFields.orderNote || "",
    createdAt: record.createdAt,
    items: Array.isArray(items) ? items : [],
    customFields,
  };
}

function productSummary(items) {
  return items
    .map((it) => {
      const qty = it.quantity || 1;
      const title = it.title || it.name || "";
      const variant =
        it.variant && it.variant !== "Default Title" ? ` (${it.variant})` : "";
      return `${qty}x ${title}${variant}`.trim();
    })
    .filter(Boolean)
    .join(", ");
}

/**
 * Resolve a single mapped field to a cell value for a given record + (optional)
 * line item (used when oneProductPerLine explodes items into multiple rows).
 */
function resolveField(colDef, rec, lineItem) {
  const field = colDef.field || "empty";
  switch (field) {
    case "empty":
      return "";
    case "custom_text":
      return colDef.value || "";
    case "creation_date":
    case "creation_date_iso":
    case "creation_date_full":
      return formatDate(rec.createdAt, field);
    case "first_name":
      return rec.firstName;
    case "last_name":
      return rec.lastName;
    case "full_name":
      return `${rec.firstName} ${rec.lastName}`.trim();
    case "company":
      return rec.customFields?.company || "";
    case "email":
      return rec.email;
    case "phone":
      return rec.phone;
    case "order_note":
      return rec.note;
    case "order_type":
      return rec.type;
    case "order_number":
      return rec.orderNumber;
    case "order_id":
      return rec.orderId;
    case "address":
      return rec.address;
    case "address2":
      return rec.address2;
    case "city":
      return rec.city;
    case "province":
      return rec.province;
    case "postal_code":
      return rec.postalCode;
    case "country":
      return rec.country;
    case "subtotal":
      return rec.subtotal;
    case "shipping":
      return rec.shipping;
    case "total":
      return rec.total;
    case "currency":
      return rec.currency;
    case "payment_method":
      return rec.paymentMethod;
    case "risk_level":
      return rec.riskLevel;
    case "products":
      return productSummary(rec.items);
    case "product_title":
      return lineItem ? lineItem.title || lineItem.name || "" : productSummary(rec.items);
    case "product_variant":
      return lineItem ? lineItem.variant || "" : "";
    case "product_sku":
      return lineItem ? lineItem.sku || "" : "";
    case "product_quantity":
      return lineItem ? lineItem.quantity ?? "" : "";
    case "product_price":
      return lineItem ? lineItem.price ?? "" : "";
    default:
      return "";
  }
}

/**
 * Build rows for a batch of records.
 * @param {object} integration - the GoogleSheetsIntegration row (columnMapping, oneProductPerLine)
 * @param {Array} records - raw Order or AbandonedCart rows
 * @param {"normal"|"abandoned"} type
 * @returns {Array<Array<string>>} rows (one or more per record)
 */
export function buildRows(integration, records, type) {
  const mapping = parseJSON(integration.columnMapping, []);
  if (!Array.isArray(mapping) || mapping.length === 0) return [];

  const rows = [];
  for (const record of records) {
    const rec = normalizeRecord(record, type);

    if (integration.oneProductPerLine && rec.items.length > 1) {
      // One row per line item; non-product fields repeat on the first row only
      // would be ambiguous, so we repeat full record fields on every line (Releasit behavior).
      for (const lineItem of rec.items) {
        rows.push(mapping.map((colDef) => stringify(resolveField(colDef, rec, lineItem))));
      }
    } else {
      const lineItem = rec.items.length === 1 ? rec.items[0] : null;
      rows.push(mapping.map((colDef) => stringify(resolveField(colDef, rec, lineItem))));
    }
  }
  return rows;
}

function stringify(value) {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}
