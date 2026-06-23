import { getShopByDomain } from "../lib/db.server";
import { buildStorefrontConfig } from "../lib/storefront-config.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "Shop parameter is required" }, { status: 400 });
  }

  try {
    const shopData = await getShopByDomain(shop);

    if (!shopData) {
      return Response.json({ error: "Shop not found" }, { status: 404 });
    }

    // Detect app path from request URL (e.g., /apps/preventify/ or /apps/preventify-staging/)
    const appPath = url.pathname.match(/\/apps\/[^\/]+\//)?.[0] || '/apps/preventify/';

    // Static config payload (shared with the metafield sync — single source of truth).
    const config = await buildStorefrontConfig(shopData);

    // Layer on per-request / env-dependent values that don't belong in the
    // static metafield (appPath, secrets). These are merged client-side onto the
    // inlined window.PREVENTIFY_SETTINGS as well.
    return Response.json({
      ...config,
      appPath,
      ENV: {
        MIXPANEL_TOKEN: process.env.MIXPANEL_TOKEN || "",
      },
      settings: {
        ...config.settings,
        // WhatsApp verification (business phone for deep link)
        whatsappBusinessPhone: process.env.WHATSAPP_BUSINESS_PHONE || null,
      },
    });
  } catch (error) {
    console.error("Error fetching storefront config:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
};
