import { incrementDownsellStat } from "../lib/db.server";
import { recordOfferStat } from "../lib/growzar-events.server";
import { requireProxyShop, ProxyAuthError } from "../lib/proxy-auth.server";

export const action = async ({ request }) => {
  // Counters only, but unauthenticated they let anyone skew a merchant's downsell
  // analytics. Params are on the query string, not a JSON body.
  let auth;
  try {
    auth = await requireProxyShop(request, { requireShopRecord: false });
  } catch (error) {
    if (error instanceof ProxyAuthError) return error.response;
    throw error;
  }

  const url = new URL(request.url);
  const downsellId = url.searchParams.get("downsellId");
  const stat = url.searchParams.get("stat");

  if (!downsellId) {
    return Response.json({ error: "downsellId parameter is required" }, { status: 400 });
  }

  if (!stat) {
    return Response.json({ error: "Stat parameter is required" }, { status: 400 });
  }

  // Map frontend stat names to database field names
  const statMap = {
    impression: "impressions",
    accept: "accepts",
    decline: "declines",
  };

  const dbStat = statMap[stat];
  if (!dbStat) {
    return Response.json(
      { error: "Invalid stat. Must be one of: impression, accept, decline" },
      { status: 400 }
    );
  }

  try {
    const offer = await incrementDownsellStat(downsellId, dbStat);
    // Dated event beside the counter (Growzar, pack G-PRV5-3). Not awaited.
    recordOfferStat({ auth, offer, offerType: "downsell", stat: dbStat, sid: url.searchParams.get("sid") });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error tracking downsell stat:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

// Allow GET requests to return method not allowed
export const loader = async () => {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
