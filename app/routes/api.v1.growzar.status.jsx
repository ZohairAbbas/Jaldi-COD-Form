import db from "../db.server";
import { appVersion, growzarError, verifyPlatformRequest } from "../lib/growzar.server";

/**
 * GET /api/v1/growzar/status — API-CONTRACT §11.
 *
 * Growzar asks whether Preventify is installed on a shop (auto-connect, D-03)
 * and what it can do there this release. Authenticated with the platform key
 * and the request signature (§2.1); the key alone gets a 401.
 *
 * `capabilities` lists the read feeds this release serves (Phase 5): each
 * entry appears only once its feed ships, which is how Growzar knows what it
 * can read here.
 */

/**
 * Installed means Shopify still lets us act for the shop: an offline session
 * exists (the uninstall webhook deletes it) and the token has not been marked
 * revoked by a 401 (the fallback for an uninstall webhook that never arrived).
 * The Shop row alone proves nothing — it outlives the install.
 */
async function isInstalled(shop, { prisma = db } = {}) {
  const session = await prisma.session.findFirst({
    where: { shop, isOnline: false },
    select: { id: true },
  });
  if (!session) return false;

  const shopRow = await prisma.shop.findUnique({
    where: { shopifyDomain: shop },
    select: { tokenInvalid: true },
  });
  return !shopRow?.tokenInvalid;
}

export const loader = async ({ request }) => {
  const auth = await verifyPlatformRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const installed = await isInstalled(auth.shop);
    return Response.json({
      installed,
      appVersion: appVersion(),
      shop: auth.shop,
      capabilities: ["form_orders:read", "abandonments:read", "settings:read", "offers:read", "fraud_events:read"],
      planRelevantFeatures: [],
    });
  } catch (error) {
    console.error("[growzar] status lookup failed:", error.message);
    return growzarError(500, "internal_error", "Could not read install state.");
  }
};

export const action = () => growzarError(405, "bad_request", "Status is a GET.");
