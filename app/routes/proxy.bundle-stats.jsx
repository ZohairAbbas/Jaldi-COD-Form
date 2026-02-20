import { incrementBundleStat } from "../lib/db.server";

export const action = async ({ request }) => {
  const url = new URL(request.url);
  const bundleId = url.searchParams.get("bundleId");
  const stat = url.searchParams.get("stat");

  if (!bundleId) {
    return Response.json({ error: "bundleId parameter is required" }, { status: 400 });
  }

  if (!stat) {
    return Response.json({ error: "Stat parameter is required" }, { status: 400 });
  }

  const statMap = {
    impression: "impressions",
    accept: "accepts",
  };

  const dbStat = statMap[stat];
  if (!dbStat) {
    return Response.json(
      { error: "Invalid stat. Must be one of: impression, accept" },
      { status: 400 }
    );
  }

  try {
    await incrementBundleStat(bundleId, dbStat);
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error tracking bundle stat:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const loader = async () => {
  return Response.json({ error: "Method not allowed" }, { status: 405 });
};
