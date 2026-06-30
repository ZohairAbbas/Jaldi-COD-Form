import { authenticate } from "../shopify.server";
import { getOrCreateShop } from "../lib/db.server";
import prisma from "../db.server";
import {
  listSpreadsheets,
  listSheetTabs,
  createSpreadsheet,
  getAuthUrl,
} from "../lib/google-sheets.server";

/**
 * GET /api/google-sheets — current integration state for the settings tab.
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  const integration = await prisma.googleSheetsIntegration.findUnique({
    where: { shopId: shop.id },
  });

  return { integration: integration ? sanitize(integration) : null };
}

/**
 * POST /api/google-sheets — sub-actions for the settings UI.
 * Body: { intent: "disconnect" | "listSpreadsheets" | "listTabs" | "createSpreadsheet" | "saveConfig", ... }
 */
export async function action({ request }) {
  const { session } = await authenticate.admin(request);
  const shop = await getOrCreateShop(session.shop, session.accessToken);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { intent } = body;

  try {
    switch (intent) {
      case "getAuthUrl": {
        // Build the Google consent URL here (authenticated via App Bridge session
        // token), so the client can open it directly in a popup. The popup can't
        // carry the embedded admin session, so we must NOT route the popup through
        // an authenticate.admin() route.
        const authUrl = getAuthUrl(session.shop);
        return Response.json({ success: true, authUrl });
      }

      case "disconnect": {
        await prisma.googleSheetsIntegration.deleteMany({ where: { shopId: shop.id } });
        return Response.json({ success: true });
      }

      case "listSpreadsheets": {
        const spreadsheets = await listSpreadsheets(shop.id);
        return Response.json({ success: true, spreadsheets });
      }

      case "listTabs": {
        const { spreadsheetId } = body;
        if (!spreadsheetId) {
          return Response.json({ success: false, error: "spreadsheetId required" }, { status: 400 });
        }
        const tabs = await listSheetTabs(shop.id, spreadsheetId);
        return Response.json({ success: true, tabs });
      }

      case "createSpreadsheet": {
        const title = body.title || "Preventify COD Orders";
        const created = await createSpreadsheet(shop.id, title);
        return Response.json({ success: true, spreadsheet: created });
      }

      case "saveConfig": {
        const data = pickConfig(body);
        const updated = await prisma.googleSheetsIntegration.update({
          where: { shopId: shop.id },
          data,
        });
        return Response.json({ success: true, integration: sanitize(updated) });
      }

      default:
        return Response.json({ success: false, error: "Unknown intent" }, { status: 400 });
    }
  } catch (error) {
    console.error("[GoogleSheets] api error:", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Only allow these config fields to be set from the client.
function pickConfig(body) {
  const data = {};
  const fields = [
    "enabled",
    "spreadsheetId",
    "spreadsheetName",
    "ordersSheetName",
    "abandonedSheetName",
    "importAbandonedSeparate",
    "orderTypeFilter",
    "oneProductPerLine",
    "columnMapping",
  ];
  for (const f of fields) {
    if (body[f] !== undefined) data[f] = body[f];
  }
  return data;
}

// Never expose tokens to the client.
function sanitize(integration) {
  const connected = Boolean(integration.refreshToken);
  const safe = { ...integration };
  delete safe.accessToken;
  delete safe.refreshToken;
  return { ...safe, connected };
}
