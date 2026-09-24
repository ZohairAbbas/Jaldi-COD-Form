import process from "node:process";
import { authenticate } from "../shopify.server";
import { claimUrl, getGrowzarConfig, mintClaimToken } from "../lib/growzar.server";

/**
 * POST /app/growzar-claim — mints the "Open in Growzar" token (API-CONTRACT
 * §10, D-10). Called by OpenInGrowzarButton with App Bridge's fetch, which
 * attaches the admin session token.
 *
 * Ownership is proven here, not by the merchant typing anything:
 *
 * 1. `authenticate.admin` verifies the App Bridge session token — signed with
 *    our API secret, audience our API key, unexpired — and gives the shop from
 *    its `dest` claim. A request without one never reaches the code below.
 * 2. Preventify stores offline sessions only, which carry no user. So the same
 *    session token is exchanged with Shopify for an *online* access token,
 *    whose `associated_user` is Shopify's own statement of who is at the
 *    keyboard: their user ID, email, and whether they own the store. That
 *    online token is used for nothing else and not stored.
 *
 * The token is returned inside a URL fragment for the browser to open, and is
 * never logged.
 */

const ONLINE_TOKEN = "urn:shopify:params:oauth:token-type:online-access-token";

/**
 * Shopify's token exchange, asked for an online token so it names the user.
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/token-exchange
 */
export async function fetchAssociatedUser({ shop, sessionToken, fetchImpl = fetch }) {
  const response = await fetchImpl(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: process.env.SHOPIFY_API_KEY,
      client_secret: process.env.SHOPIFY_API_SECRET,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: ONLINE_TOKEN,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`token exchange returned HTTP ${response.status}`);
  const body = await response.json();
  return body?.associated_user ?? null;
}

const refuse = (status, error) => Response.json({ error }, { status });

export const action = async ({ request }) => {
  if (request.method !== "POST") return refuse(405, "Method not allowed");

  // Step 1. Throws a Response (401 / bounce) for anything unverified.
  const { session, sessionToken: verified } = await authenticate.admin(request);

  if (!getGrowzarConfig()) {
    return refuse(503, "Growzar is not configured on this app yet.");
  }

  // The raw token authenticate.admin just validated. The button always posts
  // with App Bridge fetch, so it is in the Authorization header.
  const raw = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!raw || !verified?.sub) {
    return refuse(401, "Open this from inside the Shopify admin.");
  }

  // Step 2.
  let user;
  try {
    user = await fetchAssociatedUser({ shop: session.shop, sessionToken: raw });
  } catch (error) {
    console.error(`[growzar] could not identify the admin user for ${session.shop}: ${error.message}`);
    return refuse(502, "Shopify did not confirm who you are. Try again in a moment.");
  }

  // The online token must describe the same person the session token does.
  if (!user?.id || String(user.id) !== String(verified.sub) || !user.email) {
    console.error(`[growzar] associated user did not match the session token for ${session.shop}`);
    return refuse(403, "Shopify did not confirm who you are.");
  }

  const token = mintClaimToken({
    shop: session.shop,
    shopifyUserId: `gid://shopify/StaffMember/${user.id}`,
    email: user.email,
    isStoreOwner: user.account_owner === true,
    locale: user.locale || null,
  });

  return Response.json(
    { url: claimUrl(token) },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const loader = () => refuse(405, "Method not allowed");
