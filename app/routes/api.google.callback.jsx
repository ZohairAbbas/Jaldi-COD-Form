import prisma from "../db.server";
import { exchangeCodeForTokens } from "../lib/google-sheets.server";

/**
 * GET /api/google/callback?code=...&state=<shopDomain>
 *
 * Google redirects the top-level browser tab here after consent. There is no
 * Shopify embedded session in this context, so we identify the shop from the
 * `state` param (the shop domain we set in getAuthUrl). We exchange the code for
 * tokens, persist them on the shop's GoogleSheetsIntegration, then render a tiny
 * page that closes the tab and tells the opener (the settings page) to refresh.
 */
function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function closingPage(message, ok) {
  return htmlResponse(`<!doctype html>
<html><head><meta charset="utf-8"><title>Google Sheets</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f6f6f7;color:#202223}div{text-align:center;padding:24px}</style>
</head><body>
<div>
  <h2>${ok ? "✅ Connected" : "⚠️ Connection failed"}</h2>
  <p>${message}</p>
  <p>You can close this window and return to the app.</p>
</div>
<script>
  try { if (window.opener) { window.opener.postMessage({ type: "google-sheets-connected", ok: ${ok} }, "*"); } } catch (e) {}
  setTimeout(function(){ try { window.close(); } catch(e){} }, 1500);
</script>
</body></html>`);
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return closingPage(`Google returned: ${error}`, false);
  }
  if (!code || !state) {
    return closingPage("Missing authorization code.", false);
  }

  const shopDomain = decodeURIComponent(state);

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Resolve shop (must already exist from app install).
    const shop = await prisma.shop.findUnique({
      where: { shopifyDomain: shopDomain },
    });
    if (!shop) {
      return closingPage("Shop not found. Please reinstall the app.", false);
    }

    await prisma.googleSheetsIntegration.upsert({
      where: { shopId: shop.id },
      create: {
        shopId: shop.id,
        googleEmail: tokens.email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
      update: {
        googleEmail: tokens.email,
        accessToken: tokens.access_token,
        // Only overwrite refreshToken when Google returns a new one
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });

    return closingPage(`Connected as ${tokens.email || "your Google account"}.`, true);
  } catch (err) {
    console.error("[GoogleSheets] callback error:", err);
    return closingPage("Could not complete Google sign-in. Please try again.", false);
  }
}
