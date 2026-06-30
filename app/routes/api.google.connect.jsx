import { authenticate } from "../shopify.server";
import { getAuthUrl } from "../lib/google-sheets.server";

/**
 * GET /api/google/connect
 *
 * Starts the Google OAuth flow. Opened in a top-level browser tab (not the
 * embedded iframe — Google blocks framing its consent screen). Authenticates
 * the admin session to identify the shop, then 302-redirects to Google's consent.
 */
export async function loader({ request }) {
  const { session } = await authenticate.admin(request);

  try {
    const authUrl = getAuthUrl(session.shop);
    return new Response(null, {
      status: 302,
      headers: { Location: authUrl },
    });
  } catch (error) {
    console.error("[GoogleSheets] connect error:", error.message);
    return new Response(
      `Google integration is not configured: ${error.message}`,
      { status: 500, headers: { "Content-Type": "text/plain" } }
    );
  }
}
