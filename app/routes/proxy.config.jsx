import { buildStorefrontConfig } from "../lib/storefront-config.server";
import { requireProxyShop, ProxyAuthError } from "../lib/proxy-auth.server";

export const loader = async ({ request }) => {
  const url = new URL(request.url);

  try {
    // The storefront's first call, and it returns merchant settings plus the
    // Mixpanel token — so the shop must come from the signature, not the query
    // string. Note this is a GET: the signature is over the query parameters,
    // which is exactly what Shopify signs.
    let shopData;
    try {
      ({ shop: shopData } = await requireProxyShop(request, {
        fallbackShopDomain: url.searchParams.get("shop"),
      }));
    } catch (error) {
      if (error instanceof ProxyAuthError) return error.response;
      throw error;
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
