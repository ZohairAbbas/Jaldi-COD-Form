import { incrementUpsellStat } from "../lib/db.server";

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const upsellId = url.searchParams.get("upsellId");
  const stat = url.searchParams.get("stat");

  if (!upsellId) {
    return Response.json({ error: "upsellId parameter is required" }, { status: 400 });
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
    await incrementUpsellStat(upsellId, dbStat);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error tracking upsell stat:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

// Allow GET requests to return method not allowed
export const loader = async () => {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
